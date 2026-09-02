"""FastAPI 入口 + 全部路由（规划文档 §4 目录结构：app/main.py）。"""
import csv
import io
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from . import ai_pipeline, dashboard, rag
from .config import BASE_DIR, DATABASE_URL, LLM_MODEL, llm_enabled
from .database import DB_URL, SessionLocal, get_db, init_db
from .models import KBDoc, KBChunk, QALog, Ticket
from .schemas import (HealthOut, ImportResult, KBDocOut, QARequest, QAResponse,
                      StatusUpdate, TicketCreate, TicketOut, TicketPage)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("copilot.main")

WEB_DIR = BASE_DIR / "web"

VALID_STATUSES = ["待处理", "AI已处理", "人工处理", "已关闭"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("数据库就绪：%s", DB_URL)
    yield


app = FastAPI(title="Logistics Copilot API", version="1.0.0",
              description="跨境物流智能客服工作台：工单结构化 / RAG 知识库问答 / 运营看板",
              lifespan=lifespan)

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

app.mount("/web", StaticFiles(directory=WEB_DIR), name="web")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(WEB_DIR / "index.html")


# ---------------------------------------------------------------------------
# 健康检查 / 元信息
# ---------------------------------------------------------------------------
@app.get("/api/health", response_model=HealthOut)
def health(db: Session = Depends(get_db)):
    return HealthOut(
        status="ok",
        ai_mode="llm" if llm_enabled() else "mock",
        llm_model=LLM_MODEL,
        db_dialect=db.bind.dialect.name,
        db_url=DB_URL.split("///")[-1] if "sqlite" in DB_URL else DB_URL.split("@")[-1],
        tickets=db.query(func.count(Ticket.id)).scalar() or 0,
        kb_docs=db.query(func.count(KBDoc.id)).scalar() or 0,
        kb_chunks=db.query(func.count(KBChunk.id)).scalar() or 0,
        qa_logs=db.query(func.count(QALog.id)).scalar() or 0,
    )


# ---------------------------------------------------------------------------
# 工单：单条 AI 处理（工单台“粘贴消息”用）
# ---------------------------------------------------------------------------
def _save_ticket(db: Session, data: dict, created_at: Optional[str] = None,
                 status: str = "AI已处理", replied_at: Optional[str] = None) -> Ticket:
    ticket = Ticket(
        channel=data.get("channel"),
        raw_text=data.get("raw_text"),
        category=data.get("category"),
        urgency=data.get("urgency"),
        bill_no=data.get("bill_no"),
        container_no=data.get("container_no"),
        pol=data.get("pol"),
        pod=data.get("pod"),
        intent=data.get("intent"),
        suggested_reply=data.get("suggested_reply"),
        status=status,
        created_at=created_at or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        replied_at=replied_at,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


@app.post("/api/tickets", response_model=TicketOut)
def create_ticket(payload: TicketCreate, db: Session = Depends(get_db)):
    """粘贴一条原始求助消息 → AI 管道处理 → 入库并返回结构化工单。"""
    data = ai_pipeline.process_message(payload.raw_text, payload.channel, payload.use_llm)
    now = datetime.now()
    ticket = _save_ticket(
        db, data, created_at=now.strftime("%Y-%m-%d %H:%M:%S"),
        replied_at=(now + timedelta(seconds=5)).strftime("%Y-%m-%d %H:%M:%S"),
    )
    return _ticket_out(ticket, data["ai_mode"])


def _ticket_out(t: Ticket, ai_mode: Optional[str] = None) -> dict:
    out = TicketOut.from_orm(t).model_dump()
    out["ai_mode"] = ai_mode
    return out


# ---------------------------------------------------------------------------
# 工单：CSV / JSON 批量导入（导入接口自动跑 AI 管道）
# ---------------------------------------------------------------------------
RAW_TEXT_COLUMNS = ["raw_text", "消息内容", "内容", "message", "text", "求助内容", "原始消息"]
CHANNEL_COLUMNS = ["channel", "渠道", "来源"]
CREATED_COLUMNS = ["created_at", "时间", "创建时间", "接收时间"]


def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "gbk", "gb18030"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _parse_created(value: Optional[str]) -> Optional[str]:
    if not value or not value.strip():
        return None
    value = value.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            dt = datetime.strptime(value, fmt)
            return dt.strftime("%Y-%m-%d %H:%M:%S") if "%H" in fmt else dt.strftime("%Y-%m-%d 09:00:00")
        except ValueError:
            continue
    return None


@app.post("/api/tickets/import", response_model=ImportResult)
async def import_tickets(request: Request, file: Optional[UploadFile] = File(None),
                         db: Session = Depends(get_db)):
    """批量导入工单。

    * multipart 上传 CSV（列需含 raw_text/消息内容/内容 之一，可选 channel/created_at）
    * 或 application/json：{"messages": ["...", ...]} / {"messages": [{"raw_text": "...", "channel": "..."}]}
    每条消息都会经过 AI 管道（LLM 不可用时自动规则模式）后入库。
    """
    rows: List[dict] = []
    content_type = request.headers.get("content-type", "")
    if file is not None:
        text = _decode(await file.read())
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            raise HTTPException(400, "CSV 文件为空或格式不正确")
        headers = [h.strip().lower() for h in reader.fieldnames]

        def col(candidates):
            for cand in candidates:
                for i, h in enumerate(headers):
                    if h == cand.lower():
                        return reader.fieldnames[i]
            return None

        raw_col = col(RAW_TEXT_COLUMNS)
        channel_col = col(CHANNEL_COLUMNS)
        created_col = col(CREATED_COLUMNS)
        if raw_col is None:
            raise HTTPException(400, f"CSV 缺少消息内容列，需包含 {'/'.join(RAW_TEXT_COLUMNS)}")
        for row in reader:
            raw = (row.get(raw_col) or "").strip()
            if raw:
                rows.append({"raw_text": raw, "channel": (row.get(channel_col) or "").strip() or None,
                             "created_at": _parse_created(row.get(created_col)) if created_col else None})
    elif "application/json" in content_type:
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(400, "JSON 请求体解析失败")
        messages = body.get("messages") if isinstance(body, dict) else body
        if not isinstance(messages, list) or not messages:
            raise HTTPException(400, "JSON 需包含非空 messages 数组")
        for item in messages:
            if isinstance(item, str):
                rows.append({"raw_text": item, "channel": None, "created_at": None})
            elif isinstance(item, dict) and item.get("raw_text"):
                rows.append({"raw_text": str(item["raw_text"]), "channel": item.get("channel"),
                             "created_at": _parse_created(item.get("created_at"))})
    else:
        raise HTTPException(400, "请上传 CSV 文件（multipart/form-data）或提交 JSON {\"messages\":[...]}")

    created, failed = [], 0
    now = datetime.now()
    for row in rows:
        try:
            data = ai_pipeline.process_message(row["raw_text"], row.get("channel"))
            created_at = row.get("created_at") or now.strftime("%Y-%m-%d %H:%M:%S")
            # 导入的历史消息：AI 快速响应（2~10 分钟）作为首次响应时间
            replied = (datetime.strptime(created_at, "%Y-%m-%d %H:%M:%S")
                       + timedelta(minutes=2 + len(row["raw_text"]) % 9)
                       ).strftime("%Y-%m-%d %H:%M:%S")
            ticket = _save_ticket(db, data, created_at=created_at, replied_at=replied)
            created.append(_ticket_out(ticket, data["ai_mode"]))
        except Exception as exc:  # 单条失败不影响整批
            logger.warning("导入失败：%s %s", row.get("raw_text", "")[:30], exc)
            failed += 1

    if not created and failed:
        raise HTTPException(422, f"全部 {failed} 条导入失败")
    return ImportResult(imported=len(created), failed=failed,
                        ai_mode=created[0]["ai_mode"] if created else "mock", tickets=created)


# ---------------------------------------------------------------------------
# 工单：列表 / 详情 / 状态 / 重新处理
# ---------------------------------------------------------------------------
@app.get("/api/tickets", response_model=TicketPage)
def list_tickets(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    urgency: Optional[str] = None,
    status: Optional[str] = None,
    intent: Optional[str] = None,
    q: Optional[str] = None,
):
    query = db.query(Ticket)
    if category:
        query = query.filter(Ticket.category == category)
    if urgency:
        query = query.filter(Ticket.urgency == urgency)
    if status:
        query = query.filter(Ticket.status == status)
    if intent:
        query = query.filter(Ticket.intent == intent)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Ticket.raw_text.like(like), Ticket.bill_no.like(like),
                                 Ticket.container_no.like(like), Ticket.pod.like(like),
                                 Ticket.pol.like(like)))
    total = query.count()
    items = (
        query.order_by(Ticket.created_at.desc(), Ticket.id.desc())
        .offset((page - 1) * page_size).limit(page_size).all()
    )
    return TicketPage(total=total, page=page, page_size=page_size,
                      items=[TicketOut.from_orm(t) for t in items])


@app.get("/api/tickets/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(404, "工单不存在")
    return TicketOut.from_orm(ticket)


@app.patch("/api/tickets/{ticket_id}/status", response_model=TicketOut)
def update_status(ticket_id: int, payload: StatusUpdate, db: Session = Depends(get_db)):
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(404, "工单不存在")
    if payload.status not in VALID_STATUSES:
        raise HTTPException(400, f"status 须为 {'/'.join(VALID_STATUSES)}")
    ticket.status = payload.status
    if payload.status in ("AI已处理", "人工处理") and not ticket.replied_at:
        ticket.replied_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.commit()
    db.refresh(ticket)
    return TicketOut.from_orm(ticket)


@app.post("/api/tickets/{ticket_id}/reprocess", response_model=TicketOut)
def reprocess_ticket(ticket_id: int, db: Session = Depends(get_db)):
    """对已有工单重跑 AI 管道（如先规则导入、后配置 LLM 后使用）。"""
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(404, "工单不存在")
    data = ai_pipeline.process_message(ticket.raw_text, ticket.channel)
    for field in ("category", "urgency", "bill_no", "container_no", "pol", "pod",
                  "intent", "suggested_reply"):
        setattr(ticket, field, data.get(field))
    ticket.status = "AI已处理"
    if not ticket.replied_at:
        ticket.replied_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.commit()
    db.refresh(ticket)
    return _ticket_out(ticket, data["ai_mode"])


# ---------------------------------------------------------------------------
# 知识库：文档列表 / 详情 / RAG 问答 / 同步
# ---------------------------------------------------------------------------
@app.get("/api/kb/docs", response_model=List[KBDocOut])
def kb_docs(db: Session = Depends(get_db)):
    chunk_counts = dict(
        db.query(KBChunk.doc_id, func.count(KBChunk.id)).group_by(KBChunk.doc_id).all()
    )
    docs = db.query(KBDoc).order_by(KBDoc.id).all()
    return [
        KBDocOut(id=d.id, title=d.title, updated_at=d.updated_at,
                 chunks=chunk_counts.get(d.id, 0), preview=(d.content or "")[:80])
        for d in docs
    ]


@app.get("/api/kb/docs/{doc_id}")
def kb_doc_detail(doc_id: int, db: Session = Depends(get_db)):
    doc = db.get(KBDoc, doc_id)
    if not doc:
        raise HTTPException(404, "知识库文档不存在")
    return {"id": doc.id, "title": doc.title, "updated_at": doc.updated_at, "content": doc.content}


@app.post("/api/qa", response_model=QAResponse)
def qa(payload: QARequest, db: Session = Depends(get_db)):
    """RAG 知识库问答：检索 → 生成 → 来源标注；无命中时转人工。"""
    return rag.answer_question(db, payload.question)


@app.post("/api/kb/sync")
def kb_sync(db: Session = Depends(get_db)):
    """手动触发 kb/ → 数据库 幂等同步（平时由 scripts/sync_kb.py 执行）。"""
    stats = rag.sync_kb(db)
    return {"message": "知识库同步完成", **stats}


# ---------------------------------------------------------------------------
# 运营看板
# ---------------------------------------------------------------------------
@app.get("/api/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db)):
    return dashboard.get_summary(db)


# ---------------------------------------------------------------------------
# 问答日志（评测/审计用）
# ---------------------------------------------------------------------------
@app.get("/api/qa/logs")
def qa_logs(limit: int = Query(20, ge=1, le=200), db: Session = Depends(get_db)):
    rows = db.query(QALog).order_by(QALog.id.desc()).limit(limit).all()
    return [
        {"id": r.id, "question": r.question, "answer": r.answer,
         "source_doc_ids": json.loads(r.source_doc_ids or "[]"), "created_at": r.created_at}
        for r in rows
    ]
