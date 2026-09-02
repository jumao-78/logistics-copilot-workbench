"""AI 管道：字段提取 + 分类 + 紧急度 + 意图 + 建议回复。

双模式设计（规划文档 §13 降级预案）：
* llm 模式 —— 调用 OpenAI 兼容接口，temperature=0，严格输出 JSON；
  单条解析/调用失败自动降级到规则模式，管道永不中断。
* mock 模式 —— 纯正则 + 关键词规则：正则提提单号/柜号/港口，关键词打分分类。
  无 Key、断网、LLM 报错时自动落到这里，保证全流程可演示。

Prompt 初稿来自《物流AI客服项目规划.md》§7。
"""
import logging
import random
import re
from datetime import datetime, timedelta
from typing import Optional

from . import llm_client
from .config import llm_enabled

logger = logging.getLogger("copilot.pipeline")

CATEGORIES = ["仓储", "运输", "关务", "账单", "其他"]
URGENCIES = ["高", "中", "低"]
INTENTS = ["查询", "催件", "投诉", "改单", "索赔", "预约", "其他"]

# ---------------------------------------------------------------------------
# ① 字段提取 + 分类（LLM 版，temperature=0，严格 JSON）
# 初稿为规划文档 §7 裸 prompt；接入 glm-4-flash 实测分类准确率仅 40%，
# 依据 §11-Q5 的方法论补充「分类/紧急度判定标准 + few-shot」后复评（见 docs/evaluation_report.md）
# ---------------------------------------------------------------------------
EXTRACT_PROMPT = """你是货代公司的工单处理助手。从客服消息中提取信息，严格输出 JSON：
{"category":"仓储|运输|关务|账单|其他","urgency":"高|中|低","bill_no":"","container_no":"","pol":"","pod":"","intent":""}

分类标准（按消息主题归一类）：
- 运输：船期/舱位/订舱/提柜还柜/拖车/到港延误/催件查货进度/改单/运价/货损索赔等运输环节问题
- 关务：报关/清关/海关查验/扣货/税单/退税/熏蒸/HS编码/归类等进出口合规问题
- 账单：账单核对/费用争议/多收退款/发票/付款/月结/滞箱费收取争议等结算问题
- 仓储：入库/上架/库存/拣货/出库/贴标/仓储费/免堆期等仓库作业问题
- 其他：无法归入以上四类的事项
易混淆判定：滞箱费多收/账单争议→账单；咨询免堆期/仓储费标准→仓储；催货物进度/船期延误→运输。

紧急度标准：
- 高：投诉、海关扣货、货物破损/丢失、索赔等已造成影响或业务停滞的情况
- 中：客户在催、船期/清关延误、消息中出现明确时间压力（今天/马上/明天就要/赶不上截关）
- 低：一般咨询与日常问题反馈、核实类诉求（费用核对/状态查询/开票更正等），无催促无时限

intent 定义：查询=询问信息/流程/费用/标准/状态；催件=催促在途或在场货物的进度；投诉=表达不满并要求处理；改单=修改已下单证信息；索赔=要求赔偿；预约=约定时间；其他=其余。

字段要求：
1. bill_no=提单号（4位字母+9~10位数字，如MAEU123456789）；container_no=柜号（4位字母+7位数字，如TCLU1234567）
2. pol=起运港、pod=目的港（中文，如"上海"/"鹿特丹"）；消息未提到一律填 null
3. intent 从 查询/催件/投诉/改单/索赔/预约/其他 中选
4. 无法确定的字段填 null，不要编造；只输出 JSON，不要任何解释。

示例：
消息：提单号MAEU222345678的货周五该到港了还没到，客户催得紧 → {"category":"运输","urgency":"中","bill_no":"MAEU222345678","container_no":null,"pol":null,"pod":null,"intent":"催件"}
消息：这个月账单把THC费收多了，报价USD210开了USD335 → {"category":"账单","urgency":"低","bill_no":null,"container_no":null,"pol":null,"pod":null,"intent":"查询"}
消息：我们的货在海关查验被扣了，提单号HLCU111222333，客户急疯了 → {"category":"关务","urgency":"高","bill_no":"HLCU111222333","container_no":null,"pol":null,"pod":null,"intent":"查询"}
消息：下周三有批货要进仓，帮忙预约入库时间 → {"category":"仓储","urgency":"低","bill_no":null,"container_no":null,"pol":null,"pod":null,"intent":"预约"}

消息：{raw_text}"""

# ---------------------------------------------------------------------------
# ② 建议回复（LLM 版）
# ---------------------------------------------------------------------------
REPLY_PROMPT = """你是跨境物流客服。基于以下工单信息写一段专业、友好的中文回复，
先确认收到，再给下一步动作；信息不足就说明需要补充什么，不要承诺具体时间。
工单：{ticket_json}"""

# ---------------------------------------------------------------------------
# mock 模式：正则与关键词规则
# ---------------------------------------------------------------------------
# 提单号：4 字母航司前缀 + 9~10 位数字（与柜号 7 位数字区分开）
BILL_NO_RE = re.compile(r"(?<![A-Za-z0-9])([A-Z]{4}\d{9,10})(?!\d)")
# 柜号：4 字母 + 7 位数字
CONTAINER_NO_RE = re.compile(r"(?<![A-Za-z0-9])([A-Z]{4}\d{7})(?!\d)")
# 港口：从 X 到 Y / 起运港：X / 目的港：Y（终止符包含“这条/那条”，避免把“纽约这条线”整段吞进地名）
POL_POD_RE = re.compile(r"从\s*([\u4e00-\u9fa5]{2,5}?)(?:港|口岸)?\s*(?:到|发往|开往|运往)\s*([\u4e00-\u9fa5]{2,5}?)(?:港|的|这|那|，|,|。|\s|$)")
POL_RE = re.compile(r"(?:起运港|装货港|始发港)\s*[:：]?\s*([\u4e00-\u9fa5]{2,5})")
POD_RE = re.compile(r"(?:目的港|卸货港)\s*[:：]?\s*([\u4e00-\u9fa5]{2,5})")

CATEGORY_KEYWORDS = {
    "运输": ["船期", "截关", "舱位", "拖车", "提柜", "还柜", "开船", "到港", "船公司",
            "延误", "改单", "订舱", "甩柜", "转船", "还场", "运价", "收货人", "危险品",
            "破损", "丢失", "货损", "索赔", "eta", "ETA"],
    "关务": ["清关", "报关", "海关", "查验", "税单", "关税", "hs", "HS", "扣货", "商检",
            "退税", "检疫", "熏蒸", "放行", "归类", "增值税"],
    "仓储": ["仓库", "入库", "上架", "库存", "拣货", "贴标", "打托", "仓储费", "免堆",
            "进仓", "出库", "库位", "盘点", "验货"],
    "账单": ["账单", "发票", "费用", "付款", "对账", "滞箱费", "多收", "扣款", "退款",
            "月结", "账期", "海运费", "重开", "usd", "USD", "少收", "差价"],
}
URGENCY_HIGH_KEYWORDS = ["投诉", "扣货", "扣留", "破损", "索赔", "丢失", "急疯", "非常急",
                         "急等", "赶不上", "拒收", "起诉", "滞留", "停止付款", " Customs 查验"]
URGENCY_MID_KEYWORDS = ["催", "尽快", "赶紧", "什么时候", "延误", "着急", "急", "今天能", "麻烦尽快"]

INTENT_RULES = [
    ("投诉", ["投诉", "不满", "差评", "服务太差", "给个说法"]),
    ("索赔", ["索赔", "理赔", "赔偿"]),
    ("改单", ["改单", "更改", "修改", "更正", "改成"]),
    ("预约", ["预约", "约个时间", "约时间", "上门"]),
    ("催件", ["催", "还没到", "什么时候到", "还没动", "还没消息", "多久能"]),
    ("查询", ["查", "多少", "怎么算", "什么流程", "哪些资料", "怎么办理", "怎么办", "是多少",
             "报一下", "介绍", "能不能", "有没有", "会不会", "几天", "几号", "标准",
             "核实", "什么时候"]),
]

REPLY_TEMPLATES = {
    "仓储": ("您好，您反馈的仓储问题已收到{bill_part}。我们已登记工单并转仓库组核实"
            "（入库/上架/库存状态），核实后会第一时间同步处理结果；如需加急请回复补充柜号或进仓编号。"
            "感谢您的支持！"),
    "运输": ("您好，您反馈的运输问题已收到{bill_part}。我们正在与船公司/场站核实最新动态"
            "（船期/舱位/提还柜进度），确认后立即回复您下一步安排；给您带来不便敬请谅解。"),
    "关务": ("您好，您的清关相关问题已收到{bill_part}。我们已转关务组核查申报与查验状态，"
            "并将根据海关要求第一时间告知您需补充的资料及后续处理方案。请您保持电话畅通。"),
    "账单": ("您好，您反馈的账单疑问已收到{bill_part}。我们已转结算组核对费用明细"
            "（对账单/发票/收退费记录），确认结果与处理方案会在1个工作日内回复您。感谢您的监督！"),
    "其他": ("您好，您的消息已收到，我们已登记工单并转对应同事跟进，会尽快与您联系。"
            "如有紧急事项请致电客服热线。感谢您的支持！"),
}


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------------------------
# mock（规则）版实现
# ---------------------------------------------------------------------------
def clean_port(value) -> Optional[str]:
    """港口名清洗：去引号/标点/口语尾缀（“这条线”“一线”等），保证字段里只有地名。"""
    if not value:
        return None
    v = str(value).strip().strip("。，,、；;：:！!？?\"'“”‘’()（）")
    v = re.sub(r"(这|那)?条线?$", "", v)      # 纽约这条线 → 纽约
    v = re.sub(r"航线?$", "", v)              # 鹿特丹航线 → 鹿特丹
    v = v.strip("的的的")
    if not v or len(v) < 2:
        return None
    return v


def mock_extract(raw_text: str) -> dict:
    """正则 + 关键词规则版提取/分类，不依赖任何外部服务。"""
    text = raw_text or ""

    bill = BILL_NO_RE.search(text)
    container = CONTAINER_NO_RE.search(text)

    pol = pod = None
    m = POL_POD_RE.search(text)
    if m:
        pol, pod = clean_port(m.group(1)), clean_port(m.group(2))
    else:
        m_pol, m_pod = POL_RE.search(text), POD_RE.search(text)
        if m_pol:
            pol = clean_port(m_pol.group(1))
        if m_pod:
            pod = clean_port(m_pod.group(1))

    # 分类：关键词命中计数，同分时按 账单>关务>仓储>运输 优先级（专词越具体越优先）
    scores = {}
    for cat, words in CATEGORY_KEYWORDS.items():
        scores[cat] = sum(1 for w in words if w in text)
    category = "其他"
    best = 0
    for cat in ["账单", "关务", "仓储", "运输"]:
        if scores.get(cat, 0) > best:
            best = scores[cat]
            category = cat

    if any(w in text for w in URGENCY_HIGH_KEYWORDS):
        urgency = "高"
    elif any(w in text for w in URGENCY_MID_KEYWORDS):
        urgency = "中"
    else:
        urgency = "低"

    intent = "其他"
    for name, words in INTENT_RULES:
        if any(w in text for w in words):
            intent = name
            break

    return {
        "category": category,
        "urgency": urgency,
        "bill_no": bill.group(1) if bill else None,
        "container_no": container.group(1) if container else None,
        "pol": pol,
        "pod": pod,
        "intent": intent,
    }


def mock_suggested_reply(fields: dict) -> str:
    """模板版建议回复：按分类选模板，拼入提单号引用。"""
    category = fields.get("category") or "其他"
    bill = fields.get("bill_no")
    template = REPLY_TEMPLATES.get(category, REPLY_TEMPLATES["其他"])
    return template.format(bill_part=f"（提单号 {bill}）" if bill else "")


# ---------------------------------------------------------------------------
# LLM 版实现（失败抛 LLMError / 返回 None，由上层降级）
# ---------------------------------------------------------------------------
def llm_extract(raw_text: str) -> Optional[dict]:
    content = llm_client.chat(
        [{"role": "user", "content": EXTRACT_PROMPT.replace("{raw_text}", raw_text)}],
        temperature=0.0,
    )
    data = llm_client.parse_json_loose(content)

    def _clean(value, allowed):
        if value is None:
            return None
        value = str(value).strip()
        return value if value and value.lower() != "null" else None

    category = _clean(data.get("category"), CATEGORIES)
    if category not in CATEGORIES:
        category = "其他"
    urgency = _clean(data.get("urgency"), URGENCIES)
    if urgency not in URGENCIES:
        urgency = "中"
    intent = _clean(data.get("intent"), INTENTS)
    if intent not in INTENTS:
        intent = "其他"
    return {
        "category": category,
        "urgency": urgency,
        "bill_no": _clean(data.get("bill_no"), None),
        "container_no": _clean(data.get("container_no"), None),
        "pol": clean_port(_clean(data.get("pol"), None)),
        "pod": clean_port(_clean(data.get("pod"), None)),
        "intent": intent,
    }


def llm_suggested_reply(fields: dict, raw_text: str) -> Optional[str]:
    ticket_json = json_dumps({**fields, "raw_text": raw_text})
    try:
        return llm_client.chat(
            [{"role": "user", "content": REPLY_PROMPT.replace("{ticket_json}", ticket_json)}],
            temperature=0.2,
        ).strip()
    except llm_client.LLMError as exc:
        logger.warning("建议回复 LLM 调用失败，降级模板：%s", exc)
        return None


def json_dumps(obj) -> str:
    import json
    return json.dumps(obj, ensure_ascii=False)


# ---------------------------------------------------------------------------
# 管道入口
# ---------------------------------------------------------------------------
def process_message(raw_text: str, channel: Optional[str] = None,
                    use_llm: Optional[bool] = None) -> dict:
    """把一条原始消息处理成结构化工单字段。

    返回 dict：channel/raw_text/category/urgency/bill_no/container_no/pol/pod/
              intent/suggested_reply/ai_mode
    ai_mode: "llm" | "mock" | "mock(降级)" —— mock(降级) 表示配置了 Key 但本次调用失败
    """
    raw_text = (raw_text or "").strip()
    channel = (channel or guess_channel(raw_text) or "email").strip().lower()

    mode = "llm" if (llm_enabled() if use_llm is None else use_llm) else "mock"
    fields = None
    if mode == "llm":
        try:
            fields = llm_extract(raw_text)
        except llm_client.LLMError as exc:
            logger.warning("字段提取 LLM 调用失败，降级规则模式：%s", exc)
            mode = "mock(降级)"
    if fields is None:
        fields = mock_extract(raw_text)

    reply = None
    if mode == "llm":
        reply = llm_suggested_reply(fields, raw_text)
    if not reply:
        reply = mock_suggested_reply(fields)

    result = {"channel": channel, "raw_text": raw_text, **fields,
              "suggested_reply": reply, "ai_mode": mode}
    return result


def guess_channel(raw_text: str) -> str:
    """从文本特征粗略识别渠道：电话记录/微信口语/邮件抬头。"""
    head = (raw_text or "")[:40]
    if "来电" in head or "电话" in head:
        return "phone"
    if ("在吗" in head or "麻烦" in head and "您好" not in head) or head.startswith(("问下", "帮我看", "急")):
        return "wechat"
    return "email"


def random_reply_time(created_at: datetime, low_min: int, high_min: int) -> str:
    """给 mock 数据生成响应时间：created_at + 随机分钟数。"""
    return (created_at + timedelta(minutes=random.randint(low_min, high_min))).strftime("%Y-%m-%d %H:%M:%S")
