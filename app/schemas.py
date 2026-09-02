"""Pydantic 模型：接口出入参校验。"""
from typing import List, Optional

from pydantic import BaseModel, Field


class TicketCreate(BaseModel):
    """粘贴原始消息 → AI 处理成工单。"""
    raw_text: str = Field(..., min_length=2, description="客服收到的原始求助内容")
    channel: Optional[str] = Field(None, description="email / wechat / phone，缺省自动识别")
    use_llm: Optional[bool] = Field(None, description="是否强制使用/禁用 LLM；缺省按配置自动")


class TicketOut(BaseModel):
    id: int
    channel: Optional[str] = None
    raw_text: Optional[str] = None
    category: Optional[str] = None
    urgency: Optional[str] = None
    bill_no: Optional[str] = None
    container_no: Optional[str] = None
    pol: Optional[str] = None
    pod: Optional[str] = None
    intent: Optional[str] = None
    suggested_reply: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[str] = None
    replied_at: Optional[str] = None
    ai_mode: Optional[str] = None

    class Config:
        from_attributes = True


class TicketPage(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[TicketOut]


class StatusUpdate(BaseModel):
    status: str = Field(..., description="待处理 / AI已处理 / 人工处理 / 已关闭")


class QARequest(BaseModel):
    question: str = Field(..., min_length=1, description="用户问题")


class SourceDoc(BaseModel):
    id: int
    title: str


class QAResponse(BaseModel):
    question: str
    answer: str
    sources: List[SourceDoc] = []
    mode: str = Field(..., description="llm / mock / fallback")
    retrieved: List[str] = Field(default_factory=list, description="命中切块预览")


class ImportResult(BaseModel):
    imported: int
    failed: int
    ai_mode: str
    tickets: List[TicketOut]


class KBDocOut(BaseModel):
    id: int
    title: str
    updated_at: Optional[str] = None
    chunks: int = 0
    preview: Optional[str] = None


class HealthOut(BaseModel):
    status: str
    ai_mode: str
    llm_model: str
    db_dialect: str
    db_url: str
    tickets: int
    kb_docs: int
    kb_chunks: int
    qa_logs: int
