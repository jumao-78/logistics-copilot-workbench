-- =====================================================================
-- Logistics Copilot 数据模型（与《物流AI客服项目规划.md》§4 保持一致）
-- 说明：
--   * 时间字段统一使用 TEXT 存储 ISO 格式 "YYYY-MM-DD HH:MM:SS"，
--     便于 SQLite/PostgreSQL/MySQL 三库可移植（字符串比较即时间比较）。
--   * 应用层通过 SQLAlchemy ORM 建表（app/models.py），本文件为等价 DDL，
--     供评审与 PostgreSQL/MySQL 手工建库参考。
--   * 数据库连接只从环境变量 DATABASE_URL 读取，默认 sqlite:///data/copilot.db
-- =====================================================================

-- ---------------------------------------------------------------
-- 工单表：客服收到的非结构化消息 → AI 结构化后的工单
-- ---------------------------------------------------------------
CREATE TABLE tickets (
  id              INTEGER PRIMARY KEY,      -- 主键
  channel         TEXT,                     -- 渠道：email / wechat / phone
  raw_text        TEXT,                     -- 客服收到的原始求助内容
  category        TEXT,                     -- 分类：仓储 / 运输 / 关务 / 账单 / 其他
  urgency         TEXT,                     -- 紧急度：高 / 中 / 低
  bill_no         TEXT,                     -- 提单号
  container_no    TEXT,                     -- 柜号
  pol             TEXT,                     -- 起运港 Port of Loading
  pod             TEXT,                     -- 目的港 Port of Discharge
  intent          TEXT,                     -- 意图：查询 / 催件 / 投诉 / 改单 / 索赔 / 预约 / 其他
  suggested_reply TEXT,                     -- AI 建议回复
  status          TEXT,                     -- 状态：待处理 / AI已处理 / 人工处理 / 已关闭
  created_at      TEXT,                     -- 创建时间
  replied_at      TEXT                      -- 首次响应时间（NULL=未响应，用于超时统计）
);

-- 常用查询索引
CREATE INDEX idx_tickets_created_at ON tickets (created_at);
CREATE INDEX idx_tickets_category   ON tickets (category);
CREATE INDEX idx_tickets_status     ON tickets (status);

-- ---------------------------------------------------------------
-- 知识库文档表：由 kb/ 目录的 Obsidian Markdown 幂等同步而来
-- 同步键：title（来自 front matter，见 docs/Obsidian知识库管理指南.md）
-- ---------------------------------------------------------------
CREATE TABLE kb_docs (
  id         INTEGER PRIMARY KEY,
  title      TEXT,                          -- 文档标题（front matter title，唯一同步键）
  content    TEXT,                          -- 正文全文（front matter 之后的 Markdown 正文）
  updated_at TEXT                          -- 文档更新时间（front matter updated_at / 文件修改时间）
);

CREATE UNIQUE INDEX idx_kb_docs_title ON kb_docs (title);

-- ---------------------------------------------------------------
-- 知识库切块表：RAG 检索的最小单元（按标题/段落切块，约 350 字符/块）
-- ---------------------------------------------------------------
CREATE TABLE kb_chunks (
  id         INTEGER PRIMARY KEY,
  doc_id     INTEGER,                       -- 关联 kb_docs.id
  chunk_text TEXT                           -- 切块文本（含所属小节标题，便于检索）
);

CREATE INDEX idx_kb_chunks_doc_id ON kb_chunks (doc_id);

-- ---------------------------------------------------------------
-- 问答日志表：每次 /api/qa 调用留痕，支撑问答可用率评测与运营分析
-- ---------------------------------------------------------------
CREATE TABLE qa_logs (
  id              INTEGER PRIMARY KEY,
  question        TEXT,                     -- 用户问题
  answer          TEXT,                     -- 系统回答（含【来源：xxx】标注 / 转人工话术）
  source_doc_ids  TEXT,                     -- 引用来源文档 id 列表（JSON 数组字符串）
  created_at      TEXT                      -- 提问时间
);

CREATE INDEX idx_qa_logs_created_at ON qa_logs (created_at);
