"""SQLAlchemy 模型：与 docs/schema.sql、《物流AI客服项目规划.md》§4 逐一对应。

时间字段统一 TEXT 存 "YYYY-MM-DD HH:MM:SS"，保证三种数据库行为一致：
字符串比较即时间比较，日期分组用 substr(created_at,1,10) 等标准 SQL 完成，
ORM 层不使用任何 SQLite 专属语法。
"""
from sqlalchemy import Column, Integer, Text, UniqueConstraint

from .database import Base


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    channel = Column(Text)             # email / wechat / phone
    raw_text = Column(Text)            # 原始求助内容
    category = Column(Text)            # 仓储 / 运输 / 关务 / 账单 / 其他
    urgency = Column(Text)             # 高 / 中 / 低
    bill_no = Column(Text)             # 提单号
    container_no = Column(Text)        # 柜号
    pol = Column(Text)                 # 起运港
    pod = Column(Text)                 # 目的港
    intent = Column(Text)              # 查询 / 催件 / 投诉 / 改单 / 索赔 / 预约 / 其他
    suggested_reply = Column(Text)     # AI 建议回复
    status = Column(Text)              # 待处理 / AI已处理 / 人工处理 / 已关闭
    created_at = Column(Text)          # YYYY-MM-DD HH:MM:SS
    replied_at = Column(Text)          # 首次响应时间，NULL=未响应


class KBDoc(Base):
    __tablename__ = "kb_docs"
    __table_args__ = (UniqueConstraint("title", name="uq_kb_docs_title"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(Text)               # front matter title，幂等同步键
    content = Column(Text)             # 正文全文
    updated_at = Column(Text)


class KBChunk(Base):
    __tablename__ = "kb_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    doc_id = Column(Integer)           # kb_docs.id
    chunk_text = Column(Text)          # 检索切块


class QALog(Base):
    __tablename__ = "qa_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    question = Column(Text)
    answer = Column(Text)
    source_doc_ids = Column(Text)      # JSON 数组字符串，如 "[1,3]"
    created_at = Column(Text)
