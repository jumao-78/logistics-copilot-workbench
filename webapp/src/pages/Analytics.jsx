import React, { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import {
  Sparkles, Clock, ArrowUpRight, ArrowDownRight, Radar, BookOpen, Brain, PenLine, Bot,
  ShieldAlert, Lightbulb, Wrench, Cpu, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { Card, CardHead, Badge, Dot, Empty, Loading } from "../components/ui.jsx";
import { api, cls } from "../api.js";

const TOOLTIP = {
  contentStyle: { borderRadius: 14, border: "1px solid rgba(226,232,240,.9)", background: "rgba(255,255,255,.88)", backdropFilter: "blur(10px)", fontSize: 12, boxShadow: "0 8px 24px rgba(16,24,40,.08)" },
  labelStyle: { color: "#64748b", fontWeight: 600 },
};

/* Agent 绩效卡（指标为演示口径；真实评测见 docs/evaluation_report.md） */
const AGENTS_PERF = [
  { icon: Brain, tint: "bg-indigo-50 text-indigo-600", name: "Intent Agent", rows: [["意图识别准确率", "95%+"], ["演示任务", "1,200"], ["平均延迟", "96ms"]] },
  { icon: Radar, tint: "bg-blue-50 text-blue-600", name: "Tracking Agent", rows: [["提单解析成功率", "99%+"], ["演示 API 调用", "850"], ["平均延迟", "128ms"]] },
  { icon: BookOpen, tint: "bg-cyan-50 text-cyan-600", name: "Knowledge Agent", rows: [["知识片段命中", "96%+"], ["演示检索量", "2,300"], ["平均延迟", "156ms"]] },
  { icon: Cpu, tint: "bg-violet-50 text-violet-600", name: "Reasoning Agent", rows: [["风险判定成功", "97%+"], ["演示任务", "980"], ["平均延迟", "204ms"]] },
  { icon: PenLine, tint: "bg-emerald-50 text-emerald-600", name: "Reply Agent", rows: [["建议采纳率", "94%+"], ["演示生成", "1,100"], ["平均延迟", "142ms"]] },
];

/* ═══════ KPI：AI Impact（真实值 + 迷你趋势） ═══════ */
function ImpactCard({ icon: Icon, accent, tint, label, value, note, trend, spark, delay, goodUp }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay }} className="h-full">
      <Card className="relative flex h-full flex-col overflow-hidden p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[12px] font-medium text-ink2">{label}</div>
            <div className="num mt-2 text-[28px] font-semibold leading-none text-ink">{value}</div>
            <div className="mt-2 flex items-center gap-1.5">
              {trend && (
                <span className={cls("flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold", goodUp ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500")}>
                  {trend.up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />} {trend.txt}
                </span>
              )}
              <span className="text-[10.5px] text-ink3">{note}</span>
            </div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: accent }}><Icon size={16} className={tint} /></div>
        </div>
        {spark && spark.length > 0 && (
          <div className="mt-auto h-10 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="sparkG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.25} /><stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke="#1d4ed8" strokeWidth={1.6} fill="url(#sparkG)" isAnimationActive animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

/* ═══════ Funnel（真实计数） ═══════ */
function Funnel({ data }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2.5 pt-1">
      {data.map((d, i) => (
        <div key={d.name}>
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-ink2">{d.name}</span>
            <span className="num font-semibold text-ink">{d.value} <span className="text-[9.5px] font-normal text-ink3">({d.rate}%)</span></span>
          </div>
          <div className="h-8 overflow-hidden rounded-lg bg-surface2/70">
            <motion.div
              className="flex h-full items-center justify-center rounded-lg text-[10px] font-semibold text-white"
              style={{ minWidth: "52px", background: "linear-gradient(90deg,#1d4ed8,#4f46e5 55%,#06b6d4)" }}
              initial={{ width: 0 }} animate={{ width: `${(d.value / max) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.1, ease: "easeOut" }}>
              {d.rate}%
            </motion.div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Analytics({ health }) {
  const [sum, setSum] = useState(null);
  const [ins, setIns] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.summary().then(setSum).catch(() => {});
    api.qaLogs().then(setLogs).catch(() => {});
    api.insight().then(setIns).catch(() => {});
  }, []);

  const k = sum?.kpi;
  const trend = sum?.trend || [];

  /* 人工转接比例 = 人工处理 + 待处理 占总数（真实状态计数） */
  const handoff = useMemo(() => {
    const m = {};
    (sum?.status_dist || []).forEach((s) => { m[s.name] = s.value; });
    const manual = (m["人工处理"] || 0) + (m["待处理"] || 0);
    const total = sum?.kpi?.total || 1;
    return { count: manual, rate: +((manual / total) * 100).toFixed(1) };
  }, [sum]);

  /* Funnel：处理链路真实计数 */
  const funnel = useMemo(() => {
    if (!sum) return [];
    const total = sum.kpi.total;
    const ai = sum.kpi.ai_count;
    const closed = (sum.status_dist || []).find((s) => s.name === "已关闭")?.value || 0;
    const manual = total - ai;
    const rate = (n) => +((n / total) * 100).toFixed(1);
    return [
      { name: "收到工单", value: total, rate: rate(total) },
      { name: "AI 结构化完成", value: total, rate: rate(total) },
      { name: "AI 自动处理", value: ai, rate: rate(ai) },
      { name: "转人工跟进", value: manual, rate: rate(manual) },
      { name: "已结案", value: closed, rate: rate(closed) },
    ];
  }, [sum]);

  /* 高风险事件（真实超时工单） */
  const risks = useMemo(() => {
    const typeOf = { 关务: "清关查验 / 扣货风险", 运输: "船期延误 / 时效风险", 账单: "费用争议风险", 仓储: "仓储作业风险" };
    const adviceOf = { 关务: "核实查验进度并索要缺失单证，同步客户时间线", 运输: "查询船司最新 ETA，安抚客户并提供延误证明", 账单: "调取报价单逐项核对，登记退款流程", 仓储: "向仓库核实作业状态，确认出库计划" };
    return (sum?.overdue || []).slice(0, 5).map((o) => ({
      ...o,
      riskType: typeOf[o.category] || "综合风险",
      advice: adviceOf[o.category] || "检索知识库口径后回复客户",
    }));
  }, [sum]);

  const recs = useMemo(() => {
    if (!ins) return [];
    return String(ins.insight).split("\n").filter(Boolean).slice(0, 4).map((line, i) => {
      const text = line.replace(/^\d+\.\s*/, "");
      return { id: i + 1, text, tag: text.includes("知识") ? "RAG" : text.includes("规则") ? "规则" : "流程" };
    });
  }, [ins]);

  if (!sum) return <div className="py-20"><Loading text="加载智能分析…" /></div>;

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[30px] font-semibold tracking-[-0.02em] text-ink">AI Operations Intelligence</h1>
          <p className="mt-1 text-[13.5px] text-ink2">监控 AI 表现与客服运营效率 · 数据为模拟口径</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12px] text-ink2">
            <Dot tone="success" pulse /> AI 系统健康 · 良好
          </span>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="rounded-xl border border-line bg-surface px-3 py-1.5 text-[10.5px] text-ink3">
              <span className="block font-medium text-ink2">5 Agents Running</span>RAG 已同步 · {health?.kb_docs ?? "—"} 篇
            </span>
          </div>
        </div>
      </div>

      {/* ═══ 2. AI Impact Overview（真实 KPI） ═══ */}
      <div className="grid grid-cols-4 gap-5">
        <ImpactCard icon={Sparkles} label="AI 自动处理率" accent="rgba(79,70,229,.10)" tint="text-indigo-600"
          value={k ? `${k.ai_rate}%` : "—"} note={k ? `AI 已处理 ${k.ai_count} / ${k.total}` : ""}
          trend={{ up: true, txt: "当前值" }} goodUp spark={trend.map((t) => t.count)} delay={0.02} />
        <ImpactCard icon={Clock} label="平均响应时长" accent="rgba(6,182,212,.12)" tint="text-cyan-600"
          value={k ? (k.avg_response_minutes == null ? "—" : k.avg_response_minutes < 60 ? `${Math.round(k.avg_response_minutes)}m` : `${(k.avg_response_minutes / 60).toFixed(1)}h`) : "—"}
          note="工单接收到首次回复"
          trend={k && k.avg_response_minutes != null ? (k.avg_response_minutes > 240 ? { up: false, txt: "超 4h 目标" } : { up: true, txt: "SLA 达标" }) : null}
          goodUp={k?.avg_response_minutes <= 240} spark={trend.map((t) => t.count)} delay={0.08} />
        <ImpactCard icon={Bot} label="人工转接比例" accent="rgba(245,158,11,.12)" tint="text-amber-600"
          value={`${handoff.rate}%`} note={`${handoff.count} 条需人工跟进`}
          trend={{ up: false, txt: "AI 覆盖之外" }} goodUp={false} spark={trend.map((t) => t.count)} delay={0.14} />
        <ImpactCard icon={CheckCircle2} label="AI 质量（20 条评测）" accent="rgba(16,185,129,.12)" tint="text-emerald-600"
          value="95%+" note="分类准确率 · 规则 100% / LLM 95%" trend={{ up: true, txt: "两轮调优后" }} goodUp spark={trend.map((t) => t.count)} delay={0.2} />
      </div>

      {/* ═══ 3. AI Efficiency：左趋势 / 右漏斗 ═══ */}
      <div className="grid grid-cols-12 items-stretch gap-5">
        <div className="col-span-7 flex flex-col">
          <Card className="flex flex-1 flex-col">
            <CardHead title="工单处理趋势（近 7 日）" sub="每日工单量 · SQL 实时聚合" right={<Badge tone="primary">AI 自动处理率 {k?.ai_rate ?? "—"}%</Badge>} />
            {trend.length ? (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="trG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.25} /><stop offset="60%" stopColor="#4f46e5" stopOpacity={0.08} /><stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="trL" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#1d4ed8" /><stop offset="100%" stopColor="#06b6d4" /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="rgba(148,163,184,.15)" />
                    <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip {...TOOLTIP} />
                    <Area type="monotone" dataKey="count" name="工单量" stroke="url(#trL)" strokeWidth={2.4} fill="url(#trG)" animationDuration={1000} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <Loading />}
          </Card>
        </div>
        <div className="col-span-5 flex flex-col">
          <Card className="flex flex-1 flex-col">
            <CardHead title="处理链路漏斗" sub="真实状态计数 · 模拟数据" right={<Badge tone="gray">总 {sum?.kpi?.total ?? "—"}</Badge>} />
            <div className="flex-1"><Funnel data={funnel} /></div>
          </Card>
        </div>
      </div>

      {/* ═══ 4. Agent Performance ═══ */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="display text-[17px] font-semibold text-ink">AI Agent 绩效</h2>
            <p className="mt-0.5 text-[11.5px] text-ink3">指标为演示口径 · 真实评测：分类准确率 95%+（见评测报告）</p>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-ink3"><Dot tone="success" pulse /> 编排监控同步</span>
        </div>
        <div className="grid grid-cols-5 gap-4">
          {AGENTS_PERF.map((a, i) => {
            const Icon = a.icon;
            return (
              <motion.div key={a.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 * i }} className="h-full">
                <Card className="flex h-full flex-col p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <div className={cls("flex h-8 w-8 items-center justify-center rounded-xl", a.tint)}><Icon size={15} /></div>
                    <span className="text-[12.5px] font-semibold text-ink">{a.name}</span>
                  </div>
                  <div className="space-y-2">
                    {a.rows.map(([rk, v]) => (
                      <div key={rk} className="rounded-lg bg-surface2/60 px-2.5 py-1.5">
                        <div className="text-[9.5px] text-ink3">{rk}</div>
                        <div className="num text-[13px] font-semibold text-ink">{v}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ═══ 5. Logistics Risk Intelligence ═══ */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="display text-[17px] font-semibold text-ink">物流风险智能</h2>
            <p className="mt-0.5 text-[11.5px] text-ink3">高风险事件（真实超时工单）· AI 处置建议由规则引擎生成</p>
          </div>
          <Badge tone="danger"><AlertTriangle size={11} /> {sum?.overdue?.length ?? 0} 条待响应</Badge>
        </div>
        <div className="grid grid-cols-12 gap-4">
          {risks.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} className="col-span-4">
              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="num truncate text-[12px] font-semibold text-ink">{r.bill_no || `#${r.id}`}</span>
                  <span className={cls("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    r.urgency === "高" ? "bg-red-50 text-red-600" : r.urgency === "中" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>
                    {r.urgency}风险
                  </span>
                </div>
                <div className="mb-2 text-[11.5px] font-medium text-ink2">{r.riskType}</div>
                <div className="mb-2 line-clamp-2 text-[11px] leading-snug text-ink/70">{r.raw_text}</div>
                <div className="flex items-start gap-1 border-t border-line/60 pt-2 text-[10.5px] text-ink3">
                  <Wrench size={10} className="mt-0.5 shrink-0 text-blue-400" />
                  <span className="line-clamp-2 leading-snug">AI 建议：{r.advice}</span>
                </div>
              </Card>
            </motion.div>
          ))}
          {risks.length === 0 && <div className="col-span-12"><Empty text="当前无超时风险工单" /></div>}
        </div>
      </div>

      {/* ═══ 6. AI Improvement Center ═══ */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="display text-[17px] font-semibold text-ink">AI 改进中心</h2>
            <p className="mt-0.5 text-[11.5px] text-ink3">AI 主动发现的问题与建议 · {ins ? (ins.mode === "llm" ? "LLM 生成" : "规则模板") : "生成中…"}</p>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-ink3"><Lightbulb size={12} className="text-amber-500" /> {ins?.generated_at?.slice(5, 16) ?? "—"}</span>
        </div>
        {recs.length === 0 ? (
          <Card><div className="py-8 text-center text-[12.5px] text-ink3">分析中…（也可到总览页手动生成洞察）</div></Card>
        ) : (
          <div className="grid grid-cols-12 gap-4">
            {recs.map((r, i) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="col-span-6">
                <Card className="relative flex h-full items-start gap-3 overflow-hidden p-4">
                  <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full" style={{ background: "radial-gradient(circle, rgba(29,78,216,.08), transparent 65%)" }} />
                  <span className="grad num flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold text-white">#{String(r.id).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-[12.5px] font-semibold text-ink">建议 {String(r.id).padStart(2, "0")}</span>
                      <span className="rounded-full bg-surface2 px-2 py-px text-[9.5px] text-ink3">{r.tag}</span>
                    </div>
                    <p className="text-[12.5px] leading-relaxed text-ink/85">{r.text}</p>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
