"""运营看板：全部指标用 SQL 聚合（规划文档 §9），前端零写死数字。

可移植性说明：
* 日期分组/今日判断用 substr(created_at,1,10) + 字符串比较 —— 三库通用标准 SQL；
* “响应时长”需要时间差函数，属数据库方言差异，此处按方言分支：
  SQLite julianday / MySQL TIMESTAMPDIFF / PostgreSQL EXTRACT(EPOCH FROM ...)，
  其他方言自动回退为取回明细后在 Python 计算兜底。
"""
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import DateTime, cast, func, text
from sqlalchemy.orm import Session

from .models import Ticket

OVERDUE_HOURS = 4  # 超时阈值：创建/响应超过 4 小时


def _seconds_expr(start_col, end_col, db: Session):
    """生成“end - start 秒数”表达式（方言分支）。"""
    dialect = db.bind.dialect.name
    if dialect == "sqlite":
        return (func.julianday(end_col) - func.julianday(start_col)) * 86400.0
    if dialect == "mysql":
        return func.timestampdiff(text("SECOND"), start_col, end_col)
    if dialect == "postgresql":
        # created_at 为 ISO 文本，先转 TIMESTAMP 再求差
        return func.extract(text("EPOCH"), cast(end_col, DateTime) - cast(start_col, DateTime))
    return None


def _avg_response_seconds(db: Session) -> Optional[float]:
    expr = _seconds_expr(Ticket.created_at, Ticket.replied_at, db)
    if expr is not None:
        try:
            value = db.query(func.avg(expr)).filter(Ticket.replied_at.isnot(None)).scalar()
            return float(value) if value is not None else None
        except Exception:  # 方言不支持则回退 Python 计算
            pass
    rows = db.query(Ticket.created_at, Ticket.replied_at).filter(Ticket.replied_at.isnot(None)).all()
    total, count = 0.0, 0
    fmt = "%Y-%m-%d %H:%M:%S"
    for created, replied in rows:
        try:
            delta = (datetime.strptime(replied, fmt) - datetime.strptime(created, fmt)).total_seconds()
            total += delta
            count += 1
        except (ValueError, TypeError):
            continue
    return total / count if count else None


def get_summary(db: Session) -> dict:
    """看板聚合：4 个 KPI + 近 7 日趋势 + 分类分布 + Top 意图 + 超时工单。"""
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    seven_days_ago = (now - timedelta(days=6)).strftime("%Y-%m-%d")

    total = db.query(func.count(Ticket.id)).scalar() or 0

    # ---- KPI 1：今日工单量 ----
    today_count = (
        db.query(func.count(Ticket.id))
        .filter(func.substr(Ticket.created_at, 1, 10) == today)
        .scalar() or 0
    )

    # ---- KPI 2：AI 自动处理率（状态=AI已处理 / 总数）----
    ai_count = (
        db.query(func.count(Ticket.id)).filter(Ticket.status == "AI已处理").scalar() or 0
    )
    ai_rate = round(ai_count / total * 100, 1) if total else 0.0

    # ---- KPI 3：平均首次响应时长（分钟）----
    avg_seconds = _avg_response_seconds(db)
    avg_response_minutes = round(avg_seconds / 60, 1) if avg_seconds is not None else None

    # ---- KPI 4：高紧急占比 ----
    urgent_count = db.query(func.count(Ticket.id)).filter(Ticket.urgency == "高").scalar() or 0
    urgent_rate = round(urgent_count / total * 100, 1) if total else 0.0

    # ---- 近 7 日工单趋势（折线）----
    trend_rows = (
        db.query(
            func.substr(Ticket.created_at, 1, 10).label("day"),
            func.count(Ticket.id).label("cnt"),
        )
        .filter(func.substr(Ticket.created_at, 1, 10) >= seven_days_ago)
        .group_by(func.substr(Ticket.created_at, 1, 10))
        .order_by(func.substr(Ticket.created_at, 1, 10))
        .all()
    )
    trend_map = {day: cnt for day, cnt in trend_rows}
    trend = [
        {"date": (now - timedelta(days=i)).strftime("%Y-%m-%d"),
         "count": trend_map.get((now - timedelta(days=i)).strftime("%Y-%m-%d"), 0)}
        for i in range(6, -1, -1)
    ]

    # ---- 分类分布（饼图）----
    category_dist = [
        {"name": name or "未知", "value": cnt}
        for name, cnt in db.query(Ticket.category, func.count(Ticket.id))
        .group_by(Ticket.category)
        .order_by(func.count(Ticket.id).desc())
        .all()
    ]

    # ---- Top 意图（条形）----
    top_intents = [
        {"name": name or "未知", "value": cnt}
        for name, cnt in db.query(Ticket.intent, func.count(Ticket.id))
        .group_by(Ticket.intent)
        .order_by(func.count(Ticket.id).desc())
        .limit(5)
        .all()
    ]

    # ---- 状态分布（看板辅助）----
    status_dist = [
        {"name": name or "未知", "value": cnt}
        for name, cnt in db.query(Ticket.status, func.count(Ticket.id))
        .group_by(Ticket.status)
        .all()
    ]

    # ---- 超时工单：待处理超 4 小时，或响应耗时超 4 小时 ----
    overdue_cutoff = (now - timedelta(hours=OVERDUE_HOURS)).strftime("%Y-%m-%d %H:%M:%S")
    overdue_rows = (
        db.query(Ticket)
        .filter(
            (Ticket.status == "待处理") & (Ticket.created_at <= overdue_cutoff)
            | (Ticket.replied_at.isnot(None)) & _overdue_replied_expr(db, overdue_cutoff)
        )
        .order_by(Ticket.created_at.asc())
        .limit(10)
        .all()
    )
    overdue = []
    for t in overdue_rows:
        waiting = _hours_between(t.created_at, t.replied_at or now.strftime("%Y-%m-%d %H:%M:%S"))
        overdue.append({
            "id": t.id,
            "channel": t.channel,
            "category": t.category,
            "urgency": t.urgency,
            "intent": t.intent,
            "status": t.status,
            "created_at": t.created_at,
            "replied_at": t.replied_at,
            "waiting_hours": round(waiting, 1) if waiting is not None else None,
            "raw_text": (t.raw_text or "")[:60],
        })

    return {
        "generated_at": now.strftime("%Y-%m-%d %H:%M:%S"),
        "kpi": {
            "today_count": today_count,
            "total": total,
            "ai_rate": ai_rate,
            "ai_count": ai_count,
            "avg_response_minutes": avg_response_minutes,
            "urgent_rate": urgent_rate,
            "urgent_count": urgent_count,
        },
        "trend": trend,
        "category_dist": category_dist,
        "top_intents": top_intents,
        "status_dist": status_dist,
        "overdue": overdue,
        "overdue_hours_threshold": OVERDUE_HOURS,
    }


def _overdue_replied_expr(db: Session, cutoff: str):
    """响应耗时超阈值的 SQL 条件（方言分支；异常时退化为仅查待处理超时）。"""
    try:
        expr = _seconds_expr(Ticket.created_at, Ticket.replied_at, db)
        if expr is not None:
            return expr > OVERDUE_HOURS * 3600
    except Exception:
        pass
    return Ticket.replied_at.is_(None) & Ticket.id.is_(None)  # 恒假占位


def _hours_between(start: str, end: str) -> Optional[float]:
    try:
        fmt = "%Y-%m-%d %H:%M:%S"
        return (datetime.strptime(end, fmt) - datetime.strptime(start, fmt)).total_seconds() / 3600
    except (ValueError, TypeError):
        return None
