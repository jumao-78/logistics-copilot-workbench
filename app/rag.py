"""RAG 知识库：Obsidian Markdown 同步入库 + 切块 + BM25 关键词检索 + 问答。

流程（规划文档 §11 Q2）：
    kb/*.md --sync_kb()--> kb_docs / kb_chunks
    question --tokenize--> BM25 检索 Top-K chunks --> 拼 Prompt --> LLM 生成
                                                      └--> mock 模式：摘录式回答
回答末尾统一追加【来源：xxx】；检索无命中时返回
“知识库中暂无相关内容，建议转人工客服”。
"""
import json
import logging
import math
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from . import llm_client
from .config import BASE_DIR, llm_enabled
from .models import KBDoc, KBChunk, QALog

logger = logging.getLogger("copilot.rag")

KB_DIR = BASE_DIR / "kb"

NO_ANSWER = "知识库中暂无相关内容，建议转人工客服"

QA_PROMPT = """仅依据下面的资料回答用户问题；资料里没有就说“知识库中暂无相关内容，建议转人工客服”。回答末尾用【来源：xxx】标注引用的文档。
资料：
{chunks}

问题：{question}"""

# ------------------------- 同步与切块 -------------------------

FRONT_MATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?", re.S)


def parse_front_matter(text: str) -> Tuple[Dict[str, str], str]:
    """解析 Obsidian YAML front matter（只支持 key: value / 行内数组，零依赖）。"""
    meta: Dict[str, str] = {}
    m = FRONT_MATTER_RE.match(text)
    if not m:
        return meta, text
    for line in m.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, _, value = line.partition(":")
        value = value.strip().strip('"').strip("'")
        if value.startswith("[") and value.endswith("]"):
            value = ", ".join(v.strip() for v in value[1:-1].split(",") if v.strip())
        meta[key.strip().lower()] = value
    return meta, text[m.end():]


def chunk_markdown(body: str, target: int = 350, max_len: int = 600) -> List[str]:
    """按小节标题/空行切分为约 target 字符的块（不超过 max_len）。

    每块自带所属小节标题，保证检索时“标题词”也能命中。
    """
    chunks: List[str] = []
    section = ""
    buf: List[str] = []
    buf_len = 0

    def flush():
        nonlocal buf, buf_len
        text = "\n".join(part for part in buf if part.strip()).strip()
        if text:
            chunks.append(f"{section}：{text}" if section else text)
        buf, buf_len = [], 0

    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            flush()
            section = stripped.lstrip("#").strip()
            continue
        if not stripped:
            continue
        if buf_len + len(stripped) > target and buf_len > target // 2:
            flush()
        buf.append(stripped)
        buf_len += len(stripped) + 1
        if buf_len >= max_len:
            flush()
    flush()
    return chunks


def sync_kb(db: Session, kb_dir: Optional[Path] = None) -> Dict[str, int]:
    """扫描 kb/ 目录 → 幂等 upsert kb_docs / kb_chunks。

    同步键：front matter 的 title（缺省用文件名）。文件内容变更则更新正文并重建切块；
    被删除的文件对应的文档也会从库里移除。重复执行结果一致。
    """
    kb_dir = kb_dir or KB_DIR
    files = sorted(p for p in kb_dir.rglob("*.md") if p.is_file())
    stats = {"scanned": len(files), "added": 0, "updated": 0, "removed": 0, "chunks": 0}

    seen_titles: List[str] = []
    for path in files:
        text = path.read_text(encoding="utf-8-sig", errors="replace")
        meta, body = parse_front_matter(text)
        title = (meta.get("title") or path.stem).strip()
        updated = meta.get("updated_at") or datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d")
        seen_titles.append(title)

        doc = db.query(KBDoc).filter(KBDoc.title == title).first()
        if doc is None:
            doc = KBDoc(title=title, content=body.strip(), updated_at=updated)
            db.add(doc)
            db.flush()
            stats["added"] += 1
        elif doc.content != body.strip() or doc.updated_at != updated:
            doc.content = body.strip()
            doc.updated_at = updated
            stats["updated"] += 1
        else:
            # 内容未变也重建切块，保证切块策略调整后可幂等重建
            pass
        db.query(KBChunk).filter(KBChunk.doc_id == doc.id).delete()
        chunks = chunk_markdown(body)
        for chunk_text in chunks:
            db.add(KBChunk(doc_id=doc.id, chunk_text=chunk_text))
        stats["chunks"] += len(chunks)

    # 清理：kb/ 中已删除的文档
    for doc in db.query(KBDoc).all():
        if doc.title not in seen_titles:
            db.query(KBChunk).filter(KBChunk.doc_id == doc.id).delete()
            db.delete(doc)
            stats["removed"] += 1

    db.commit()
    return stats


# ------------------------- BM25 检索 -------------------------

def tokenize(text: str) -> List[str]:
    """中文 bigram + 英数单词的轻量分词（零依赖，够用且可解释）。"""
    text = text.lower()
    tokens = re.findall(r"[a-z0-9]+", text)
    for seg in re.findall(r"[\u4e00-\u9fff]+", text):
        if len(seg) == 1:
            tokens.append(seg)
        else:
            tokens.extend(seg[i:i + 2] for i in range(len(seg) - 1))
    return tokens


class BM25Index:
    """极简 BM25（k1=1.5, b=0.75），语料小时性能足够、实现透明可讲解。"""

    def __init__(self, corpus: List[List[str]], k1: float = 1.5, b: float = 0.75):
        self.k1, self.b = k1, b
        self.corpus = corpus
        self.doc_len = [len(d) for d in corpus]
        self.avgdl = (sum(self.doc_len) / len(corpus)) if corpus else 0.0
        self.df: Dict[str, int] = {}
        for doc in corpus:
            for term in set(doc):
                self.df[term] = self.df.get(term, 0) + 1
        self.tf_list = []
        for doc in corpus:
            tf: Dict[str, int] = {}
            for term in doc:
                tf[term] = tf.get(term, 0) + 1
            self.tf_list.append(tf)

    def idf(self, term: str) -> float:
        n = len(self.corpus)
        df = self.df.get(term, 0)
        return math.log((n - df + 0.5) / (df + 0.5) + 1.0)

    def score(self, index: int, query: List[str]) -> float:
        tf = self.tf_list[index]
        dl = self.doc_len[index] or 1
        s = 0.0
        for term in query:
            f = tf.get(term, 0)
            if not f:
                continue
            s += self.idf(term) * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * dl / (self.avgdl or 1)))
        return s


# 疑问词/口语通用词：不携带主题信息，参与打分会造成误召回（小语料下尤其明显）
QUERY_STOPWORDS = {"怎么", "么办", "什么", "多少", "如何", "为什么", "么样", "样的",
                   "可以", "能够", "你们", "我们", "他们", "请问", "帮忙", "麻烦",
                   "一下", "已经", "还是", "以及", "需要", "什么", "怎么办"}


def _informative_tokens(query_tokens: List[str], df: Dict[str, int], n_docs: int) -> List[str]:
    """过滤单字、疑问词与高 df 通用词，保留携带主题信息的检索词。"""
    out = []
    for t in dict.fromkeys(query_tokens):
        if len(t) == 1 or t in QUERY_STOPWORDS:
            continue
        if df.get(t, 0) / n_docs > 0.45:
            continue
        out.append(t)
    return out


def retrieve(db: Session, question: str, top_k: int = 3,
             min_score: float = 1.0) -> List[dict]:
    """检索 Top-K 相关切块；不满足置信判据时返回空（触发“转人工”拒答）。

    判据（两道保险，压掉关键词检索的误召回）：
    1. BM25 最高分 ≥ min_score（信息词已过滤通用词/疑问词）；
    2. 命中信息词 ≥ 2 个；仅命中 1 个时，要求该词出现在文档标题中
       （如“改单”→《提单类型与改单电放流程》），或本身是长英文词
       （如 detention），否则视为偶然共现拒答。
    """
    rows = (
        db.query(KBChunk, KBDoc)
        .join(KBDoc, KBChunk.doc_id == KBDoc.id)
        .all()
    )
    if not rows or not question.strip():
        return []

    corpus_tokens = [tokenize(f"{doc.title} {chunk.chunk_text}") for chunk, doc in rows]
    index = BM25Index(corpus_tokens)
    query_tokens = tokenize(question)
    informative = _informative_tokens(query_tokens, index.df, len(corpus_tokens))
    if not informative:
        return []

    scored = []
    for i, (chunk, doc) in enumerate(rows):
        s = index.score(i, informative)
        if s <= 0:
            continue
        tf = index.tf_list[i]
        matched = [t for t in informative if tf.get(t)]
        scored.append({"score": s, "matched": matched, "chunk": chunk.chunk_text,
                       "doc_id": doc.id, "doc_title": doc.title})
    if not scored:
        return []
    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[0]

    def _strong_single(m: List[str], title: str) -> bool:
        if len(m) != 1:
            return False
        term = m[0].lower()
        return term in title.lower() or (term.isascii() and len(term) >= 6)

    if top["score"] < min_score or (len(top["matched"]) < 2 and not _strong_single(top["matched"], top["doc_title"])):
        return []
    return scored[:top_k]


# ------------------------- 问答 -------------------------

def answer_question(db: Session, question: str) -> dict:
    """RAG 问答主入口：检索 → 生成（LLM/摘录）→ 来源标注 → 留痕 qa_logs。"""
    question = (question or "").strip()
    hits = retrieve(db, question)

    if not hits:
        db.add(QALog(question=question, answer=NO_ANSWER, source_doc_ids=json.dumps([]),
                     created_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
        db.commit()
        return {"question": question, "answer": NO_ANSWER, "sources": [],
                "mode": "fallback", "retrieved": []}

    titles = list(dict.fromkeys(h["doc_title"] for h in hits))
    # 来源按文档去重（多篇命中同一文档时只列一次）
    sources, seen_ids = [], set()
    for h in hits:
        if h["doc_id"] not in seen_ids:
            sources.append({"id": h["doc_id"], "title": h["doc_title"]})
            seen_ids.add(h["doc_id"])
    mode = "llm" if llm_enabled() else "mock"
    answer = None

    if mode == "llm":
        chunks_text = "\n\n".join(
            f"【资料{i + 1}】《{h['doc_title']}》\n{h['chunk']}" for i, h in enumerate(hits)
        )
        try:
            answer = llm_client.chat(
                [{"role": "user", "content": QA_PROMPT.replace("{chunks}", chunks_text)
                  .replace("{question}", question)}],
                temperature=0.1,
            ).strip()
        except llm_client.LLMError as exc:
            logger.warning("RAG 问答 LLM 调用失败，降级摘录模式：%s", exc)
            mode = "mock"
            answer = None

    if not answer:
        # mock 模式：摘录式回答，直接引用最相关切块，仍然带来源
        best = hits[0]
        quote = best["chunk"]
        if len(quote) > 240:
            quote = quote[:240] + "……"
        extra = ""
        if len(titles) > 1:
            extra = f"另外可参考《{titles[1]}》中的相关说明。"
        answer = f"根据知识库《{best['doc_title']}》中的说明：\n\n{quote}\n\n{extra}".rstrip()
        mode = "mock"

    if "【来源：" not in answer:
        answer += f"\n\n【来源：{'、'.join(titles)}】"

    db.add(QALog(question=question, answer=answer,
                 source_doc_ids=json.dumps(list(dict.fromkeys(h["doc_id"] for h in hits))),
                 created_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
    db.commit()

    return {
        "question": question,
        "answer": answer,
        "sources": sources,
        "mode": mode,
        "retrieved": [h["chunk"][:80] + "……" if len(h["chunk"]) > 80 else h["chunk"] for h in hits],
    }
