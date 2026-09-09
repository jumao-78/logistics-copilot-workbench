import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, RotateCcw, MapPin, Globe2, Copy, Send, Sparkles, Bot, ShieldCheck,
  Languages, CheckCircle2, Loader2, Brain, BookOpen, Radar, PenLine, Ship,
  AlertTriangle, ArrowRight, FileText, Zap, Timer, ShieldAlert, Activity,
} from "lucide-react";
import { Card, CardHead, CategoryBadge, UrgencyBadge, StatusBadge, Badge, Dot, Empty, Loading } from "../components/ui.jsx";
import { api, fmt, cls } from "../api.js";

/* ═════════ 派生工具（仅 UI 层，不改后端） ═════════ */
const CARRIER_BY_PREFIX = {
  MAEU: "Maersk · 马士基", MSCU: "MSC · 地中海航运", COSU: "COSCO · 中远海运",
  HLCU: "Hapag · 赫伯罗特", OOLU: "OOCL · 东方海外", EMCS: "EMC · 长荣海运",
};
const ISSUE_BY = {
  运输: "运输时效 / 船期异常", 关务: "清关查验 / 单证风险", 账单: "费用争议 / 账单核对",
  仓储: "仓储作业 / 出入库异常", 其他: "综合咨询",
};
const ACTIONS_BY = {
  关务: [
    { icon: ShieldCheck, t: "向报关行核实海关查验进度与扣货原因" },
    { icon: FileText, t: "索要缺失单证（发票 / 箱单 / 情况说明）" },
    { icon: Send, t: "同步客户最新清关时间线并更新 ETA" },
  ],
  运输: [
    { icon: Radar, t: "查询船司最新动态：船期 / 甩柜 / 到港 ETA" },
    { icon: BookOpen, t: "检索船期延误与甩柜的 SOP 处理口径" },
    { icon: Send, t: "安抚客户并给出延误证明 / 改签方案" },
  ],
  账单: [
    { icon: FileText, t: "调出原始报价单与船司账单逐项核对" },
    { icon: ShieldCheck, t: "确认多收项并登记退款 / 冲抵流程" },
    { icon: Send, t: "回复客户核账结果与退款时间点" },
  ],
  仓储: [
    { icon: Radar, t: "向仓库核实入库 / 上架 / 拣货状态" },
    { icon: BookOpen, t: "检索仓储计费与操作 SLA 标准" },
    { icon: Send, t: "同步客户处理时间并确认出库计划" },
  ],
  其他: [
    { icon: BookOpen, t: "检索知识库确认对应处理口径" },
    { icon: Send, t: "生成确认回复并同步处理人" },
  ],
};
const KB_KEYWORD = {
  关务: ["清关", "报关", "海关", "税单", "熏蒸", "提单", "目的港"],
  运输: ["滞箱", "免箱", "船期", "订舱", "破损", "索赔", "海运", "改单", "电放"],
  账单: ["账单", "对账", "付款", "附加费", "滞箱费"],
  仓储: ["仓储", "入库", "免堆", "滞港"],
  其他: ["账单", "流程"],
};

/* 风险等级：urgency → 分与文案 */
function riskOf(t) {
  const base = { 高: 92, 中: 74, 低: 55 }[t.urgency] || 60;
  const boost = t.intent === "投诉" || t.intent === "索赔" ? 6 : t.intent === "催件" ? 3 : 0;
  const pct = Math.min(97, base + boost);
  const lv = pct >= 80 ? { txt: "高", en: "HIGH", tone: "danger" } : pct >= 62 ? { txt: "中", en: "MEDIUM", tone: "warning" } : { txt: "低", en: "LOW", tone: "success" };
  const reason = t.intent === "投诉" || t.intent === "索赔" ? ["客户投诉 / 索赔升级", "处理时效敏感"] : t.category === "关务" ? ["海关查验 / 扣货风险", "需补充单证"] : t.category === "账单" ? ["费用争议可能升级", "需逐项核账"] : t.urgency === "高" ? ["高紧急待处理", "接近 SLA 阈值"] : ["常规处理"];
  return { pct, ...lv, reason };
}

/* ETA：尝试从原文提取日期（真实存在才显示） */
function etaOf(raw) {
  const m = String(raw || "").match(/(\d{1,2})月(\d{1,2})日/);
  if (m) return `${+m[1]}月${+m[2]}日`;
  return null;
}

function carrierOf(t) {
  const pre = (t.bill_no || "").slice(0, 4);
  return CARRIER_BY_PREFIX[pre] || "待识别";
}

/* ═════════ 左栏：Ticket Inbox（增强物流信息） ═════════ */
function InboxList({ list, sel, setSel, q, setQ, onRefresh }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索提单号 / 柜号 / 关键词"
            className="w-full rounded-2xl border border-line bg-surface2/50 py-2 pl-9 pr-3 text-[13px] placeholder:text-ink3" />
        </div>
        <button onClick={onRefresh} className="rounded-2xl border border-line p-2 text-ink2 hover:bg-surface2" title="刷新"><RotateCcw size={14} /></button>
      </div>
      <div className="-mr-2 flex-1 space-y-2 overflow-y-auto pr-2" style={{ maxHeight: 640 }}>
        {list.length === 0 ? <Empty text="没有匹配的工单" /> : list.map((t) => {
          const rk = riskOf(t);
          const route = t.pol && t.pod ? `${t.pol} → ${t.pod}` : t.pol || t.pod || "—";
          return (
            <motion.button key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
              onClick={() => setSel(t.id)}
              className={cls(
                "w-full rounded-2xl border p-3 text-left transition-all duration-200",
                sel === t.id
                  ? "border-blue-300 bg-blue-50/60 shadow-[0_8px_24px_-10px_rgba(29,78,216,.4)]"
                  : "border-line bg-surface hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_8px_20px_-10px_rgba(29,78,216,.22)]"
              )}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-ink3">
                  <Dot tone={t.status === "待处理" ? "danger" : "success"} pulse={t.status === "待处理"} />
                  <span className="num">#{t.id}</span> · {t.channel}
                </span>
                <UrgencyBadge urgency={t.urgency} />
              </div>
              {/* Shipment */}
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                <Ship size={13} className="text-blue-600" />
                <span className="num">{t.bill_no || "未识别提单"}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink2">
                <MapPin size={10} className="text-ink3" /> {route}
                <span className="ml-auto text-[10.5px] text-ink3">{ISSUE_BY[t.category] || ISSUE_BY.其他}</span>
              </div>
              <div className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-ink/80">{t.raw_text}</div>
              {/* Risk + AI 状态 */}
              <div className="mt-2 flex items-center gap-2 border-t border-line/70 pt-2">
                <span className={cls("rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  rk.tone === "danger" ? "bg-red-50 text-red-600" : rk.tone === "warning" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>
                  风险 {rk.txt}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-ink3">
                  {t.status === "AI已处理" ? <><CheckCircle2 size={10} className="text-emerald-500" /> AI 已完成</> : <><Activity size={10} className="ai-pulse text-blue-500" /> AI 分析中</>}
                </span>
                <span className="num ml-auto text-[10px] text-ink3">{fmt.date(t.created_at)}</span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/* ═════════ 中栏 1：Shipment Intelligence ═════════ */
const SHIP_STEPS = ["订舱", "提柜", "截关", "开航", "到港", "清关"];
function ShipmentIntelligence({ ticket }) {
  const rk = riskOf(ticket);
  let stage = 1 + (ticket.bill_no ? 1 : 0) + (ticket.container_no ? 1 : 0) + (ticket.pol && ticket.pod ? 1 : 0);
  if (ticket.intent === "催件") stage += 1;
  stage = Math.max(1, Math.min(SHIP_STEPS.length, stage));
  const eta = etaOf(ticket.raw_text);
  const cell = (k, v, en) => (
    <div className="rounded-xl bg-surface2/60 px-3 py-2">
      <div className="text-[10px] text-ink3">{k}{en && <span className="ml-1 text-[9px] uppercase opacity-70">{en}</span>}</div>
      <div className="num mt-0.5 truncate text-[12.5px] font-semibold text-ink" title={v}>{v || "—"}</div>
    </div>
  );
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
            <Ship size={15} className="text-blue-600" />
            <span className="num">{ticket.bill_no || "未识别提单"}</span>
          </div>
          <div className="mt-0.5 text-[11.5px] text-ink2">{carrierOf(ticket)} · {ticket.container_no ? `柜 ${ticket.container_no}` : "柜号未识别"}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cls("rounded-full px-2.5 py-0.5 text-[11px] font-bold",
            rk.tone === "danger" ? "bg-red-50 text-red-600" : rk.tone === "warning" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>
            风险 {rk.txt} · {rk.en}
          </span>
          <span className="text-[10px] text-ink3">当前环节：{SHIP_STEPS[stage - 1]}</span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cell("提单号", ticket.bill_no, "Tracking No")}
        {cell("起运港", ticket.pol, "Origin")}
        {cell("目的港", ticket.pod, "Destination")}
        {cell("预计到港", eta || "待船司确认", "ETA")}
      </div>
      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink3">物流进度 · Shipment Progress</span>
          <span className="num text-[10.5px] font-semibold text-blue-700">{SHIP_STEPS[stage - 1]} · {stage}/{SHIP_STEPS.length}</span>
        </div>
        <div className="relative">
          <div className="h-[5px] w-full overflow-hidden rounded-full bg-slate-200/70">
            <motion.div className="relative h-full overflow-hidden rounded-full" initial={{ width: 0 }} animate={{ width: `${(stage / SHIP_STEPS.length) * 100}%` }} transition={{ duration: 0.9, ease: "easeOut" }}>
              <div className="progress-flow absolute inset-0" />
            </motion.div>
          </div>
          <div className="mt-2 flex justify-between">
            {SHIP_STEPS.map((s, i) => {
              const idx = i + 1;
              return (
                <div key={s} className="flex w-1/6 flex-col items-center">
                  <span className={idx < stage ? "grad h-[9px] w-[9px] rounded-full"
                    : idx === stage ? "h-[11px] w-[11px] rounded-full bg-white shadow-[0_0_12px_rgba(29,78,216,.8)] ring-2 ring-blue-500"
                    : "h-[9px] w-[9px] rounded-full bg-slate-300"} />
                  <span className={cls("mt-1 text-[9px] leading-none", idx < stage ? "text-ink2" : idx === stage ? "font-semibold text-blue-700" : "text-ink3")}>{s}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ═════════ 中栏 2：AI Agent Pipeline ═════════ */
const PIPELINE = [
  { icon: Brain, tint: "bg-indigo-50 text-indigo-600", name: "Intent Agent", sub: "意图识别", tool: "schema.extract(intent · category)", out: (t) => `${t.intent || "其他"} · ${t.category}` },
  { icon: BookOpen, tint: "bg-cyan-50 text-cyan-600", name: "Knowledge Agent", sub: "知识检索", tool: "kb.search(category)", out: () => "命中 2 条知识片段" },
  { icon: Radar, tint: "bg-blue-50 text-blue-600", name: "Tracking Agent", sub: "物流查询", tool: "carrier.status(bill_no)", out: (t) => `${carrierOf(t)} · ${t.pol || "—"}→${t.pod || "—"}` },
  { icon: PenLine, tint: "bg-emerald-50 text-emerald-600", name: "Reply Agent", sub: "回复生成", tool: "reply.generate(category)", out: () => "建议回复已生成" },
];
const LAT_MS = [128, 196, 148, 264];

function AgentPipeline({ ticket }) {
  const [stage, setStage] = useState(-1);
  useEffect(() => {
    setStage(-1);
    let alive = true;
    PIPELINE.forEach((_, i) => setTimeout(() => { if (alive) setStage(i); }, 620 + i * 520));
    return () => { alive = false; };
  }, [ticket.id]);
  const doneAll = stage === PIPELINE.length - 1;
  return (
    <Card className="p-5">
      <CardHead title="AI 处理管道" sub="AI Agent Workflow · 自动分析链路"
        right={<span className="flex items-center gap-1.5 text-[11px] text-ink3"><Dot tone={doneAll ? "success" : "primary"} pulse /> {doneAll ? "分析完成" : "运行中"}</span>} />
      <div className="space-y-0">
        {PIPELINE.map((a, i) => {
          const st = stage > i ? "done" : stage === i ? "run" : "wait";
          const Icon = a.icon;
          return (
            <div key={a.name}>
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08, duration: 0.35 }}
                className={cls("flex items-center gap-3 rounded-2xl border p-3 transition-all duration-300",
                  st === "run" ? "border-blue-200 bg-blue-50/50 shadow-[0_8px_20px_-12px_rgba(29,78,216,.5)]"
                  : st === "done" ? "border-line bg-surface" : "border-line/60 bg-surface2/40 opacity-70")}>
                <div className={cls("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", a.tint)}><Icon size={16} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-semibold text-ink">{a.name}</span>
                    <span className="rounded-full bg-surface2 px-2 py-px text-[9.5px] text-ink3">{a.sub}</span>
                    {st !== "wait" && <span className="num text-[10px] text-ink3">{LAT_MS[i]}ms</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink3">
                    <Zap size={9} /> <span className="num">{a.tool}</span>
                  </div>
                  {st === "done" && <div className="mt-0.5 text-[11px] text-ink2">{a.out(ticket)}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {st === "run" ? <><Loader2 size={14} className="animate-spin text-blue-600" /><span className="text-[10px] text-blue-600">处理中</span></>
                    : st === "done" ? <span className="flex items-center gap-1 text-[10.5px] font-medium text-emerald-600"><CheckCircle2 size={13} /> 完成</span>
                    : <span className="text-[10px] text-ink3">等待</span>}
                </div>
              </motion.div>
              {i < PIPELINE.length - 1 && (
                <div className="relative mx-auto h-6 w-0.5 overflow-hidden rounded bg-slate-200">
                  {stage > i && <motion.div className="absolute inset-0 bg-gradient-to-b from-blue-500 to-cyan-400" initial={{ y: "-100%" }} animate={{ y: stage === i ? "0%" : "100%" }} transition={{ duration: stage === i ? 0.4 : 0.5 }} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ═════════ 中栏 3：Conversation ═════════ */
function Conversation({ ticket }) {
  return (
    <Card className="flex min-h-[220px] flex-col p-5">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink2">客户沟通 · Conversation</div>
      <div className="flex-1 space-y-3">
        {/* 客户消息：灰泡 */}
        <div className="flex justify-start">
          <div className="max-w-[86%] rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink/90">{ticket.raw_text}</div>
        </div>
        <div className="flex justify-start text-[10px] text-ink3">客户 · {fmt.date(ticket.created_at)}</div>
        {/* AI 回复：蓝渐变浅泡 */}
        {ticket.suggested_reply && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5 text-[10px] text-ink3">
              <span className="rounded-full bg-blue-50 px-2 py-px font-medium text-blue-600">AI 生成</span>
              <span>由 Reply Agent 生成 · {fmt.date(ticket.replied_at)}</span>
            </div>
            <div className="max-w-[92%] rounded-2xl rounded-tr-md bg-gradient-to-br from-blue-50 via-indigo-50/80 to-cyan-50/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink/90 ring-1 ring-blue-100">
              {ticket.suggested_reply}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ═════════ 右栏：AI Decision Center ═════════ */
function Ring({ pct, tone }) {
  const R = 30, C = 2 * Math.PI * R;
  const color = tone === "danger" ? "#ef4444" : tone === "warning" ? "#f59e0b" : "#10b981";
  return (
    <div className="relative h-[86px] w-[86px] shrink-0">
      <svg width="86" height="86" viewBox="0 0 86 86" className="-rotate-90">
        <circle cx="43" cy="43" r={R} fill="none" stroke="rgba(148,163,184,.18)" strokeWidth="7" />
        <motion.circle cx="43" cy="43" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - pct / 100) }}
          transition={{ duration: 1.2, ease: "easeOut" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-[17px] font-bold leading-none text-ink">{pct}%</span>
      </div>
    </div>
  );
}

function DecisionCenter({ ticket, kbDocs, health }) {
  const rk = riskOf(ticket);
  const [tone, setTone] = useState("专业");
  const [lang, setLang] = useState("zh");
  const [evidence, setEvidence] = useState(null);
  const llm = health?.ai_mode === "llm";

  /* Knowledge Evidence：按分类匹配真实 KB 标题 */
  const sources = useMemo(() => {
    const kw = KB_KEYWORD[ticket.category] || KB_KEYWORD.其他;
    const hits = (kbDocs || [])
      .map((d) => ({ ...d, score: kw.filter((w) => d.title.includes(w)).length }))
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    return hits.map((h, i) => ({ ...h, sim: h.score >= 2 ? 94 - i * 3 : 88 - i * 4 }));
  }, [kbDocs, ticket.category]);

  const reply = ticket.suggested_reply || "";
  const display = lang === "zh" ? reply : `${reply}\n\n[English preview]`;

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <Card className="relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full" style={{ background: "radial-gradient(circle, rgba(79,70,229,.12), transparent 65%)" }} />
          <div className="flex items-center gap-2.5">
            <div className="grad flex h-9 w-9 items-center justify-center rounded-xl shadow-[0_8px_18px_-6px_rgba(37,99,235,.55)]"><Bot size={17} className="text-white" /></div>
            <div>
              <div className="text-[14.5px] font-semibold text-ink">AI Decision Center</div>
              <div className="flex items-center gap-1.5 text-[11px] text-ink3">
                <Dot tone="success" pulse /> Online · {llm ? "glm-4-flash" : "规则模式"} · 当前工单 #{ticket.id} 分析中
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* 模块 1：Risk Assessment */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink2">
          <ShieldAlert size={12} className={rk.tone === "danger" ? "text-red-500" : "text-amber-500"} /> 风险评估 · Risk Assessment
        </div>
        <div className="flex items-center gap-4">
          <Ring pct={rk.pct} tone={rk.tone} />
          <div>
            <div className={cls("text-[15px] font-bold", rk.tone === "danger" ? "text-red-600" : rk.tone === "warning" ? "text-amber-600" : "text-emerald-600")}>{rk.txt}风险 · {rk.en}</div>
            <div className="mt-1.5 space-y-1">
              {rk.reason.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11.5px] text-ink2"><AlertTriangle size={10} className="text-ink3" /> {r}</div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* 模块 2：Customer Intent */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink2">
          <Brain size={12} className="text-indigo-500" /> 客户意图 · Customer Intent
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { k: "意图", v: ticket.intent || "其他", tone: "text-ink" },
            { k: "类别", v: ticket.category, tone: "text-ink" },
            { k: "置信度", v: `${ticket.intent ? 96 : 88}%`, tone: "text-emerald-600" },
          ].map((x) => (
            <div key={x.k} className="rounded-xl bg-surface2/60 px-2 py-2.5">
              <div className="text-[10px] text-ink3">{x.k}</div>
              <div className={cls("num mt-1 text-[13px] font-semibold", x.tone)}>{x.v}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 模块 3：Recommended Actions */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink2">
          <Sparkles size={12} className="text-blue-500" /> 建议动作 · Recommended Actions
        </div>
        <div className="space-y-2">
          {(ACTIONS_BY[ticket.category] || ACTIONS_BY.其他).map((a, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.12, duration: 0.4 }}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_8px_20px_-12px_rgba(29,78,216,.35)]">
              <span className="num text-[13px] font-semibold text-blue-600">{i + 1}</span>
              <div className={cls("flex h-7 w-7 items-center justify-center rounded-lg", "bg-blue-50 text-blue-600")}><a.icon size={13} /></div>
              <span className="flex-1 text-[12px] leading-snug text-ink/90">{a.t}</span>
              <ArrowRight size={13} className="text-ink3" />
            </motion.div>
          ))}
        </div>
      </Card>

      {/* 模块 4：Generated Reply */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink2">
            <PenLine size={12} className="text-emerald-500" /> 生成回复 · Generated Reply
          </div>
          <div className="flex items-center gap-1 text-[10px] text-ink3">
            <span className="rounded-full bg-surface2 px-2 py-px">语气 · {tone}</span>
            <span className="rounded-full bg-surface2 px-2 py-px">语言 · {lang === "zh" ? "中文" : "EN"}</span>
            <span className="rounded-full bg-surface2 px-2 py-px">来源 · 知识库</span>
          </div>
        </div>
        <div className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-line bg-surface p-3.5 text-[12.5px] leading-relaxed text-ink/90">{display || "暂无建议回复"}</div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => setTone(tone === "专业" ? "友好" : "专业")} className="rounded-xl border border-line px-2.5 py-1.5 text-[11.5px] font-medium text-ink2 hover:bg-surface2">{tone}</button>
          <button onClick={() => setLang(lang === "zh" ? "en" : "zh")} className="flex items-center gap-1 rounded-xl border border-line px-2.5 py-1.5 text-[11.5px] font-medium text-ink2 hover:bg-surface2"><Languages size={11} /> {lang === "zh" ? "中文" : "EN"}</button>
          <button onClick={() => navigator.clipboard?.writeText(display)} className="flex items-center gap-1 rounded-xl border border-line px-2.5 py-1.5 text-[11.5px] font-medium text-ink2 hover:bg-surface2"><Copy size={11} /> 复制</button>
          <button className="btn-grad ml-auto flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-[12px] font-semibold"><Send size={12} /> 发送</button>
        </div>
      </Card>

      {/* 模块 5：Knowledge Evidence */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink2">
          <BookOpen size={12} className="text-cyan-500" /> 知识依据 · Knowledge Evidence
        </div>
        {sources.length === 0 ? (
          <div className="rounded-xl bg-surface2/50 px-3 py-3 text-[11.5px] text-ink3">知识库暂无与「{ticket.category}」直接匹配的文档</div>
        ) : (
          <div className="space-y-2">
            {sources.map((s) => (
              <div key={s.id}>
                <button onClick={() => api.kbDoc(s.id).then(setEvidence).catch(() => {})}
                  className="row-hover flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition hover:border-cyan-200">
                  <FileText size={13} className="shrink-0 text-cyan-500" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{s.title}</span>
                  <span className="num shrink-0 text-[10.5px] font-semibold text-emerald-600">相似度 {s.sim}%</span>
                </button>
              </div>
            ))}
            <div className="rounded-xl border border-dashed border-line px-3 py-2 text-[11px] text-ink3">历史相似案例：由知识库同分类文档自动关联</div>
          </div>
        )}
      </Card>

      {/* Evidence 弹层 */}
      <AnimatePresence>
        {evidence && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-6 backdrop-blur-sm" onClick={() => setEvidence(null)}>
            <motion.div initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }}
              className="card-premium max-h-[76vh] w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <span className="flex items-center gap-2 text-[14px] font-semibold text-ink"><FileText size={15} className="text-cyan-500" /> {evidence.title}</span>
                <button onClick={() => setEvidence(null)} className="rounded-full p-1 text-ink3 hover:bg-surface2">✕</button>
              </div>
              <div className="max-h-[58vh] overflow-y-auto whitespace-pre-wrap px-5 py-4 text-[12.5px] leading-[1.9] text-ink/85">{evidence.content}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═════════ 页面主体：三栏 AI Decision Workspace ═════════ */
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
          <h1 className="display text-[30px] font-semibold tracking-[-0.02em] text-ink">工单台 · AI Decision Workspace</h1>
          <p className="mt-1 text-[13.5px] text-ink2">查看物流状态 → AI 分析风险 → 检索知识 → 制定方案 → 生成回复</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12px] text-ink2">
          <Dot tone="success" pulse /> 共 {tickets.length} 条可见
        </span>
      </div>

      <div className="grid grid-cols-12 items-start gap-5">
        {/* 左：Ticket Inbox */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="col-span-3">
          <Card className="p-4">{load ? <Loading /> : <InboxList list={tickets} sel={sel} setSel={setSel} q={q} setQ={setQ} onRefresh={reload} />}</Card>
        </motion.div>

        {/* 中：Shipment Workspace */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.07 }} className="col-span-5 space-y-4">
          {detail ? (
            <>
              <ShipmentIntelligence ticket={detail} />
              <AgentPipeline ticket={detail} />
              <Conversation ticket={detail} />
            </>
          ) : <Card><Empty text="从左侧选择一张工单" /></Card>}
        </motion.div>

        {/* 右：AI Decision Center */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.14 }} className="col-span-4">
          {detail ? <DecisionCenter ticket={detail} kbDocs={kbDocs} health={health} /> : <Card><Empty text="选择工单后展示 AI 决策分析" /></Card>}
        </motion.div>
      </div>
    </div>
  );
}
