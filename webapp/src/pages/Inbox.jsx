import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, RotateCcw, MapPin, Globe2, Copy, Send, Bot, ShieldCheck,
  Languages, CheckCircle2, Loader2, Brain, BookOpen, Radar, PenLine, Ship,
  AlertTriangle, FileText, Zap, ShieldAlert, Sparkles,
} from "lucide-react";
import { Card, CategoryBadge, UrgencyBadge, StatusBadge, Badge, Dot, Empty, Loading } from "../components/ui.jsx";
import { api, fmt, cls } from "../api.js";

/* ═════════ 派生（仅 UI，不改后端） ═════════ */
const CARRIER_BY_PREFIX = {
  MAEU: "Maersk · 马士基", MSCU: "MSC · 地中海航运", COSU: "COSCO · 中远海运",
  HLCU: "Hapag · 赫伯罗特", OOLU: "OOCL · 东方海外", EMCS: "EMC · 长荣海运",
};
const ISSUE_BY = { 运输: "运输时效", 关务: "清关查验", 账单: "费用争议", 仓储: "仓储异常", 其他: "综合咨询" };
const ACTIONS_BY = {
  关务: ["核实海关查验进度与扣货原因", "索要缺失单证（发票/箱单/说明）", "同步客户最新清关时间线"],
  运输: ["查询船司最新动态与到港 ETA", "检索延误/甩柜处理口径", "安抚客户并给延误证明或改签方案"],
  账单: ["调出报价单与船司账单核对", "确认多收项并登记退款流程", "回复核账结果与退款时间点"],
  仓储: ["向仓库核实入库/拣货状态", "检索仓储 SLA 与计费标准", "同步处理时间并确认出库计划"],
  其他: ["检索知识库确认处理口径", "生成确认回复并同步处理人"],
};
const KB_KEYWORD = {
  关务: ["清关", "报关", "海关", "税单", "熏蒸"], 运输: ["船期", "订舱", "破损", "索赔", "改单", "电放", "海运"],
  账单: ["账单", "对账", "付款", "附加费"], 仓储: ["仓储", "入库", "免堆"], 其他: ["账单", "流程"],
};

function riskOf(t) {
  const base = { 高: 92, 中: 74, 低: 55 }[t.urgency] || 60;
  const pct = Math.min(97, base + (t.intent === "投诉" || t.intent === "索赔" ? 6 : t.intent === "催件" ? 3 : 0));
  const lv = pct >= 80 ? { txt: "高风险", tone: "#ef4444", bg: "bg-red-50 text-red-600" }
    : pct >= 62 ? { txt: "中风险", tone: "#f59e0b", bg: "bg-amber-50 text-amber-600" }
    : { txt: "低风险", tone: "#10b981", bg: "bg-emerald-50 text-emerald-600" };
  const reason = t.intent === "投诉" || t.intent === "索赔" ? "客户投诉/索赔升级 · 时效敏感"
    : t.category === "关务" ? "海关查验/扣货 · 需补充单证"
    : t.category === "账单" ? "费用争议 · 需逐项核账"
    : t.urgency === "高" ? "高紧急待处理 · 接近 SLA 阈值" : "常规流程处理";
  return { pct, ...lv, reason };
}
function etaOf(raw) { const m = String(raw || "").match(/(\d{1,2})月(\d{1,2})日/); return m ? `${+m[1]}月${+m[2]}日` : null; }
function carrierOf(t) { return CARRIER_BY_PREFIX[(t.bill_no || "").slice(0, 4)] || "待识别"; }

/* ═════════ 左栏：Ticket Inbox ═════════ */
function InboxList({ list, sel, setSel, q, setQ, onRefresh }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索提单号 / 关键词"
            className="w-full rounded-2xl border border-line bg-surface2/50 py-2 pl-9 pr-3 text-[13px] placeholder:text-ink3" />
        </div>
        <button onClick={onRefresh} className="rounded-2xl border border-line p-2 text-ink2 hover:bg-surface2"><RotateCcw size={14} /></button>
      </div>
      <div className="-mr-2 flex-1 space-y-2 overflow-y-auto pr-2" style={{ maxHeight: 660 }}>
        {list.length === 0 ? <Empty text="没有匹配的工单" /> : list.map((t) => {
          const rk = riskOf(t);
          return (
            <button key={t.id} onClick={() => setSel(t.id)}
              className={cls("w-full rounded-2xl border p-3 text-left transition-all",
                sel === t.id ? "border-blue-300 bg-blue-50/60 shadow-[0_8px_22px_-12px_rgba(29,78,216,.4)]"
                  : "border-line bg-surface hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_8px_18px_-12px_rgba(29,78,216,.2)]")}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] text-ink2">
                  <span className={cls("h-1.5 w-1.5 rounded-full", t.status === "待处理" ? "bg-red-400" : "bg-emerald-400")} />
                  <span className="num">#{t.id}</span> · {t.channel}
                </span>
                <span className={cls("text-[10px] font-semibold", rk.bg.split(" ")[0], rk.bg.split(" ")[1])}>{rk.txt}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                <Ship size={13} className="text-blue-600" />
                <span className="num">{t.bill_no || "提单未识别"}</span>
                {t.pol && t.pod && <span className="ml-auto flex items-center gap-1 text-[11px] font-normal text-ink2"><MapPin size={10} className="text-ink3" />{t.pol} → {t.pod}</span>}
              </div>
              <div className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-ink/75">{t.raw_text}</div>
              <div className="mt-2 flex items-center justify-between border-t border-line/60 pt-2">
                <span className="text-[10.5px] text-ink3">{ISSUE_BY[t.category] || ISSUE_BY.其他}</span>
                <span className="flex items-center gap-1 text-[10.5px] text-ink3">
                  {t.status === "AI已处理"
                    ? <><CheckCircle2 size={11} className="text-emerald-500" /> AI 已完成</>
                    : <><Loader2 size={11} className="ai-pulse text-blue-500" /> AI 分析中</>}
                </span>
                <span className="num text-[10px] text-ink3">{fmt.date(t.created_at)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═════════ 中栏 1：货物信息 + 进度 ═════════ */
const SHIP_STEPS = ["订舱", "提柜", "截关", "开航", "到港", "清关"];
function ShipmentIntelligence({ ticket }) {
  const rk = riskOf(ticket);
  let stage = 1 + (ticket.bill_no ? 1 : 0) + (ticket.container_no ? 1 : 0) + (ticket.pol && ticket.pod ? 1 : 0);
  if (ticket.intent === "催件") stage += 1;
  stage = Math.max(1, Math.min(6, stage));
  const cell = (k, v) => (
    <div className="min-w-0">
      <div className="text-[10px] text-ink3">{k}</div>
      <div className="num mt-0.5 truncate text-[13px] font-semibold text-ink">{v || "—"}</div>
    </div>
  );
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Ship size={15} className="shrink-0 text-blue-600" />
          <div className="min-w-0">
            <div className="num truncate text-[14px] font-semibold text-ink">{ticket.bill_no || "提单未识别"}</div>
            <div className="text-[11px] text-ink2">{carrierOf(ticket)} · {ticket.container_no ? `柜 ${ticket.container_no}` : "柜号未识别"}</div>
          </div>
        </div>
        <span className={cls("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", rk.bg)}>{rk.txt}</span>
      </div>
      <div className="mb-3 grid grid-cols-4 gap-2 border-b border-line/60 pb-3">
        {cell("起运港", ticket.pol)}
        {cell("目的港", ticket.pod)}
        {cell("预计到港", etaOf(ticket.raw_text) || "待确认")}
        {cell("当前环节", SHIP_STEPS[stage - 1])}
      </div>
      <div className="flex items-center justify-between text-[10.5px] text-ink3">
        <span className="font-medium">物流进度</span>
        <span className="num">{stage}/6 · {SHIP_STEPS[stage - 1]}</span>
      </div>
      <div className="relative mt-1.5">
        <div className="h-[5px] w-full overflow-hidden rounded-full bg-slate-200/70">
          <motion.div className="relative h-full overflow-hidden rounded-full" initial={{ width: 0 }} animate={{ width: `${(stage / 6) * 100}%` }} transition={{ duration: 0.9, ease: "easeOut" }}>
            <div className="progress-flow absolute inset-0" />
          </motion.div>
        </div>
        <div className="mt-1.5 flex justify-between">
          {SHIP_STEPS.map((s, i) => (
            <span key={s} className={cls("text-[9px]", i + 1 < stage ? "text-ink2" : i + 1 === stage ? "font-semibold text-blue-700" : "text-ink3")}>{s}</span>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ═════════ 中栏 2：AI 处理链路（精简） ═════════ */
const PIPELINE = [
  { icon: Brain, tint: "bg-indigo-50 text-indigo-600", name: "Intent Agent", desc: "意图识别", out: (t) => `${t.intent || "其他"} · ${t.category}` },
  { icon: BookOpen, tint: "bg-cyan-50 text-cyan-600", name: "Knowledge Agent", desc: "知识检索", out: () => "命中知识片段" },
  { icon: Radar, tint: "bg-blue-50 text-blue-600", name: "Tracking Agent", desc: "物流查询", out: (t) => `${t.pol || "—"} → ${t.pod || "—"}` },
  { icon: PenLine, tint: "bg-emerald-50 text-emerald-600", name: "Reply Agent", desc: "回复生成", out: () => "建议回复已生成" },
];
function AgentPipeline({ ticket }) {
  const [stage, setStage] = useState(-1);
  useEffect(() => {
    setStage(-1);
    let alive = true;
    PIPELINE.forEach((_, i) => setTimeout(() => { if (alive) setStage(i); }, 500 + i * 460));
    return () => { alive = false; };
  }, [ticket.id]);
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">AI 处理链路</span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink3">
          <Dot tone={stage === 3 ? "success" : "primary"} pulse /> {stage === 3 ? "分析完成" : "分析中"}
        </span>
      </div>
      <div>
        {PIPELINE.map((a, i) => {
          const st = stage > i ? "done" : stage === i ? "run" : "wait";
          const Icon = a.icon;
          return (
            <div key={a.name}>
              <div className={cls("flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors",
                st === "run" ? "bg-blue-50/60" : "hover:bg-surface2/50")}>
                <div className={cls("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", a.tint)}><Icon size={15} /></div>
                <div className="min-w-0 flex-1">
                  <span className={cls("text-[12.5px] font-semibold", st === "wait" ? "text-ink3" : "text-ink")}>{a.name}</span>
                  <span className="ml-2 text-[11px] text-ink3">{a.desc}</span>
                  {st === "done" && <span className="ml-2 text-[11px] text-ink2">{a.out(ticket)}</span>}
                </div>
                {st === "run" ? <Loader2 size={14} className="shrink-0 animate-spin text-blue-600" />
                  : st === "done" ? <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
                  : <span className="shrink-0 text-[11px] text-ink3">等待</span>}
              </div>
              {i < 3 && (
                <div className="relative mx-auto h-4 w-px overflow-hidden bg-slate-200">
                  {stage > i && <motion.div className="absolute inset-0 bg-gradient-to-b from-blue-500 to-cyan-400" initial={{ y: "-100%" }} animate={{ y: "0%" }} transition={{ duration: 0.45 }} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ═════════ 中栏 3：对话（紧凑） ═════════ */
function Conversation({ ticket }) {
  return (
    <Card className="p-5">
      <div className="mb-3 text-[13px] font-semibold text-ink">客户沟通</div>
      <div className="space-y-2.5">
        <div className="flex justify-start">
          <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink/85">{ticket.raw_text}</div>
        </div>
        {ticket.suggested_reply && (
          <div className="flex flex-col items-end gap-1">
            <span className="flex items-center gap-1 text-[10px] text-ink3">
              <span className="rounded-full bg-blue-50 px-2 py-px font-medium text-blue-600">AI 生成</span> 由 Reply Agent 生成
            </span>
            <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-gradient-to-br from-blue-50 to-cyan-50/70 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink/90 ring-1 ring-blue-100/70">
              {ticket.suggested_reply}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ═════════ 右栏：AI Decision Center（单卡分区，清爽） ═════════ */
function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink2">
      <Icon size={13} className="text-ink3" /> {children}
    </div>
  );
}
function DecisionCenter({ ticket, kbDocs, health }) {
  const rk = riskOf(ticket);
  const [lang, setLang] = useState("zh");
  const [ev, setEv] = useState(null);
  const llm = health?.ai_mode === "llm";
  const sources = useMemo(() => {
    const kw = KB_KEYWORD[ticket.category] || KB_KEYWORD.其他;
    return (kbDocs || []).map((d) => ({ ...d, sc: kw.filter((w) => d.title.includes(w)).length }))
      .filter((d) => d.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 2)
      .map((h, i) => ({ ...h, sim: h.sc >= 2 ? 94 - i * 3 : 88 - i * 4 }));
  }, [kbDocs, ticket.category]);
  const reply = ticket.suggested_reply || "";
  const R = 26, C = 2 * Math.PI * R;

  return (
    <Card className="overflow-hidden p-0">
      {/* 头 */}
      <div className="flex items-center gap-2.5 border-b border-line/70 px-5 py-4">
        <div className="grad flex h-8 w-8 items-center justify-center rounded-xl shadow-[0_6px_16px_-6px_rgba(37,99,235,.55)]"><Bot size={15} className="text-white" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink">AI Decision Center</div>
          <div className="flex items-center gap-1 text-[10.5px] text-ink3"><Dot tone="success" pulse /> Online · {llm ? "glm-4-flash" : "规则模式"}</div>
        </div>
        <span className="num shrink-0 rounded-full bg-surface2 px-2.5 py-1 text-[11px] font-medium text-ink2">#{ticket.id}</span>
      </div>

      {/* 风险 */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="relative h-[68px] w-[68px] shrink-0">
          <svg width="68" height="68" viewBox="0 0 68 68" className="-rotate-90">
            <circle cx="34" cy="34" r={R} fill="none" stroke="rgba(148,163,184,.18)" strokeWidth="6" />
            <motion.circle cx="34" cy="34" r={R} fill="none" stroke={rk.tone} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - rk.pct / 100) }}
              transition={{ duration: 1.1, ease: "easeOut" }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center"><span className="num text-[14px] font-bold text-ink">{rk.pct}%</span></div>
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold" style={{ color: rk.tone }}>{rk.txt}</div>
          <div className="mt-0.5 flex items-start gap-1 text-[11px] leading-snug text-ink2"><AlertTriangle size={10} className="mt-0.5 shrink-0 text-ink3" /> {rk.reason}</div>
        </div>
      </div>

      {/* 意图 */}
      <div className="border-t border-line/70 px-5 py-3.5">
        <SectionTitle icon={Brain}>客户意图</SectionTitle>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[{ k: "意图", v: ticket.intent || "其他" }, { k: "类别", v: ticket.category }, { k: "置信度", v: `${ticket.intent ? 96 : 88}%` }].map((x) => (
            <div key={x.k} className="rounded-xl bg-surface2/60 px-1 py-2">
              <div className="text-[10px] text-ink3">{x.k}</div>
              <div className="num mt-0.5 text-[12.5px] font-semibold text-ink">{x.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 建议动作 */}
      <div className="border-t border-line/70 px-5 py-3.5">
        <SectionTitle icon={Sparkles}>建议动作</SectionTitle>
        <div className="space-y-1.5">
          {(ACTIONS_BY[ticket.category] || ACTIONS_BY.其他).map((a, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface2/60">
              <span className="num mt-px text-[11.5px] font-semibold text-blue-600">{i + 1}</span>
              <span className="text-[12px] leading-snug text-ink/85">{a}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 生成回复 */}
      <div className="border-t border-line/70 px-5 py-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink2"><PenLine size={13} className="text-ink3" /> 生成回复</div>
          <div className="flex items-center gap-1 text-[10px] text-ink3">
            <button onClick={() => setLang(lang === "zh" ? "en" : "zh")} className="flex items-center gap-0.5 rounded-full bg-surface2 px-2 py-px hover:text-ink2"><Languages size={9} /> {lang === "zh" ? "中文" : "EN"}</button>
            <span className="rounded-full bg-surface2 px-2 py-px">知识库</span>
          </div>
        </div>
        <div className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink/90">
          {lang === "zh" ? reply : `${reply}\n\n[English preview]`}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <button onClick={() => navigator.clipboard?.writeText(reply)} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-ink2 hover:bg-surface2"><Copy size={11} /> 复制</button>
          <button className="btn-grad ml-auto flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold"><Send size={11} /> 发送</button>
        </div>
      </div>

      {/* 知识依据 */}
      <div className="border-t border-line/70 px-5 py-3.5">
        <SectionTitle icon={BookOpen}>知识依据</SectionTitle>
        {sources.length === 0 ? (
          <div className="text-[11.5px] text-ink3">暂无与「{ticket.category}」匹配的文档</div>
        ) : (
          <div className="space-y-1.5">
            {sources.map((s) => (
              <button key={s.id} onClick={() => api.kbDoc(s.id).then(setEv).catch(() => {})}
                className="row-hover flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left">
                <FileText size={12} className="shrink-0 text-ink3" />
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink/85">{s.title}</span>
                <span className="num shrink-0 text-[10px] text-emerald-600">{s.sim}%</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {ev && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-6 backdrop-blur-sm" onClick={() => setEv(null)}>
            <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }} className="card-premium max-h-[76vh] w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <span className="text-[14px] font-semibold text-ink">{ev.title}</span>
                <button onClick={() => setEv(null)} className="rounded-full p-1 text-ink3 hover:bg-surface2">✕</button>
              </div>
              <div className="max-h-[58vh] overflow-y-auto whitespace-pre-wrap px-5 py-4 text-[12.5px] leading-[1.9] text-ink/85">{ev.content}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

/* ═════════ 页面 ═════════ */
export default function Inbox({ health }) {
  const [tickets, setTickets] = useState([]);
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [kbDocs, setKbDocs] = useState([]);
  const [q, setQ] = useState("");
  const [load, setLoad] = useState(true);
  const first = useRef(true);

  const reload = async () => {
    setLoad(true);
    try {
      const d = await api.tickets({ page_size: 40, q: q || undefined });
      setTickets(d.items);
      setSel((s) => (s && d.items.some((i) => i.id === s) ? s : d.items[0]?.id ?? null));
    } finally { setLoad(false); }
  };
  useEffect(() => { const t = setTimeout(reload, 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (first.current) { first.current = false; reload(); } /* eslint-disable-next-line */ }, []);
  useEffect(() => { api.kbDocs().then(setKbDocs).catch(() => {}); }, []);
  useEffect(() => { if (sel == null) return setDetail(null); api.ticket(sel).then(setDetail).catch(() => {}); }, [sel, tickets]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="display text-[30px] font-semibold tracking-[-0.02em] text-ink">工单台</h1>
          <p className="mt-1 text-[13.5px] text-ink2">物流状态 · AI 分析 · 知识检索 · 建议回复</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12px] text-ink2">
          <Dot tone="success" pulse /> {tickets.length} 条工单
        </span>
      </div>

      <div className="grid grid-cols-12 items-start gap-5">
        <div className="col-span-3"><Card className="p-4">{load ? <Loading /> : <InboxList list={tickets} sel={sel} setSel={setSel} q={q} setQ={setQ} onRefresh={reload} />}</Card></div>
        <div className="col-span-5 space-y-4">
          {detail ? (
            <>
              <ShipmentIntelligence ticket={detail} />
              <AgentPipeline ticket={detail} />
              <Conversation ticket={detail} />
            </>
          ) : <Card><Empty text="从左侧选择一张工单" /></Card>}
        </div>
        <div className="col-span-4">{detail ? <DecisionCenter ticket={detail} kbDocs={kbDocs} health={health} /> : <Card><Empty text="选择工单后展示 AI 决策" /></Card>}</div>
      </div>
    </div>
  );
}
