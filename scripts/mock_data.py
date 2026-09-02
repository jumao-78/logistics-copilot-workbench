#!/usr/bin/env python3
"""生成 320 条模拟客服求助消息，经 AI 管道（规则模式）结构化后入库。

产出：
* 数据库 tickets 表：覆盖 仓储/运输/关务/账单/其他 五类、三种渠道、
  四种状态（AI已处理/人工处理/已关闭/待处理）与 14 天时间分布，
  保证看板（趋势/分布/KPI/超时表）均有真实聚合数据；
* data/mock_messages.csv —— 全量原始消息留档（审计/重放）；
* data/import_demo.csv   —— 12 条未入库新消息，用于演示“导入→AI 自动处理”。

用法：
    python scripts/mock_data.py            # 表已有数据时仅提示
    python scripts/mock_data.py --force    # 清空 tickets 后重新生成
"""
import argparse
import csv
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.ai_pipeline import process_message  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.models import Ticket  # noqa: E402

random.seed(42)

# ---------------------------- 基础数据池 ----------------------------
POL_LIST = ["上海", "宁波", "深圳", "青岛", "厦门", "广州", "天津", "大连"]
POD_LIST = ["鹿特丹", "汉堡", "洛杉矶", "纽约", "长滩", "温哥华", "东京", "釜山",
            "迪拜", "新加坡", "悉尼", "休斯敦"]
CARRIERS = ["MAEU", "MSCU", "COSU", "HLCU", "OOLU", "EMCS"]
CONTAINER_PREFIX = ["TCLU", "CBHU", "MSCU", "TEMU", "SEGU", "GHCU"]

# 状态分布：AI已处理45% / 已关闭25% / 人工处理20% / 待处理10%
STATUS_PLAN = [
    ("AI已处理", 0.45, 2, 15),      # AI 秒级首响：+2~15 分钟
    ("已关闭", 0.25, 60, 1440),     # 处理完结案：+1 小时~1 天
    ("人工处理", 0.20, 30, 600),    # 转人工处理：+30 分钟~10 小时
    ("待处理", 0.10, None, None),   # 未响应（超时工单来源）
]
# 时间分布：近 14 天，今天占比最高（保证“今日工单量”与近 7 日趋势有数据）
DAY_WEIGHTS = [12, 7, 6, 6, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2]

# ---------------------------- 消息模板 ----------------------------
# 占位符：bill/bill2=提单号  container=柜号  pol/pod=起运港/目的港
#         date=日期  pallets=托盘数  cartons=件数  hs=HS编码  ctn=票数
TEMPLATES = {
    "仓储": [
        "您好，我司一批货（提单号{bill}）已于昨日到仓，但截至目前库存系统里仍查不到入库记录，仓库也回复说找不到货位，麻烦尽快核实入库状态并回复，客户等着发货。",
        "在吗？{container}这个柜子的货今天能安排上架吗？上次说好今天入库的，电商那边等着上架销售呢，麻烦回个准信。",
        "下周三上午有一批从{pol}发来的货要进仓，大概{pallets}个托盘、{cartons}箱，麻烦帮忙预约入库时间，另外这批货需要重新贴标后再上架，贴标费用麻烦提前确认一下。",
        "客户来电：仓库里的货要打出库单，系统显示待拣货状态三天了一直没动，问一下拣货排队要多久，能不能今天出。",
        "帮我看下提单{bill}对应的货进了多少件数，和我们的装箱单差了{cartons}箱，是不是少收了？需要你们仓库盘点确认下。",
        "我司有一批货需要在贵司仓库暂存两周后再发运（提单号{bill}），请报一下仓储费标准，以及免堆期过后每天的费用怎么算。",
        "今天下午到库的{container}柜货，外包装有几箱明显破损，请安排验货拍照留底，先不要上架，等我们确认处理方式。",
        "请问仓库的收货时间是每天几点到几点？我们有一票货想约明天上午送仓，需要提前准备什么资料？",
    ],
    "运输": [
        "您好，提单号{bill}这票货原计划{date}从{pol}开船，但船公司通知舱位被甩了，现在客户催得紧，请帮忙确认最近的船期，或者看看有没有其他船司可以订舱。",
        "急！{bill}的柜子{container}还在场站没提出来，拖车约了明天早上装货，再提不到柜子就赶不上截关了，麻烦赶紧协调。",
        "从{pol}到{pod}这条线的船期最近是不是延误严重？我们有两票货（提单号{bill}、{bill2}）都比预计到港时间晚了一周以上，请给出最新的ETA。",
        "麻烦帮我改单：提单号{bill}，目的港收货人公司名称打错了一个字母，需要把提单上的收货人更正过来，费用我们承担，今天能改好吗？",
        "客户来电催件：{bill}这票货说好上周五到{pod}，到现在还没消息，收货人一天三个电话催我们，请今天下班前给个准确答复。",
        "问下{container}这个柜子还柜了吗？系统显示租箱公司还在计费，如果已经还场请把还柜单发我一份。",
        "我们在{pol}有一批货要发{pod}，20GP一个，想问下最近一周的船期和运价，另外需要含拖车和报关的门到门报价。",
        "提单号{bill}的货到{pod}港了，但是船公司说目的港拥堵要排队卸船，客户问还要等多久，这个延误证明能不能开一份给我们向客户交代？",
        "{bill}这票目的港代理说找不到舱单信息，让核对提单号和船名航次，请尽快和船司确认是不是舱单没发送，急等。",
        "我们想下周三订一个40HQ从{pol}出运到{pod}，是2类危险品，请问危险品舱位好订吗？需要提前多少天订舱？",
    ],
    "关务": [
        "您好，我们的货在{pod}海关布控查验了，提单号{bill}，说是申报品名和实际货物可能不符，现在被扣货了。请问查验一般要多久？需要我们补充什么资料？客户催得非常急。",
        "第一次从{pol}口岸出口，想确认下报关需要的全套资料：我们准备了装箱单、商业发票和报关草单，报关委托书是电子的还是要纸质盖章？HS编码{hs}，麻烦帮忙确认归类有没有问题。",
        "我的税单怎么还没出来？{bill}这票上周就清关放行了，客户要税单做抵扣，请问税单一般多久能拿到？",
        "这票{bill}的海关查验费和滞港费，是因为申报要素不完整导致的，这个费用应该我们出还是货代出？另外帮忙看看能不能申请快速放行。",
        "客户来电：问下{pol}出口的木托盘是不是要做熏蒸消毒？我们没做熏蒸直接装柜了，会不会在口岸被查？现在柜子还没进港，还来得及处理吗？",
        "帮我看下{bill}的报关单退税率是多少，品名是铝合金型材，客户说要按13%退税，我们不确定归类对不对，帮忙核一下。",
        "我们的设备从{pod}进口，关税和增值税分别是多少？设备用于鼓励项目，听说可以办免税，需要什么手续和资料？",
        "请问清关大概需要几个工作日？客户问提单号{bill}这票什么时候能提货，海关那边还需要补充什么单证吗？",
    ],
    "账单": [
        "您好，核对贵司上月账单时发现提单号{bill}多收了THC费：报价是USD210，账单上开了USD335，请核实并退回多收部分，否则这笔款我们暂缓支付。",
        "{container}上周三就已经还场了，为什么这个月账单还在收滞箱费？请核对免箱期和还柜记录，把这笔费用取消。",
        "请把这票{bill}的费用明细发我们一份：海运费、文件费、报关费分别列清楚，另外发票抬头要开成我们总公司，税号随后发你。",
        "对账发现我们6月份一共付了两次{bill}的运费，金额都是USD2350，请核实是重复收款还是两笔不同费用，多收的部分请安排退款。",
        "客户来电投诉：说好海运费锁价2800一个方，账单按3200收的，业务员说汇率涨了要补差价，合同里没这条，请给个说法，不然以后货不发你们家了。",
        "这批{bill}的账单能月结吗？我们每月货量大概{ctn}票，之前跟销售谈过账期30天，麻烦把账单汇总一下月底一起开票。",
        "为什么这票的文件费收了两次？提单号{bill}和{bill2}是同一票货分出来的两份提单，文件费按理只收一份，请核实账单。",
        "请问你们的账单多久出一期？付款后水单发到哪个邮箱？另外能不能把汇率和费用单价在账单备注里写清楚，方便我们财务对账。",
    ],
    "其他": [
        "您好，请问贵司官网的企业介绍和相关资质文件在哪里可以下载？我们采购部要做供应商准入审核，想了解一下你们的服务范围。",
        "你们的客服邮箱是不是换了？之前发的邮件被退回了，麻烦确认下最新的联系方式和值班时间。",
        "想了解一下你们公司能不能做保税区仓储和转口贸易相关的服务，我们有新项目想找长期合作伙伴，方便约个时间详聊吗？",
        "请问你们的系统对接方式有哪些？我们想了解下能不能和我们的ERP做数据对接，另外有没有操作培训资料？",
    ],
}

CATEGORY_WEIGHTS = [("运输", 100), ("仓储", 70), ("账单", 70), ("关务", 60), ("其他", 20)]

# 演示导入用的新消息（不直接入库，由界面“导入 CSV”触发 AI 管道现场处理）
IMPORT_DEMO_MESSAGES = [
    ("email", "您好，提单号MSCU778123456的货原定28号从宁波开船，现在船司通知延误了，客户那边催得急，麻烦帮忙查下最新的船期和预计到港时间。"),
    ("wechat", "在吗，急！TCLU5558321这个柜子明天截关，拖车还没约到，麻烦赶紧帮忙安排拖车，不然就赶不上这水船了。"),
    ("email", "我们的货在洛杉矶海关被查验了，提单号COSU664512345，说要核对申报要素，现在扣货了，客户非常着急，需要我们提供什么资料？"),
    ("phone", "客户来电：查一下账单，提单号MAEU881234567这票上个月好像多收了文件费，报价里没有这一项，请核实退差价。"),
    ("wechat", "帮个忙，{container}的货到了三天还没上架，电商客户等着发货，能不能今天安排入库？".replace("{container}", "CBHU7712345")),
    ("email", "从青岛到汉堡的船期最近延误吗？我们有一票货提单号HLCU335678912还没到港，客户天天催，帮忙催下船公司给个ETA。"),
    ("email", "您好，请把提单号OOLU996543211这票的清关资料发我们核对一下，另外税单什么时候能出？客户等着做抵扣。"),
    ("wechat", "下周一有一批货进仓，大概30个托盘，帮忙预约入库，另外有几箱需要重新贴标，费用怎么算？"),
    ("phone", "客户来电投诉：说好的免箱期21天，怎么第14天就开始收滞箱费了？请马上核实免箱期记录，多收的费用要退。"),
    ("email", "麻烦改单：提单号EMCS447123456，收货人地址写错了，需要更正提单上的通知人地址，改单费我们承担，明天要用，拜托加急。"),
    ("wechat", "问下这票EMCS447123456的柜子还了吗？租箱那边还在计费，如果还了把还柜单发我。"),
    ("email", "您好，我们想咨询下上海到迪拜的运价，40HQ一个，含拖车报关的门到门价格，最近一周有船期吗？"),
]


def _ctx() -> dict:
    bill = random.choice(CARRIERS) + str(random.randint(10 ** 8, 10 ** 10 - 1))
    bill2 = random.choice(CARRIERS) + str(random.randint(10 ** 8, 10 ** 10 - 1))
    container = random.choice(CONTAINER_PREFIX) + str(random.randint(10 ** 6, 10 ** 7 - 1))
    days_later = random.randint(3, 15)
    return {
        "bill": bill,
        "bill2": bill2,
        "container": container,
        "pol": random.choice(POL_LIST),
        "pod": random.choice(POD_LIST),
        "date": (datetime.now() + timedelta(days=days_later)).strftime("%m月%d日"),
        "pallets": random.randint(5, 45),
        "cartons": random.choice([12, 20, 30, 45, 60]),
        "hs": f"{random.randint(3900, 8499)}.{random.randint(10, 99)}",
        "ctn": random.choice([40, 60, 80, 120]),
    }


def _pick_created_at(status: str) -> str:
    """按天分布随机生成创建时间；待处理工单至少早于 5 小时（制造超时样本）。"""
    now = datetime.now()
    if status == "待处理":
        offset_minutes = random.randint(int((5 + random.random() * 24 * 13.5) * 60), 14 * 24 * 60)
        return (now - timedelta(minutes=offset_minutes)).strftime("%Y-%m-%d %H:%M:%S")
    day = random.choices(range(len(DAY_WEIGHTS)), weights=DAY_WEIGHTS, k=1)[0]
    base = (now - timedelta(days=day)).replace(hour=0, minute=0, second=0, microsecond=0)
    created = base + timedelta(minutes=random.randint(8 * 60, 21 * 60))
    if created > now:  # 今天的随机时间不能超过当前时刻
        created = now - timedelta(minutes=random.randint(5, 240))
    return created.strftime("%Y-%m-%d %H:%M:%S")


def generate_messages(count: int) -> list:
    """按类别权重生成 [category, channel, raw_text] 列表。"""
    pool = []
    for cat, n in CATEGORY_WEIGHTS:
        for _ in range(n):
            pool.append(cat)
    random.shuffle(pool)
    pool = pool[:count]

    messages = []
    for cat in pool:
        channel = random.choices(["email", "wechat", "phone"], weights=[0.5, 0.35, 0.15], k=1)[0]
        text = random.choice(TEMPLATES[cat]).format_map(_ctx())
        messages.append((cat, channel, text))
    return messages


def main() -> None:
    parser = argparse.ArgumentParser(description="生成模拟工单数据")
    parser.add_argument("--force", action="store_true", help="清空现有 tickets 后重新生成")
    parser.add_argument("--count", type=int, default=320, help="生成条数（默认 320）")
    args = parser.parse_args()

    init_db()
    db = SessionLocal()
    existing = db.query(Ticket.id).count()
    if existing and not args.force:
        print(f"[跳过] tickets 表已有 {existing} 条数据；如需重新生成请加 --force")
        return
    if args.force:
        db.query(Ticket).delete()
        db.commit()
        print(f"[清理] 已清空原 {existing} 条工单")

    messages = generate_messages(args.count)
    rows = []
    for designed_cat, channel, raw in messages:
        data = process_message(raw, channel, use_llm=False)  # 规则模式：离线可复现
        status, _, low, high = random.choices(
            STATUS_PLAN, weights=[w for _, w, _, _ in STATUS_PLAN], k=1)[0]
        status = status[0] if isinstance(status, tuple) else status
        created_at = _pick_created_at(status)
        replied_at = None
        if low is not None:
            replied_at = (datetime.strptime(created_at, "%Y-%m-%d %H:%M:%S")
                          + timedelta(minutes=random.randint(low, high))
                          ).strftime("%Y-%m-%d %H:%M:%S")
        rows.append((data, status, created_at, replied_at))

    for data, status, created_at, replied_at in rows:
        db.add(Ticket(
            channel=data["channel"], raw_text=data["raw_text"], category=data["category"],
            urgency=data["urgency"], bill_no=data["bill_no"], container_no=data["container_no"],
            pol=data["pol"], pod=data["pod"], intent=data["intent"],
            suggested_reply=data["suggested_reply"], status=status,
            created_at=created_at, replied_at=replied_at,
        ))
    db.commit()

    # ---------- CSV 留档 ----------
    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    with open(data_dir / "mock_messages.csv", "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["channel", "raw_text"])
        for _, channel, raw in messages:
            writer.writerow([channel, raw])
    with open(data_dir / "import_demo.csv", "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["channel", "raw_text"])
        for channel, raw in IMPORT_DEMO_MESSAGES:
            writer.writerow([channel, raw])

    # ---------- 汇总输出 ----------
    total = len(rows)
    by_cat, by_status, by_urg = {}, {}, {}
    for data, status, _, _ in rows:
        by_cat[data["category"]] = by_cat.get(data["category"], 0) + 1
        by_status[status] = by_status.get(status, 0) + 1
        by_urg[data["urgency"]] = by_urg.get(data["urgency"], 0) + 1
    ai_done = by_status.get("AI已处理", 0)
    print(f"[完成] 入库 {total} 条模拟工单（数据均为模拟，见 README 声明）")
    print(f"  分类分布：{by_cat}")
    print(f"  状态分布：{by_status}（AI 自动处理率 {ai_done / total * 100:.1f}%）")
    print(f"  紧急度  ：{by_urg}")
    print(f"  CSV 留档：data/mock_messages.csv；导入演示文件：data/import_demo.csv")


if __name__ == "__main__":
    main()
