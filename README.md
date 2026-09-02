# 🚢 Logistics Copilot · 跨境物流智能客服工作台

> 面向货代/跨境物流客服团队的轻量级 AI 应用：**把客服收到的非结构化求助消息（邮件/微信/电话记录）自动变成结构化工单 + 智能分类 + 建议回复，再配上知识库问答和运营看板。**
>
> FastAPI + SQLAlchemy + RAG + ECharts · 单机可跑 · 无 API Key 自动降级 mock 模式

---

## ⚠️ 模拟数据声明（诚信红线）

**本项目全程使用模拟数据**：320 条工单由 `scripts/mock_data.py` 脚本生成，20 条评测集与知识库 FAQ 均为项目组编写——**管道是真的，数据是造的**（因为没有真实生产数据）。演示界面与 README 中出现的所有指标（AI 自动处理率、响应时长、准确率等）都基于模拟数据计算，用于验证方案可行性与价值量级。项目不连接任何生产环境、不引入云服务，可完全本地离线运行。

---

## 界面预览

**运营看板**（KPI 卡片 + 近 7 日趋势 + 分类分布 + Top 意图 + 超时工单，指标全部 SQL 聚合）

![运营看板](docs/screenshots/dashboard.png)

**工单台**（粘贴原始消息 → AI 自动提取 8 字段 + 建议回复，CSV 批量导入）

![工单台](docs/screenshots/tickets.png)

**知识库问答**（RAG 检索 + 来源标注，答不上自动建议转人工）

![知识库问答](docs/screenshots/qa.png)

---

## 1. 架构

```
                          ┌──────────────────────────────────────────────┐
                          │                 FastAPI (app/main.py)        │
 模拟消息 CSV ──导入──▶    │  /api/tickets/import   工单导入+AI管道        │
 前端粘贴消息 ──▶ AI 管道  │  /api/tickets          列表/详情/状态/重处理   │
                          │  /api/qa               RAG 知识库问答          │
                          │  /api/dashboard/summary 看板聚合(SQL)         │
                          └───────┬──────────────────┬───────────────────┘
                                  │                  │
                    ┌─────────────▼──────┐  ┌────────▼──────────────────┐
                    │ AI 管道 ai_pipeline │  │ RAG  rag.py               │
                    │ ①字段提取(8字段)     │  │ kb/*.md →切块→BM25检索     │
                    │ ②分类/紧急度/意图    │  │ →拼Prompt→LLM/摘录回答     │
                    │ ③建议回复           │  │ →【来源：xxx】/无命中转人工 │
                    │ LLM↔mock 双模式降级 │  └────────┬──────────────────┘
                    └─────────┬──────────┘           │
                              │        SQLAlchemy（DATABASE_URL 可切库）
                              ▼                      ▼
                    ┌─────────────────────────────────────────┐
                    │  SQLite / PostgreSQL / MySQL             │
                    │  tickets · kb_docs · kb_chunks · qa_logs │
                    └─────────────────────────────────────────┘
                              ▲
                    单页前端 web/index.html（三区块 + ECharts，CDN 已本地化）
```

**AI 双模式与降级链路**（规划 §13 风险预案）：

```
配置了 LLM_API_KEY？ ──否──▶ mock 模式（正则提单号/柜号 + 关键词分类 + 模板回复）
        │是
        ▼
   LLM 模式（OpenAI 兼容接口，temperature=0，严格 JSON）
        │ 调用失败/超时/断网（单条粒度）
        ▼
   自动降级 mock 模式，管道永不中断；RAG 同理（LLM 失败→摘录式回答）
```

## 2. 目录结构

```
logistics-copilot-delivery/
├── app/
│   ├── main.py          # FastAPI 入口 + 全部路由
│   ├── models.py        # SQLAlchemy 模型（与 docs/schema.sql 一致）
│   ├── database.py      # 引擎/会话：只认 DATABASE_URL，可切库
│   ├── config.py        # 配置（DATABASE_URL / LLM_*，支持 .env）
│   ├── ai_pipeline.py   # 提取/分类/紧急度/意图/建议回复（LLM + mock 双模式）
│   ├── rag.py           # kb/ 同步、切块、BM25 检索、问答与来源标注
│   ├── dashboard.py     # 看板指标（全部 SQL 聚合，方言分支处理时间差）
│   ├── llm_client.py    # OpenAI 兼容客户端（httpx 直连，无 SDK 依赖）
│   └── schemas.py       # Pydantic 出入参
├── scripts/
│   ├── mock_data.py     # 生成 320 条模拟消息 → AI 管道 → 入库 + CSV 留档
│   ├── init_kb.py       # 知识库初始化（kb/ → 数据库）
│   ├── sync_kb.py       # 知识库幂等同步（Obsidian 编辑后运行）
│   ├── evaluate.py      # 20 条评测集：分类/紧急度/意图/字段 准确率
│   └── bootstrap.py     # 一键初始化（建表+数据+知识库+评测）
├── web/index.html       # 单页前端：工单台 / 知识库问答 / 运营看板
├── data/                # SQLite 默认库 + CSV（copilot.db / mock_messages.csv / import_demo.csv）
├── kb/                  # Obsidian Markdown 知识库（10 篇 FAQ，front matter 规范）
├── docs/                # 调研一页纸 / schema.sql / 评测集与报告 / 切换指南 / Obsidian 指南 / demo 脚本
├── alembic/             # Alembic 迁移预留（env.py 已接 DATABASE_URL）
└── requirements.txt
```

## 3. 快速开始（3 条命令跑起来）

```bash
# ① 安装依赖（Python 3.10+）
pip install -r requirements.txt

# ② 一键初始化：建表 + 320 条模拟工单 + 10 篇 FAQ 入库 + 跑评测
python scripts/bootstrap.py

# ③ 启动服务，浏览器打开 http://127.0.0.1:8000
python -m uvicorn app.main:app --port 8000
```

分步执行等价于：`python scripts/mock_data.py --force` → `python scripts/init_kb.py` → `python scripts/evaluate.py`。

**接入真实 LLM（可选）**：复制 `.env.example` 为 `.env`，填入任一 OpenAI 兼容服务的 Key（智谱 glm-4-flash 免费 / DeepSeek / 本地 Ollama），重启即进入 LLM 模式；导航栏徽标会显示当前 AI 模式。

```bash
# 智谱示例（.env）
LLM_API_BASE=https://open.bigmodel.cn/api/paas/v4
LLM_API_KEY=你的Key
LLM_MODEL=glm-4-flash
```

## 4. 功能清单

| 区块 | 功能 | 验收状态 |
|---|---|---|
| 工单台 | 粘贴原始消息 → AI 提取 8 字段（分类/紧急度/意图/提单号/柜号/起运港/目的港）+ 建议回复一键复制 | ✅ |
| 工单台 | CSV 批量导入（自动识别 utf-8/gbk 编码与中英文列名），逐条过 AI 管道 | ✅ |
| 工单台 | 列表筛选（分类/紧急度/状态/关键词）、详情、状态流转、重新 AI 处理 | ✅ |
| 知识库问答 | RAG 检索问答，回答带【来源：xxx】可点开源文，展示检索过程 | ✅ |
| 知识库问答 | 无命中/置信不足 → “知识库中暂无相关内容，建议转人工客服” | ✅ |
| 知识库 | kb/ 为 Obsidian 仓库，10 篇 FAQ 幂等同步（新增/修改/删除皆生效） | ✅ |
| 运营看板 | 4 KPI 卡片（今日工单量/AI 自动处理率/平均首响/高紧急占比）+ 近 7 日趋势 + 分类分布 + Top 意图 + 超时工单表，全部 SQL 聚合 | ✅ |
| 降级 | 无 Key/断网/LLM 报错 → mock 模式全流程可演示（单条粒度自动降级） | ✅ |
| 评测 | 20 条独立评测集双模式对照：mock 分类 100%；LLM（glm-4-flash）经两轮 Prompt 调优（裸 prompt 仅 40% → 补分类/紧急度标准+few-shot 后 95%~100%）分类 95%+、字段提取 100% 且幻觉 0 处；紧急度/意图对照详见 docs/evaluation_report.md | ✅ |

## 5. 接口说明

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | 单页前端 |
| GET | `/api/health` | 健康检查：AI 模式、库类型、各类计数 |
| POST | `/api/tickets` | 单条消息 → AI 管道 → 入库。Body：`{"raw_text": "...", "channel": "email"}` |
| POST | `/api/tickets/import` | CSV 文件（multipart，列 `raw_text`/`消息内容`，可选 `channel`/`created_at`）或 JSON `{"messages":[...]}` |
| GET | `/api/tickets` | 列表：`page/page_size/category/urgency/status/intent/q` |
| GET | `/api/tickets/{id}` | 工单详情 |
| PATCH | `/api/tickets/{id}/status` | 状态流转（待处理/AI已处理/人工处理/已关闭） |
| POST | `/api/tickets/{id}/reprocess` | 对已有工单重跑 AI 管道 |
| POST | `/api/qa` | RAG 问答：`{"question":"..."}` → answer + sources + mode |
| GET | `/api/kb/docs` / `/api/kb/docs/{id}` | 知识库文档列表/详情 |
| POST | `/api/kb/sync` | 手动触发 kb/ → 数据库幂等同步 |
| GET | `/api/dashboard/summary` | 看板聚合（KPI + 趋势 + 分布 + 超时表） |
| GET | `/api/qa/logs` | 问答日志（评测/审计） |

交互式文档：启动后访问 `/docs`（Swagger UI）。

## 6. 数据库切换（SQLite → PostgreSQL / MySQL）

连接串只从 `DATABASE_URL` 读取（默认 `sqlite:///data/copilot.db`），ORM 层无 SQLite 专属语法，切换零改码：

```bash
DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/logistics_copilot   # 需 pip install "psycopg[binary]"
DATABASE_URL=mysql+pymysql://user:password@localhost:3306/logistics_copilot?charset=utf8mb4  # 需 pip install pymysql
```

完整步骤、Alembic 迁移用法与可移植性设计说明 → **[docs/数据库切换指南.md](docs/数据库切换指南.md)**

## 7. Obsidian 知识库管理

`kb/` 目录用 Obsidian 直接打开即可维护（front matter 四件套：`title/category/tags/updated_at`），保存后运行 `python scripts/sync_kb.py` 幂等同步入库（增/改/删皆生效），问答即刻生效并自动标注来源。

完整规范、切块与置信判据说明 → **[docs/Obsidian知识库管理指南.md](docs/Obsidian知识库管理指南.md)**

## 8. 交付物索引

| 文档 | 内容 |
|---|---|
| [docs/业务调研一页纸.md](docs/业务调研一页纸.md) | 货代客服的一天、三大痛点、痛点→系统/AI/自动化需求映射、价值预估 |
| [docs/schema.sql](docs/schema.sql) | 数据模型 DDL（与规划文档 §4 一致） |
| [docs/eval_set.json](docs/eval_set.json) | 20 条独立评测集（人工标注） |
| [docs/evaluation_report.md](docs/evaluation_report.md) | 评测报告（由 scripts/evaluate.py 生成） |
| [docs/数据库切换指南.md](docs/数据库切换指南.md) | SQLite→PostgreSQL/MySQL 切换 + Alembic |
| [docs/Obsidian知识库管理指南.md](docs/Obsidian知识库管理指南.md) | 知识库维护规范与同步机制 |

## 9. 已知边界（诚实说明）

- 双模式评测对照（20 条标注集）：分类 mock 100% / LLM 95%~100%（glm-4-flash，两轮 Prompt 调优：40% → 95%+，字段幻觉 3 处 → 0）；紧急度 LLM 65%、意图 LLM 80%——差距来自标注口径的主观性与轻量模型能力边界，报告见 docs/evaluation_report.md（“没有评测就是盲调”，这正是保留双模式对照的意义）；
- 关键词检索（BM25）无语义泛化能力，同义改写可能拒答（宁可转人工、不编造，是刻意的产品决策）；语料扩大后可平滑升级向量检索；
- 全部数据为模拟（见顶部声明）；生产落地第一步是拿历史真实工单离线评测一个月（见调研一页纸）。
