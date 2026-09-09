import React, { useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { motion } from "framer-motion";
import {
  Inbox, Sparkles, Clock, ShieldAlert, Radar, BookOpen, Brain, Send,
  AlertTriangle, ArrowUpRight, Activity, Globe2,
} from "lucide-react";
import HeroHeader from "../components/HeroHeader.jsx";
import { Card, CardHead, CategoryBadge, UrgencyBadge, StatusBadge, Badge, Reveal, Empty, Loading, Dot } from "../components/ui.jsx";
import { api, fmt } from "../api.js";

const TOOLTIP = {
  contentStyle: { borderRadius: 14, border: "1px solid rgba(226,232,240,.9)", background: "rgba(255,255,255,.88)", backdropFilter: "blur(10px)", fontSize: 12, boxShadow: "0 8px 24px rgba(16,24,40,.08)" },
  labelStyle: { color: "#64748b", fontWeight: 600 },
};

/* 数字滚动动画（克制 1s） */
function CountUp({ value, suffix = "", duration = 1.1 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / (duration * 1000));
      setV(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{v.toLocaleString()}{suffix}</>;
}

/* 分类 → 处理智能体 / 动作描述（UI 层映射，仅展示用） */
const AGENT_OF_CAT = {
  运输: { name: "Tracking Agent", icon: Radar, tint: "bg-blue-50 text-blue-600" },
  关务: { name: "Knowledge Agent", icon: BookOpen, tint: "bg-cyan-50 text-cyan-600" },
  账单: { name: "Reasoning Agent", icon: Brain, tint: "bg-indigo-50 text-indigo-600" },
  仓储: { name: "Reply Agent", icon: Send, tint: "bg-emerald-50 text-emerald-600" },
  其他: { name: "Reply Agent", icon: Send, tint: "bg-slate-100 text-slate-500" },
};
const ACTION_OF_CAT = {
  运输: "完成货物动态跟踪分析",
  关务: "检索并核验关务知识片段",
  账单: "完成账单争议结构化处理",
  仓储: "完成仓储状态核对与归档",
  其他: "完成消息路由与分类归档",
};

/* ═══ KPI 卡 ═══ */
function KpiCard({ icon: Icon, tint, accent, label, value, chip, note, delay }) {
  return (
    <Reveal delay={delay}>
      <Card className="group relative h-full overflow-hidden p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[12.5px] font-medium text-ink2">{label}</div>
            <div className="num mt-2.5 text-[30px] font-medium leading-none text-ink">{value}</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110" style={{ background: accent }}>
            <Icon size={18} className={tint} />
          </div>
        </div>
        <div className="mt-3 flex min-h-[22px] items-center gap-2">
          {chip}
          <span className="text-[11px] text-ink3">{note}</span>
        </div>
        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/25 to-transparent" />
      </Card>
    </Reveal>
  );
}

/* ═══ 风险数据（按真实工单维度派生）═══ */
function useRisks(sum) {
  return useMemo(() => {
    if (!sum) return null;
    const total = sum.kpi?.total || 1;
    const iv = (n) => (sum.top_intents || []).find((i) => i.name === n)?.value || 0;
    const cv = (n) => (sum.category_dist || []).find((c) => c.name === n)?.value || 0;
    const items = [
      { key: "delay", name: "Delay Shipment", desc: "运输延误 · 催件在途", count: iv("催件"), color: "#f59e0b" },
      { key: "customs", name: "Customs Risk", desc: "报关 · 查验 · 扣货", count: cv("关务"), color: "#ef4444" },
      { key: "carrier", name: "Carrier Delay", desc: "船期 · 舱位 · 到港", count: cv("运输"), color: "#1d4ed8" },
      { key: "esc", name: "Customer Escalation", desc: "投诉 · 索赔升级", count: iv("投诉"), color: "#10b981" },
    ].map((r) => ({ ...r, pct: total ? +((r.count / total) * 100).toFixed(1) : 0 }));
    const top = [...items].sort((a, b) => b.pct - a.pct)[0];
    return { items, total, topName: { delay: "运输延误", customs: "关务风险", carrier: "运输环节", esc: "客诉升级" }[top.key] };
  }, [sum]);
}

/* ═══ 航线区域分布（POL → 区域，真实聚合）═══ */
const REGION_OF_POL = { 上海: "华东", 宁波: "华东", 青岛: "华东", 大连: "华东", 天津: "华北", 深圳: "华南", 厦门: "华南", 广州: "华南" };
function useCountry(tickets) {
  return useMemo(() => {
    const m = {};
    tickets.forEach((t) => {
      const reg = REGION_OF_POL[t.pol] || "未标注";
      m[reg] = (m[reg] || 0) + 1;
    });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [tickets]);
}

export default function Dashboard({ health }) {
  const [sum, setSum] = useState(null);
  const [ins, setIns] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.summary().then(setSum).catch(() => setErr(true));
    api.tickets({ page_size: 50 }).then((d) => setTickets(d.items)).catch(() => {});
    api.insight().then(setIns).catch(() => {});
  }, []);

  const k = sum?.kpi;
  const trend = sum?.trend || [];
  const risks = useRisks(sum);
  const country = useCountry(tickets);

  /* 今日工单环比昨日（真实趋势计算） */
  const todayDelta = useMemo(() => {
    if (!sum || trend.length < 2) return null;
    const y = trend[trend.length - 2]?.count;
    if (!y) return null;
    const d = Math.round(((k.today_count - y) / y) * 100);
    return { d, up: d >= 0 };
  }, [sum, trend, k]);

  /* 实时队列：待处理优先 */
  const queue = useMemo(() => {
    return [...tickets]
      .sort((a, b) => {
        const sa = a.status === "待处理" ? 0 : 1;
        const sb = b.status === "待处理" ? 0 : 1;
        return sa - sb || String(b.created_at).localeCompare(String(a.created_at));
      })
      .slice(0, 8);
  }, [tickets]);

  /* 响应延迟分桶（真实 waiting_hours） */
  const delayBuckets = useMemo(() => {
    const b = [
      { name: "< 4h", lo: 0, hi: 4, color: "#10b981" },
      { name: "4–12h", lo: 4, hi: 12, color: "#f59e0b" },
      { name: "12–48h", lo: 12, hi: 48, color: "#f97316" },
      { name: "> 48h", lo: 48, hi: Infinity, color: "#ef4444" },
    ];
    return b.map((x) => ({ name: x.name, color: x.color, value: (sum?.overdue || []).filter((o) => (o.waiting_hours ?? 0) >= x.lo && (o.waiting_hours ?? 0) < x.hi).length }));
  }, [sum]);

  if (err) return <Empty text="看板数据加载失败，请确认后端服务在 8010 端口运行" />;

  return (
    <div className="space-y-6">
      <HeroHeader health={health} />

      {/* ═══ 一、KPI 区 ═══ */}
      <div className="grid grid-cols-4 gap-5">
        <KpiCard icon={Inbox} label="今日工单" accent="rgba(29,78,216,.10)" tint="text-blue-700"
          value={k ? <CountUp value={k.today_count} /> : "—"}
          chip={todayDelta ? <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${todayDelta.up ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}><ArrowUpRight size={11} className={todayDelta.up ? "" : "rotate-180"} />{todayDelta.d}%</span> : null}
          note={todayDelta ? "较昨日" : "截至当前"} delay={0.02} />
        <KpiCard icon={Sparkles} label="AI 自动解决率" accent="rgba(79,70,229,.10)" tint="text-indigo-600"
          value={k ? <CountUp value={k.ai_rate} suffix="%" /> : "—"}
          chip={k ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700">{k.ai_count} 条已自动处理</span> : null}
          note={k ? `共 ${k.total} 条工单` : ""} delay={0.08} />
        <KpiCard icon={Clock} label="平均响应时长" accent="rgba(6,182,212,.12)" tint="text-cyan-600"
          value={k ? (k.avg_response_minutes == null ? "—" : k.avg_response_minutes < 60 ? <CountUp value={Math.round(k.avg_response_minutes)} suffix="m" /> : <CountUp value={+(k.avg_response_minutes / 60).toFixed(1)} suffix="h" />) : "—"}
          chip={k && k.avg_response_minutes != null ? <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${k.avg_response_minutes > 240 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>{k.avg_response_minutes > 240 ? "超 4h 目标" : "SLA 达标"}</span> : null}
          note="工单接收到首次回复" delay={0.14} />
        <KpiCard icon={ShieldAlert} label="高风险物流单" accent="rgba(239,68,68,.10)" tint="text-red-500"
          value={k ? <CountUp value={k.urgent_count} /> : "—"}
          chip={k ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-semibold text-red-500">占 {k.urgent_rate}%</span> : null}
          note="高紧急 · 优先跟进" delay={0.2} />
      </div>

      {/* ═══ 二、Shipment Risk Overview ═══ */}
      <Reveal delay={0.04}>
        <Card className="relative overflow-hidden p-6">
          <CardHead title="物流风险概览" sub="Shipment Risk Overview · 按真实工单维度聚合"
            right={risks ? <Badge tone="danger"><AlertTriangle size={11} /> 首要关注：{risks.topName}</Badge> : null} />
          <div className="grid grid-cols-12 items-center gap-4">
            <div className="relative col-span-4 h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip {...TOOLTIP} formatter={(v, n) => [`${v} 条`, n]} />
                  <Pie data={risks?.items || []} dataKey="count" nameKey="name" innerRadius={62} outerRadius={86} paddingAngle={2.5} strokeWidth={0} animationDuration={1100}>
                    {(risks?.items || []).map((r) => <Cell key={r.key} fill={r.color} fillOpacity={0.9} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="num text-[24px] font-semibold leading-none text-ink">{risks?.total ?? "—"}</span>
                <span className="mt-1 text-[10.5px] text-ink3">工单总数</span>
              </div>
            </div>
            <div className="col-span-8 space-y-3.5">
              {(risks?.items || []).map((r) => {
                const lv = r.pct >= 25 ? "danger" : r.pct >= 12 ? "warning" : "success";
                const lvTxt = { danger: "高", warning: "中", success: "低" }[lv];
                return (
                  <div key={r.key} className="flex items-center gap-3">
                    <span className="h-[9px] w-[9px] shrink-0 rounded-[3px]" style={{ background: r.color }} />
                    <div className="w-[168px]">
                      <div className="text-[12.5px] font-semibold text-ink">{r.name}</div>
                      <div className="text-[10.5px] text-ink3">{r.desc}</div>
                    </div>
                    <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-slate-200/70">
                      <motion.div className="h-full rounded-full" style={{ background: r.color, opacity: 0.85 }}
                        initial={{ width: 0 }} whileInView={{ width: `${r.pct}%` }} viewport={{ once: true }}
                        transition={{ duration: 0.9, ease: "easeOut" }} />
                    </div>
                    <span className="num w-11 text-right text-[12.5px] font-semibold text-ink">{r.pct}%</span>
                    <Badge tone={lv}>{lvTxt}风险</Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </Reveal>

      {/* ═══ 三 + 四、AI Activity Feed ｜ Live Ticket Queue ═══ */}
      <div className="grid grid-cols-12 items-start gap-5">
        <Reveal className="col-span-5">
          <Card className="h-full">
            <CardHead title="AI 活动流" sub="AI Activity Feed · 智能体工作记录" right={<Badge tone="success"><Dot tone="success" pulse /> 实时</Badge>} />
            <div className="relative -mr-1 max-h-[440px] space-y-1 overflow-y-auto pr-1">
              {tickets.slice(0, 12).map((t, i) => {
                const agent = AGENT_OF_CAT[t.category] || AGENT_OF_CAT.其他;
                const Icon = agent.icon;
                return (
                  <motion.div key={t.id} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
                    transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.35 }}
                    className="flex items-start gap-3 rounded-xl px-2.5 py-2 transition hover:bg-surface2/60">
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${agent.tint}`}><Icon size={14} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold text-ink">{agent.name}</span>
                        <span className="num text-[10px] text-ink3">#{t.id}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-ink3">{fmt.date(t.created_at)}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-ink2">{(ACTION_OF_CAT[t.category] || ACTION_OF_CAT.其他)}{t.bill_no ? ` · 提单 ${t.bill_no}` : ""}</div>
                    </div>
                    <span className="mt-0.5 flex shrink-0 items-center gap-1 text-[10px] font-medium text-emerald-600"><Dot tone="success" /> 完成</span>
                  </motion.div>
                );
              })}
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.07} className="col-span-7">
          <Card className="h-full">
            <CardHead title="实时工单队列" sub="Live Ticket Queue · 卡片视图" right={<Badge tone="gray">{queue.length} 条</Badge>} />
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {queue.map((t, i) => {
                const agent = AGENT_OF_CAT[t.category] || AGENT_OF_CAT.其他;
                const Icon = agent.icon;
                return (
                  <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                    transition={{ delay: Math.min(i * 0.05, 0.35), duration: 0.35 }}
                    className="row-hover rounded-2xl border border-line bg-surface p-3.5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_10px_26px_-12px_rgba(29,78,216,.28)]">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
                        <Globe2 size={12} className="text-ink3" />
                        {t.bill_no ? `提单 ${t.bill_no}` : `客户 #${t.id}`}
                      </span>
                      <UrgencyBadge urgency={t.urgency} />
                    </div>
                    <div className="mb-2.5 line-clamp-2 min-h-[34px] text-[12.5px] leading-snug text-ink/85">{t.raw_text}</div>
                    <div className="flex items-center gap-2">
                      <CategoryBadge category={t.category} />
                      <StatusBadge status={t.status} />
                      <span className="ml-auto flex items-center gap-1.5 text-[10.5px] text-ink3">
                        <Icon size={11} /> {agent.name.replace(" Agent", "")}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </Card>
        </Reveal>
      </div>

      {/* ═══ 五、趋势 + 延迟分布 ═══ */}
      <div className="grid grid-cols-12 gap-5">
        <Reveal className="col-span-7">
          <Card className="h-full">
            <CardHead title="近 7 日工单趋势" sub="每日工单量 · SQL 实时聚合" right={<span className="flex items-center gap-1.5 text-[11.5px] text-ink3"><Activity size={12} className="ai-pulse text-blue-500" /> 实时</span>} />
            {trend.length ? (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.26} />
                        <stop offset="60%" stopColor="#4f46e5" stopOpacity={0.08} />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#1d4ed8" /><stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="rgba(148,163,184,.18)" />
                    <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip {...TOOLTIP} />
                    <Area type="monotone" dataKey="count" name="工单量" stroke="url(#gLine)" strokeWidth={2.4} fill="url(#gT)" animationDuration={1000} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <Loading />}
          </Card>
        </Reveal>

        <Reveal delay={0.08} className="col-span-5">
          <Card className="h-full">
            <CardHead title="响应延迟分布" sub="Delay Distribution · 按超时等待分桶" />
            {(sum?.overdue || []).length ? (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={delayBuckets} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
                    <defs>
                      {delayBuckets.map((b, i) => (
                        <linearGradient key={i} id={`db${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={b.color} stopOpacity={0.95} />
                          <stop offset="100%" stopColor={b.color} stopOpacity={0.45} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="rgba(148,163,184,.16)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip {...TOOLTIP} cursor={{ fill: "rgba(29,78,216,.04)" }} />
                    <Bar dataKey="value" name="工单" radius={[8, 8, 0, 0]} barSize={38} animationDuration={900}>
                      {delayBuckets.map((_, i) => <Cell key={i} fill={`url(#db${i})`} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <Empty text="当前无超时工单" />}
          </Card>
        </Reveal>
      </div>

      {/* ═══ 五-2、航线区域分布 + AI 洞察 ═══ */}
      <div className="grid grid-cols-12 gap-5">
        <Reveal className="col-span-7">
          <Card className="h-full">
            <CardHead title="航线区域分布" sub="Country Distribution · 按起运港归类（真实聚合）" />
            {country.length ? (
              <div className="h-[210px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={country} layout="vertical" margin={{ top: 0, right: 24, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="regG" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.55} /><stop offset="100%" stopColor="#06b6d4" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={56} tick={{ fontSize: 11.5, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip {...TOOLTIP} cursor={{ fill: "rgba(29,78,216,.05)" }} />
                    <Bar dataKey="value" name="工单" radius={[0, 8, 8, 0]} barSize={18} fill="url(#regG)" animationDuration={900} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <Loading />}
          </Card>
        </Reveal>

        <Reveal delay={0.08} className="col-span-5">
          {ins && (
            <Card className="relative h-full overflow-hidden">
              <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full" style={{ background: "radial-gradient(circle, rgba(29,78,216,.10), transparent 65%)" }} />
              <CardHead title="AI 运营洞察" sub={`${ins.mode === "llm" ? "LLM 生成 · glm-4-flash" : "规则模板"} · ${ins.generated_at?.slice(5, 16)}`}
                right={<span className="rounded-full bg-blue-50 px-3 py-1 text-[11.5px] font-medium text-blue-700"><Sparkles size={11} className="mr-0.5 inline" />洞察</span>} />
              <div className="space-y-2.5">
                {String(ins.insight).split("\n").filter(Boolean).slice(0, 5).map((line, i) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-2xl bg-surface2/60 px-4 py-3 text-[12.5px] leading-relaxed text-ink/85">
                    <span className="grad-text num mt-0.5 shrink-0 text-[11.5px] font-semibold">{String(i + 1).padStart(2, "0")}</span>
                    <span>{line.replace(/^\d+\.\s*/, "")}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </Reveal>
      </div>
    </div>
  );
}
