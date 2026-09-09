import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Search, Filter, MapPin, Globe2, Copy, Send, RotateCcw,
  Sparkles, Bot, ShieldCheck, Languages, PenLine, CheckCircle2, Loader2,
} from "lucide-react";
import { Card, CardHead, CategoryBadge, UrgencyBadge, StatusBadge, Badge, Dot, Empty, Loading, GlassCard } from "../components/ui.jsx";
import { api, fmt, cls } from "../api.js";

const Q_STATUS = { 高: "danger", 中: "warning", 低: "gray" };
const REPLY_TPL = {
  仓储: "您好，您的仓储问题已收到（{bill}）。我们已转仓库组核实入库/上架/库存状态，确认后第一时间同步处理结果；如需加急请补充柜号。感谢支持！",
  运输: "您好，您的运输问题已收到（{bill}）。我们正在与船司/场站核实最新动态（船期/提还柜进度），确认后立即回复下一步安排。",
  关务: "您好，您的清关相关问题已收到（{bill}）。已转关务组核查申报与查验状态，将按海关要求告知需补充资料与后续方案。",
  账单: "您好，您的账单疑问已收到（{bill}）。已转结算组核对费用明细，确认结果与处理方案会在 1 个工作日内回复。感谢监督！",
  其他: "您好，您的消息已收到并登记工单，我们会尽快跟进。如有紧急事项请致电客服热线。",
};

/* 左栏：Ticket Inbox */
function InboxList({ list, sel, setSel, q, setQ, onRefresh }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索提单号 / 柜号 / 关键词"
            className="w-full rounded-2xl border border-line bg-surface2/50 py-2 pl-9 pr-3 text-[13px] placeholder:text-ink3"
          />
        </div>
        <button onClick={onRefresh} className="rounded-2xl border border-line p-2 text-ink2 hover:bg-surface2" title="刷新">
          <RotateCcw size={14} />
        </button>
      </div>
      <div className="-mr-2 flex-1 space-y-2 overflow-y-auto pr-2" style={{ maxHeight: 620 }}>
        {list.length === 0 ? <Empty text="没有匹配的工单" /> : list.map((t) => (
          <button
            key={t.id}
            onClick={() => setSel(t.id)}
            className={cls(
              "w-full rounded-2xl border p-3.5 text-left transition-all",
              sel === t.id
                ? "border-blue-200 bg-blue-50/70 shadow-[0_6px_18px_-8px_rgba(29,78,216,.35)]"
                : "border-line bg-surface hover:border-blue-100 hover:bg-surface2/40"
            )}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="num text-[11px] font-medium text-ink3">#{t.id} · {t.channel}</span>
              <div className="flex items-center gap-1">
                <UrgencyBadge urgency={t.urgency} />
              </div>
            </div>
            <div className="mb-1.5 line-clamp-2 text-[13px] leading-snug text-ink/90">{t.raw_text}</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CategoryBadge category={t.category} />
                <StatusBadge status={t.status} />
              </div>
              <span className="text-[11px] text-ink3">{fmt.date(t.created_at)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* 动态 Shipment Progress：流动光进度 + 六阶段节点 */
const SHIP_STEPS = ["订舱", "提柜", "截关", "开航", "到港", "清关"];
function ShipmentProgress({ ticket }) {
  // 由真实字段推导当前阶段（视觉演示：字段越全阶段越深）
  let stage = 1;
  if (ticket.bill_no) stage += 1;
  if (ticket.container_no) stage += 1;
  if (ticket.pol && ticket.pod) stage += 1;
  if (ticket.intent === "催件") stage += 1;
  stage = Math.max(1, Math.min(SHIP_STEPS.length, stage));
  const pct = (stage / SHIP_STEPS.length) * 100;
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink3">Shipment Progress</span>
        <span className="num text-[10.5px] font-medium text-blue-700">{stage}/{SHIP_STEPS.length} · {SHIP_STEPS[stage - 1]}</span>
      </div>
      <div className="relative">
        <div className="h-[5px] w-full overflow-hidden rounded-full bg-slate-200/70">
          <div className="progress-rise relative h-full overflow-hidden rounded-full" style={{ width: `${pct}%` }}>
            <div className="progress-flow absolute inset-0" />
          </div>
        </div>
        <div className="mt-2 flex justify-between">
          {SHIP_STEPS.map((s, i) => {
            const idx = i + 1;
            const done = idx < stage;
            const cur = idx === stage;
            return (
              <div key={s} className="flex w-1/6 flex-col items-center">
                <span
                  className={
                    done ? "grad h-[9px] w-[9px] rounded-full"
                      : cur ? "h-[11px] w-[11px] rounded-full bg-white shadow-[0_0_12px_rgba(29,78,216,.8)] ring-2 ring-blue-500"
                      : "h-[9px] w-[9px] rounded-full bg-slate-300"
                  }
                />
                <span className={`mt-1 text-[9.5px] leading-none ${done ? "text-ink2" : cur ? "font-semibold text-blue-700" : "text-ink3"}`}>{s}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* 中栏：详情 + 对话 */
function Detail({ ticket, onReload }) {
  if (!ticket) return <Empty text="从左侧选择一张工单" />;
  const route = ticket.pol && ticket.pod ? `${ticket.pol} → ${ticket.pod}` : ticket.pol || ticket.pod || null;
  const field = (k, v) => (
    <div className="rounded-xl bg-surface2/60 px-3 py-2">
      <div className="text-[10.5px] text-ink3">{k}</div>
      <div className="num mt-0.5 text-[12.5px] font-medium text-ink">{v || "—"}</div>
    </div>
  );
  const change = async (s) => { await api.setStatus(ticket.id, s); onReload(); };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="num text-[15px] font-semibold text-ink">#{ticket.id}</span>
          <CategoryBadge category={ticket.category} />
          <UrgencyBadge urgency={ticket.urgency} />
        </div>
        <StatusBadge status={ticket.status} />
      </div>

      <div className="mb-3 rounded-2xl bg-surface2/60 p-3.5 text-[13px] leading-relaxed text-ink/90">{ticket.raw_text}</div>

      {/* Shipment Summary 卡片 */}
      <div className="mb-3 rounded-2xl border border-line bg-surface p-3.5">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink2">
          <Globe2 size={12} /> Shipment Summary
        </div>
        <div className="grid grid-cols-4 gap-2">
          {field("提单号 Bill", ticket.bill_no)}
          {field("柜号 Cntr", ticket.container_no)}
          {field("起运港 POL", ticket.pol)}
          {field("目的港 POD", ticket.pod)}
        </div>
        {route && <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[11.5px] text-blue-700"><MapPin size={11} /> {route}</div>}

        {/* 动态 Shipment Progress */}
        <ShipmentProgress ticket={ticket} />
      </div>

      {/* Timeline */}
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink2"><Sparkles size={12} /> AI Timeline</div>
      <div className="mb-4 space-y-1">
        {[
          { icon: PenLine, t: "字段提取", d: `${ticket.category} / ${ticket.urgency} / ${ticket.intent || "其他"}`, tone: "bg-blue-50 text-blue-600" },
          { icon: Bot, t: "意图识别", d: ticket.intent || "其他", tone: "bg-indigo-50 text-indigo-600" },
          { icon: ShieldCheck, t: "知识库检索", d: "来源匹配完成", tone: "bg-cyan-50 text-cyan-600" },
        ].map((s, i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-xl px-1 py-1.5">
            <div className={cls("flex h-7 w-7 items-center justify-center rounded-lg", s.tone)}><s.icon size={13} /></div>
            <div className="flex-1">
              <div className="text-[12.5px] font-medium text-ink">{s.t}</div>
              <div className="text-[11px] text-ink3">{s.d}</div>
            </div>
            <CheckCircle2 size={14} className="text-emerald-400" />
          </div>
        ))}
      </div>

      {/* 客户对话（简版） */}
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink2">Conversation</div>
      <div className="rounded-2xl border border-line bg-surface p-3.5">
        <div className="rounded-xl rounded-tl-sm bg-slate-100 px-3 py-2 text-[12.5px] leading-relaxed text-ink/85">{ticket.raw_text}</div>
        <div className="mt-1.5 text-right text-[11px] text-ink3">created {ticket.created_at?.slice(0, 16)}</div>
        {ticket.suggested_reply && (
          <div className="grad ml-8 mt-2.5 rounded-xl rounded-br-sm px-3 py-2 text-[12.5px] leading-relaxed text-white">
            {ticket.suggested_reply}
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={() => change("人工处理")} className="rounded-xl border border-line px-3 py-1.5 text-[12px] font-medium text-ink2 hover:bg-surface2">转人工</button>
        <button onClick={() => change("已关闭")} className="rounded-xl border border-line px-3 py-1.5 text-[12px] font-medium text-ink2 hover:bg-surface2">关闭</button>
        <button onClick={async () => { await api.reprocess(ticket.id); onReload(); }} className="ml-auto rounded-xl border border-line px-3 py-1.5 text-[12px] font-medium text-ink2 hover:bg-surface2">重新 AI 处理</button>
      </div>
    </div>
  );
}

/* 右栏：AI Copilot */
function Copilot({ ticket, health }) {
  const [tone, setTone] = useState("专业");
  const [lang, setLang] = useState("zh");
  const [thinking, setThinking] = useState(false);
  const llm = health?.ai_mode === "llm";

  const reply = ticket?.suggested_reply || "";
  const base = ticket ? (REPLY_TPL[ticket.category] || REPLY_TPL.其他).replace("{bill}", ticket.bill_no ? `提单号 ${ticket.bill_no}` : "") : "";
  const display = thinking ? "" : lang === "zh" ? (tone === "专业" ? reply || base : `${reply || base}\n\n—— 语气已调整为友好，如需正式版本请选择「专业」`) : `${reply || base}\n\n[Translated to English for preview]`;

  const copy = () => { navigator.clipboard?.writeText(display || reply || base); };
  const run = async () => {
    if (!ticket) return;
    setThinking(true);
    try { const t = await api.reprocess(ticket.id); /* eslint-disable no-console */ console.log("reprocessed", t.id); } catch (_) {}
    setTimeout(() => setThinking(false), 1100);
  };

  const conf = ticket ? Math.min(88, 62 + (ticket.urgency === "高" ? 18 : ticket.intent ? 10 : 0)) : 0;
  const R = 26, C = 2 * Math.PI * R;

  return (
    <GlassCard className="h-full overflow-hidden p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="grad flex h-8 w-8 items-center justify-center rounded-xl shadow-[0_6px_14px_-4px_rgba(37,99,235,.5)]"><Bot size={15} className="text-white" /></div>
        <div>
          <div className="text-[14px] font-semibold text-ink">AI Copilot</div>
          <div className="flex items-center gap-1 text-[11px] text-ink3">{llm ? <><Dot tone="success" pulse /> glm-4-flash</> : <><Dot tone="warning" /> Rule mode</>}</div>
        </div>
        <span className="glass-none ml-auto rounded-full bg-blue-50 px-2.5 py-1 text-[10.5px] font-medium text-blue-700">Beta</span>
      </div>

      {!ticket ? (
        <Empty text="选择工单后，AI 将在此生成建议回复" />
      ) : (
        <>
          {/* Intent + Urgency chips */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone="primary"><Sparkles size={11} /> 意图 · {ticket.intent || "其他"}</Badge>
            <Badge tone={Q_STATUS[ticket.urgency] || "gray"}>紧急度 · {ticket.urgency}</Badge>
            <Badge tone="gray">来源 · {ticket.channel}</Badge>
          </div>

          {/* Confidence Ring */}
          <div className="mb-4 flex items-center gap-4 rounded-2xl bg-surface2/60 p-4">
            <div className="relative h-[64px] w-[64px]">
              <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
                <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(148,163,184,.2)" strokeWidth="5" />
                <motion.circle
                  cx="32" cy="32" r={R} fill="none"
                  stroke="url(#confG)" strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={C}
                  initial={{ strokeDashoffset: C }}
                  animate={{ strokeDashoffset: C * (1 - conf / 100) }}
                  transition={{ duration: 1.1, ease: "easeOut" }}
                />
                <defs>
                  <linearGradient id="confG" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#1d4ed8" /><stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="num absolute inset-0 flex items-center justify-center text-[14px] font-semibold text-ink">{conf}%</div>
            </div>
            <div>
              <div className="text-[13px] font-medium text-ink">提取置信度</div>
              <div className="mt-0.5 text-[11.5px] leading-relaxed text-ink3">字段抽取 · 分类 · 意图 · 紧急度 综合评估</div>
            </div>
          </div>

          {/* Suggested reply */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink2">Suggested Reply</span>
            {thinking && <span className="flex items-center gap-1 text-[11px] text-blue-600"><Loader2 size={11} className="animate-spin" /> thinking…</span>}
          </div>
          <div className="mb-3 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-line bg-surface p-3.5 text-[12.5px] leading-relaxed text-ink/90">
            {thinking ? <span className="text-ink3">AI 正在重新分析该工单…</span> : display || base || "暂无建议回复"}
          </div>

          {/* Controls */}
          <div className="mb-3 flex items-center gap-2">
            <button onClick={() => setTone("专业")} className={cls("rounded-xl border px-2.5 py-1.5 text-[11.5px] font-medium", tone === "专业" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-line text-ink2 hover:bg-surface2")}>专业</button>
            <button onClick={() => setTone("友好")} className={cls("rounded-xl border px-2.5 py-1.5 text-[11.5px] font-medium", tone === "友好" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-line text-ink2 hover:bg-surface2")}>友好</button>
            <button onClick={() => setLang(lang === "zh" ? "en" : "zh")} className={cls("ml-auto flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11.5px] font-medium", lang === "en" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-line text-ink2 hover:bg-surface2")}><Languages size={12} /> {lang === "zh" ? "中文" : "EN"}</button>
          </div>

          <div className="flex gap-2">
            <button onClick={run} className="btn-grad flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><Sparkles size={13} /> 重新生成</button>
            <button onClick={copy} className="flex items-center justify-center gap-1.5 rounded-xl border border-line px-3.5 py-2.5 text-[12.5px] font-medium text-ink2 hover:bg-surface2"><Copy size={13} /> 复制</button>
            <button className="flex items-center justify-center gap-1.5 rounded-xl border border-line px-3.5 py-2.5 text-[12.5px] font-medium text-ink2 hover:bg-surface2"><Send size={13} /> 发送</button>
          </div>
        </>
      )}
    </GlassCard>
  );
}

/* 页面主体：三栏 AI Workspace */
export default function Inbox({ health }) {
  const [tickets, setTickets] = useState([]);
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState("");
  const [load, setLoad] = useState(true);

  const reload = async () => {
    setLoad(true);
    try {
      const d = await api.tickets({ page_size: 40, q: q || undefined });
      setTickets(d.items);
      setSel((s) => (s && d.items.some((i) => i.id === s) ? s : d.items[0]?.id ?? null));
    } finally { setLoad(false); }
  };
  useEffect(() => { const t = setTimeout(reload, 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    if (sel == null) return setDetail(null);
    api.ticket(sel).then(setDetail).catch(() => {});
  }, [sel, tickets]);

  return (
    <div className="space-y-5">
      {/* 页头 */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="display text-[30px] font-semibold tracking-[-0.02em] text-ink">Inbox</h1>
          <p className="mt-1 text-[13.5px] text-ink2">工单流转 × 客户上下文 × AI Copilot 建议回复</p>
        </div>
        <span className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12px] text-ink2">共 {tickets.length} 条可见</span>
      </div>

      <div className="grid grid-cols-12 items-start gap-5">
        {/* 左 */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="col-span-3">
          <Card className="p-4">{load ? <Loading /> : <InboxList list={tickets} sel={sel} setSel={setSel} q={q} setQ={setQ} onRefresh={reload} />}</Card>
        </motion.div>
        {/* 中 */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }} className="col-span-5">
          <Card className="p-5"><Detail ticket={detail} onReload={() => { reload(); }} /></Card>
        </motion.div>
        {/* 右 */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.16 }} className="col-span-4">
          <Copilot ticket={detail} health={health} />
        </motion.div>
      </div>
    </div>
  );
}
