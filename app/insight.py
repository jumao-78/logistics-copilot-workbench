"""运营改善建议（规划文档 §5 P1）：看板聚合 → LLM 生成数字化改善建议。

双模式与全项目一致：
* llm 模式 —— 把 dashboard.get_summary 的聚合结果喂给 LLM，输出 3~5 条
  【发现问题 → 量化依据 → 可执行动作】的建议；
* mock 模式 —— 无 Key/调用失败时，按看板指标用规则模板生成（降级链路完整）。
"""
import json
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from . import dashboard, llm_client
from .config import llm_enabled

logger = logging.getLogger("copilot.insight")

INSIGHT_PROMPT = """你是物流客服运营的分析师。基于以下运营看板数据（模拟数据），给出 3~5 条可落地的数字化改善建议。
要求：
1. 每条遵循【发现问题 → 引用看板数据作为依据 → 给出可执行动作】的结构；
2. 站在客服主管视角，聚焦 AI 自动处理、响应时效、知识库、风险工单；
3. 语气专业简洁，不要空话，每条控制在 60 字内；
4. 直接输出建议编号列表，不要其他说明。
看板数据：
{summary}"""


def _num(v):
    return f"{v:.1f}" if isinstance(v, float) else str(v)


def mock_insight(summary: dict) -> str:
    """规则模板版：依据 KPI 指标生成建议（mock 降级用，仍引用真实聚合数字）。"""
    k = summary.get("kpi", {})
    items = []
    ai_rate = k.get("ai_rate", 0)
    if ai_rate < 50:
        items.append(f"AI 自动处理率仅 {_num(ai_rate)}%：优先扩充 FAQ 知识库与分类规则，把高重复的查询/催件类接入自动应答，目标提升至 60% 以上。")
    else:
        items.append(f"AI 自动处理率已达 {_num(ai_rate)}%：继续向人工处理工单抽样复盘，把高频转人工场景沉淀为新的自动规则。")

    urgent = k.get("urgent_rate", 0)
    if urgent > 15:
        items.append(f"高紧急工单占比 {_num(urgent)}%：对投诉/扣货/索赔类建立 30 分钟响应值班提醒，避免升级为客诉。")

    avg = k.get("avg_response_minutes")
    if avg is not None and avg > 240:
        items.append(f"平均首响 {_num(avg / 60)} 小时偏长：为待处理超 4 小时工单增加自动催办与升级通知，压缩首响时间。")

    overdue = summary.get("overdue", [])
    if overdue:
        items.append(f"当前有 {len(overdue)} 条超时工单：建议开启超时自动升级到主管并优先分配高紧急项。")

    intents = summary.get("top_intents", [])
    query_share = 0
    for it in intents:
        if it.get("name") == "查询":
            query_share = it.get("value", 0)
    if query_share:
        items.append(f"“查询”类工单是最主要意图（{query_share} 条）：多为流程/费用咨询，继续扩充 RAG 知识库覆盖面，可直接削减人工查询量。")

    if len(items) < 3:
        items.append(f"今日工单 {k.get('today_count', 0)} 条，整体平稳：建议每周输出一次本报告并复盘改善项落地效果。")
    # 统一编号（修复原固定前缀导致的 “2/3.” 编号错乱）
    return "\n".join(f"{i}. {t}" for i, t in enumerate(items[:5], 1))


def generate_insight(db: Session) -> dict:
    """看板 → 建议。mode: llm / mock；llm 失败自动降级 mock。"""
    summary = dashboard.get_summary(db)
    mode = "llm" if llm_enabled() else "mock"
    text = None

    if mode == "llm":
        payload = {
            "kpi": summary["kpi"], "trend": summary["trend"][-7:],
            "category_dist": summary["category_dist"], "top_intents": summary["top_intents"],
            "overdue_count": len(summary["overdue"]),
            "overdue_hours_threshold": summary["overdue_hours_threshold"],
        }
        try:
            text = llm_client.chat(
                [{"role": "user", "content": INSIGHT_PROMPT.replace(
                    "{summary}", json.dumps(payload, ensure_ascii=False, indent=1))}],
                temperature=0.3,
            ).strip()
        except llm_client.LLMError as exc:
            logger.warning("改善建议 LLM 调用失败，降级规则模板：%s", exc)
            mode = "mock"
            text = None

    if not text:
        text = mock_insight(summary)
        mode = "mock"

    return {
        "insight": text,
        "mode": mode,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "kpi_snapshot": summary["kpi"],
    }
