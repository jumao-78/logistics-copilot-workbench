# AGENTS.md — AI 编码助手项目须知

> 本文件供 Claude Code / 天枢 / Cursor 等 AI 编码工具自动读取。改动代码前请先读完本页。

## 项目是什么

跨境物流智能客服工作台（Logistics Copilot）：非结构化客服消息 → LLM 结构化工单（8 字段提取/分类/紧急度/建议回复）+ RAG 知识库问答（BM25，来源标注，无命中转人工）+ SQL 聚合运营看板。FastAPI + SQLAlchemy，LLM 不可用时全链路自动降级规则（mock）模式。**所有数据为模拟数据（管道真实、数据为造），README 有声明。**

## 硬性约束（改代码前必读）

1. **数据库连接只从环境变量 `DATABASE_URL` 读取**（默认 `sqlite:///data/copilot.db`）；ORM 层禁止 SQLite 专属语法，时间字段一律 TEXT 存 `YYYY-MM-DD HH:MM:SS`，日期分组用 `substr(created_at,1,10)`，时间差用 `app/dashboard.py` 的方言分支。
2. **数据模型与目录结构不得改名偏离**：tickets / kb_docs / kb_chunks / qa_logs 四表，字段与 `docs/schema.sql` 一致。
3. `kb/` 是 Obsidian 知识库：front matter 必含 title/category/tags/updated_at；`scripts/sync_kb.py` 必须保持幂等（title 为同步键）。
4. **禁止把 `.env` 提交进 git**（内含 LLM API Key，已被 .gitignore 排除）；不得在代码/文档/日志中出现明文 Key。
5. LLM 调用必须容错：单条失败自动降级 mock，不允许抛出导致请求 500。
6. 看板指标只允许 SQL 聚合，前端禁止写死数字。

## 常用命令

```bash
pip install -r requirements.txt          # 依赖
python scripts/bootstrap.py              # 一键初始化：建表+320条模拟工单+知识库+评测
python -m uvicorn app.main:app --port 8010   # 启动（8000 被本机另一项目占用，固定用 8010）
python scripts/evaluate.py --mode mock   # 规则模式评测（报告写 docs/evaluation_report.md）
python scripts/evaluate.py --mode llm    # LLM 模式评测（需 .env 配置 Key）
python scripts/sync_kb.py                # 修改 kb/ 后同步知识库（幂等）
python scripts/mock_data.py --force      # 重置演示数据为 320 条
```

## 代码地图

```
app/
  main.py          # FastAPI 入口 + 全部路由（13 个接口）
  ai_pipeline.py   # AI 管道：LLM/mock 双模式提取、分类、紧急度、意图、建议回复
  rag.py           # 知识库同步、切块、BM25Index、retrieve 置信判据、answer_question
  dashboard.py     # 看板 SQL 聚合（含 _seconds_expr 方言分支）
  database.py      # normalize_database_url / engine / init_db
  config.py        # DATABASE_URL + LLM_* 环境变量（支持 .env）
  llm_client.py    # OpenAI 兼容 chat/completions（httpx 直连）+ JSON 宽容解析
  models.py        # 四张表的 ORM
web/index.html     # 单页前端（三区块 + ECharts，vendor 已本地化）
scripts/           # mock_data / sync_kb / init_kb / evaluate / bootstrap
docs/              # 调研一页纸、schema.sql、eval_set.json、评测报告、切换/管理指南
```

## 验收习惯

改完后端要跑：`python scripts/evaluate.py --mode mock`（分类准确率应保持 100%）；
改完前端用浏览器打开 http://127.0.0.1:8010 检查三区块；
改知识库检索要跑 `app/rag.py` 的命中/拒答回归（域外问题必须拒答）。
