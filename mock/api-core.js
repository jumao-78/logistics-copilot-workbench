// 静态演示用的接口内核：把后端 FastAPI 的 /api/* 语义在浏览器内存里复刻一遍。
//
// 设计原则
// * 数据来自真实后端的响应快照（320 条工单 / 10 篇知识库 / 看板聚合），不是手写假数据；
// * 工单结构化规则与 app/ai_pipeline.py 的 mock（规则）分支一一对应，给出与真实服务一致的字段；
// * 看板 KPI / 知识库 / 问答日志都是有状态的：新建工单、改状态、提问都会写回内存。
//
// 该模块不接触 DOM，可在 node 下直接测试（见 api-core.test.js）。

// ---------------- 规则：与 ai_pipeline.py 保持一致 ----------------
const BILL_RE = /(^|[^A-Za-z0-9])([A-Z]{4}\d{9,10})(?![0-9])/;
const CTR_RE = /(^|[^A-Za-z0-9])([A-Z]{4}\d{7})(?![0-9])/;
const POL_POD_RE = /从\s*([\u4e00-\u9fa5]{2,5}?)(?:港|口岸)?\s*(?:到|发往|开往|运往)\s*([\u4e00-\u9fa5]{2,5}?)(?:港|的|这|那|，|,|。|\s|$)/;
const POL_RE = /(?:起运港|装货港|始发港)\s*[:：]?\s*([\u4e00-\u9fa5]{2,5})/;
const POD_RE = /(?:目的港|卸货港)\s*[:：]?\s*([\u4e00-\u9fa5]{2,5})/;

const CATEGORY_KEYWORDS = {
  运输: ["船期", "截关", "舱位", "拖车", "提柜", "还柜", "开船", "到港", "船公司",
    "延误", "改单", "订舱", "甩柜", "转船", "还场", "运价", "收货人", "危险品",
    "破损", "丢失", "货损", "索赔", "eta", "ETA"],
  关务: ["清关", "报关", "海关", "查验", "税单", "关税", "hs", "HS", "扣货", "商检",
    "退税", "检疫", "熏蒸", "放行", "归类", "增值税"],
  仓储: ["仓库", "入库", "上架", "库存", "拣货", "贴标", "打托", "仓储费", "免堆",
    "进仓", "出库", "库位", "盘点", "验货"],
  账单: ["账单", "发票", "费用", "付款", "对账", "滞箱费", "多收", "扣款", "退款",
    "月结", "账期", "海运费", "重开", "usd", "USD", "少收", "差价"],
};
const URGENCY_HIGH = ["投诉", "扣货", "扣留", "破损", "索赔", "丢失", "急疯", "非常急",
  "急等", "赶不上", "拒收", "起诉", "滞留", "停止付款"];
const URGENCY_MID = ["催", "尽快", "赶紧", "什么时候", "延误", "着急", "急", "今天能", "麻烦尽快"];
const INTENT_RULES = [
  ["投诉", ["投诉", "不满", "差评", "服务太差", "给个说法"]],
  ["索赔", ["索赔", "理赔", "赔偿"]],
  ["改单", ["改单", "更改", "修改", "更正", "改成"]],
  ["预约", ["预约", "约个时间", "约时间", "上门"]],
  ["催件", ["催", "还没到", "什么时候到", "还没动", "还没消息", "多久能"]],
  ["查询", ["查", "多少", "怎么算", "什么流程", "哪些资料", "怎么办理", "怎么办", "是多少",
    "报一下", "介绍", "能不能", "有没有", "会不会", "几天", "几号", "标准",
    "核实", "什么时候"]],
];
const REPLY_TEMPLATES = {
  仓储: "您好，您反馈的仓储问题已收到{bill_part}。我们已登记工单并转仓库组核实（入库/上架/库存状态），核实后会第一时间同步处理结果；如需加急请回复补充柜号或进仓编号。感谢您的支持！",
  运输: "您好，您反馈的运输问题已收到{bill_part}。我们正在与船公司/场站核实最新动态（船期/舱位/提还柜进度），确认后立即回复您下一步安排；给您带来不便敬请谅解。",
  关务: "您好，您的清关相关问题已收到{bill_part}。我们已转关务组核查申报与查验状态，并将根据海关要求第一时间告知您需补充的资料及后续处理方案。请您保持电话畅通。",
  账单: "您好，您反馈的账单疑问已收到{bill_part}。我们已转结算组核对费用明细（对账单/发票/收退费记录），确认结果与处理方案会在1个工作日内回复您。感谢您的监督！",
  其他: "您好，您的消息已收到，我们已登记工单并转对应同事跟进，会尽快与您联系。如有紧急事项请致电客服热线。感谢您的支持！",
};
const NO_ANSWER = "知识库中暂无相关内容，建议转人工客服";
const VALID_STATUSES = ["待处理", "AI已处理", "人工处理", "已关闭"];

// ---------------- 小工具 ----------------
const pad = (n) => String(n).padStart(2, "0");
function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function cleanPort(value) {
  if (!value) return null;
  let v = String(value).trim().replace(/^[。，,、；;：:！!？?"'“”‘’()（）]+|[。，,、；;：:！!？?"'“”‘’()（）]+$/g, "");
  v = v.replace(/(这|那)?条线?$/, "").replace(/航线?$/, "").replace(/^的+|的+$/g, "");
  return v && v.length >= 2 ? v : null;
}

// ---------------- 规则结构化：mock_extract ----------------
export function extractFields(rawText) {
  const text = rawText || "";
  const bill = BILL_RE.exec(text);
  const ctr = CTR_RE.exec(text);

  let pol = null;
  let pod = null;
  const m = POL_POD_RE.exec(text);
  if (m) {
    pol = cleanPort(m[1]);
    pod = cleanPort(m[2]);
  } else {
    const mp = POL_RE.exec(text);
    const md = POD_RE.exec(text);
    if (mp) pol = cleanPort(mp[1]);
    if (md) pod = cleanPort(md[1]);
  }

  // 分类：关键词命中计数，同分时按 账单 > 关务 > 仓储 > 运输 的专词优先级
  const scores = {};
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[cat] = words.filter((w) => text.includes(w)).length;
  }
  let category = "其他";
  let best = 0;
  for (const cat of ["账单", "关务", "仓储", "运输"]) {
    if ((scores[cat] || 0) > best) {
      best = scores[cat];
      category = cat;
    }
  }

  let urgency = "低";
  if (URGENCY_HIGH.some((w) => text.includes(w))) urgency = "高";
  else if (URGENCY_MID.some((w) => text.includes(w))) urgency = "中";

  let intent = "其他";
  for (const [name, words] of INTENT_RULES) {
    if (words.some((w) => text.includes(w))) {
      intent = name;
      break;
    }
  }

  return {
    category,
    urgency,
    bill_no: bill ? bill[2] : null,
    container_no: ctr ? ctr[2] : null,
    pol,
    pod,
    intent,
  };
}

export function guessChannel(rawText, fallback) {
  if (fallback) return String(fallback).trim().toLowerCase();
  const head = (rawText || "").slice(0, 40);
  if (head.includes("来电") || head.includes("电话")) return "phone";
  const informal = (head.includes("在吗") || head.includes("麻烦") || head.includes("帮我看")) && !head.includes("您好");
  if (informal || head.startsWith("问下") || head.startsWith("急")) return "wechat";
  return "email";
}

export function suggestedReply(fields) {
  const tpl = REPLY_TEMPLATES[fields.category] || REPLY_TEMPLATES["其他"];
  return tpl.replace("{bill_part}", fields.bill_no ? `（提单号 ${fields.bill_no}）` : "");
}

// ---------------- 检索：中文 2-gram + BM25 近似 ----------------
function tokenize(text) {
  const s = String(text || "").toLowerCase();
  const toks = new Set();
  for (const seg of s.match(/[\u4e00-\u9fa5]+/g) || []) {
    if (seg.length <= 2) toks.add(seg);
    for (let i = 0; i + 2 <= seg.length; i += 1) toks.add(seg.slice(i, i + 2));
  }
  for (const w of s.match(/[a-z0-9]{2,}/g) || []) toks.add(w);
  return [...toks];
}

function buildIndex(docs) {
  // docs: [{id,title,content}] → 段落级倒排
  const chunks = [];
  docs.forEach((doc) => {
    const paras = String(doc.content || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    paras.forEach((p, i) => {
      if (p.startsWith("#") && p.length < 40) return; // 纯标题不单独作为答案段
      const body = p.replace(/^#{1,6}\s*/, "").replace(/\n/g, " ").trim();
      if (body.length < 12) return;
      chunks.push({ docId: doc.id, docTitle: doc.title, order: i, text: body, toks: new Set(tokenize(body)) });
    });
  });
  const df = new Map();
  chunks.forEach((c) => c.toks.forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
  return { chunks, df, total: chunks.length };
}

function search(index, question, k = 4) {
  const qToks = tokenize(question);
  if (!qToks.length) return [];
  const scored = index.chunks.map((c) => {
    let score = 0;
    let hit = 0;
    for (const t of qToks) {
      if (!c.toks.has(t)) continue;
      hit += 1;
      const idf = Math.log(1 + index.total / (1 + (index.df.get(t) || 1)));
      score += idf;
    }
    // 命中 token 数不足 2 个视为噪声（单字/通用词）
    if (hit < 2) return null;
    score *= 1 + Math.min(hit, 8) / 16;
    // 标题命中的段落优先
    if (tokenize(c.docTitle).some((t) => qToks.includes(t))) score *= 1.35;
    return { ...c, score: score / Math.sqrt(1 + c.text.length / 120) };
  }).filter(Boolean);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

function clip(text, n = 62) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n)}……` : s;
}

// ---------------- 内核 ----------------
export function createMockApi(data) {
  const state = {
    tickets: data.tickets.map((t) => ({ ...t })),
    kbDocs: data.kbDocs.map((d) => ({ ...d })),
    kbContents: data.kbContents,
    qaLogs: data.qaLogs.map((l) => ({ ...l })),
    summary: data.summary,
    insight: data.insight,
    nextTicketId: Math.max(...data.tickets.map((t) => t.id)) + 1,
    nextLogId: Math.max(0, ...data.qaLogs.map((l) => l.id)) + 1,
  };
  const kbDocsFull = Object.values(state.kbContents);
  const index = buildIndex(kbDocsFull);

  const json = (body, status = 200) => ({ status, body });

  function listTickets(query) {
    const get = (k) => (query.get(k) || "").trim();
    const page = Math.max(1, parseInt(get("page") || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(get("page_size") || "20", 10) || 20));
    let list = state.tickets.slice();
    const category = get("category");
    const urgency = get("urgency");
    const status = get("status");
    const intent = get("intent");
    const q = get("q").toLowerCase();
    if (category) list = list.filter((t) => t.category === category);
    if (urgency) list = list.filter((t) => t.urgency === urgency);
    if (status) list = list.filter((t) => t.status === status);
    if (intent) list = list.filter((t) => t.intent === intent);
    if (q) {
      list = list.filter((t) => [t.raw_text, t.bill_no, t.container_no, t.pol, t.pod]
        .filter(Boolean).some((f) => String(f).toLowerCase().includes(q)));
    }
    list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "") || b.id - a.id);
    const total = list.length;
    const items = list.slice((page - 1) * pageSize, page * pageSize);
    return json({ total, page, page_size: pageSize, items });
  }

  function createTicket(body) {
    const rawText = String((body && body.raw_text) || "").trim();
    if (!rawText) return json({ detail: "raw_text 不能为空" }, 422);
    const now = new Date();
    const fields = extractFields(rawText);
    const channel = guessChannel(rawText, body && body.channel);
    // 30 分钟内容查重（与后端 DUP_WINDOW_MINUTES 一致）
    const cutoff = new Date(now.getTime() - 30 * 60 * 1000);
    const dup = state.tickets.find((t) => t.raw_text === rawText && new Date(t.created_at.replace(" ", "T")) >= cutoff);
    if (dup) return json({ detail: `疑似重复工单 #${dup.id}：该消息在 30 分钟内已提交过，请勿重复创建` }, 409);

    const ticket = {
      id: state.nextTicketId++,
      channel,
      raw_text: rawText,
      ...fields,
      suggested_reply: suggestedReply(fields),
      status: "AI已处理",
      created_at: stamp(now),
      replied_at: stamp(new Date(now.getTime() + 5000)),
      ai_mode: "mock",
    };
    state.tickets.push(ticket);
    state.summary = {
      ...state.summary,
      generated_at: stamp(now),
      kpi: { ...state.summary.kpi, today_count: state.summary.kpi.today_count + 1, total: state.summary.kpi.total + 1 },
    };
    return json(ticket, 200);
  }

  function setStatus(id, body) {
    const t = state.tickets.find((x) => x.id === id);
    if (!t) return json({ detail: "工单不存在" }, 404);
    const status = (body && body.status) || "";
    if (!VALID_STATUSES.includes(status)) return json({ detail: `status 须为 ${VALID_STATUSES.join("/")}` }, 400);
    t.status = status;
    if ((status === "AI已处理" || status === "人工处理") && !t.replied_at) t.replied_at = stamp();
    return json({ ...t });
  }

  function reprocess(id) {
    const t = state.tickets.find((x) => x.id === id);
    if (!t) return json({ detail: "工单不存在" }, 404);
    const fields = extractFields(t.raw_text);
    Object.assign(t, fields, { suggested_reply: suggestedReply(fields), ai_mode: "mock" });
    return json({ ...t });
  }

  function ask(body) {
    const question = String((body && body.question) || "").trim();
    const hits = question ? search(index, question) : [];
    const now = stamp();
    let payload;
    if (!hits.length) {
      payload = { question, answer: NO_ANSWER, sources: [], mode: "fallback", retrieved: [] };
    } else {
      const titles = [...new Set(hits.map((h) => h.docTitle))];
      const top = hits.filter((h) => h.docTitle === titles[0]).slice(0, 2);
      const bodyText = top.map((h) => h.text).join("\n\n");
      const extra = titles.length > 1 ? `\n\n另外可参考《${titles[1]}》中的相关说明。` : "";
      payload = {
        question,
        answer: `根据知识库《${titles[0]}》中的说明：\n\n${bodyText}${extra}\n\n【来源：${titles.slice(0, 2).join("、")}】`,
        sources: titles.slice(0, 2).map((title) => ({ id: (kbDocsFull.find((d) => d.title === title) || {}).id, title })),
        mode: "mock",
        retrieved: hits.map((h) => clip(h.text)),
      };
    }
    state.qaLogs.unshift({
      id: state.nextLogId++,
      question,
      answer: payload.answer,
      source_doc_ids: payload.sources.map((s) => s.id),
      created_at: now,
    });
    return json(payload);
  }

  // 路由分发：path 已是 URL.pathname，query 为 URLSearchParams
  function handle({ method = "GET", path, query, body }) {
    const m = method.toUpperCase();
    const p = path.replace(/\/+$/, "") || "/api";

    if (p === "/api/health" && m === "GET") {
      return json({
        status: "ok",
        ai_mode: "mock",
        llm_model: "glm-4-flash",
        db_dialect: "sqlite（静态演示）",
        db_url: "browser://demo-snapshot",
        tickets: state.tickets.length,
        kb_docs: state.kbDocs.length,
        kb_chunks: state.kbDocs.reduce((n, d) => n + (d.chunks || 0), 0),
        qa_logs: state.qaLogs.length,
      });
    }

    if (p === "/api/tickets" && m === "GET") return listTickets(query);
    if (p === "/api/tickets" && m === "POST") return createTicket(body);

    let mt = /^\/api\/tickets\/(\d+)$/.exec(p);
    if (mt && m === "GET") {
      const t = state.tickets.find((x) => x.id === Number(mt[1]));
      return t ? json({ ...t }) : json({ detail: "工单不存在" }, 404);
    }
    mt = /^\/api\/tickets\/(\d+)\/status$/.exec(p);
    if (mt && m === "PATCH") return setStatus(Number(mt[1]), body);
    mt = /^\/api\/tickets\/(\d+)\/reprocess$/.exec(p);
    if (mt && m === "POST") return reprocess(Number(mt[1]));

    if (p === "/api/dashboard/summary" && m === "GET") return json(state.summary);
    if (p === "/api/dashboard/insight" && m === "GET") {
      const rate = state.summary.kpi.ai_rate;
      return json({ ...state.insight, insight: state.insight.insight.replace(/48\.1%/, `${rate}%`), generated_at: state.summary.generated_at, kpi_snapshot: state.summary.kpi });
    }

    if (p === "/api/kb/docs" && m === "GET") return json(state.kbDocs.map((d) => ({ ...d })));
    const kd = /^\/api\/kb\/docs\/(\d+)$/.exec(p);
    if (kd && m === "GET") {
      const doc = state.kbContents[Number(kd[1])];
      return doc ? json({ id: doc.id, title: doc.title, updated_at: doc.updated_at, content: doc.content }) : json({ detail: "文档不存在" }, 404);
    }

    if (p === "/api/qa" && m === "POST") return ask(body);

    if (p === "/api/qa/logs" && m === "GET") {
      const limit = Math.min(200, Math.max(1, parseInt(query.get("limit") || "20", 10) || 20));
      return json(state.qaLogs.slice(0, limit).map((l) => ({ ...l })));
    }

    return json({ detail: `静态演示未实现该接口：${m} ${p}` }, 404);
  }

  return { handle, state, index };
}
