import React, { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import { motion } from "framer-motion";
import { AlertTriangle, Activity, Clock, Flame, ShieldAlert, ArrowUpRight, Sparkles, Radio } from "lucide-react";
import HeroHeader from "../components/HeroHeader.jsx";
import { Card, CardHead, CategoryBadge, UrgencyBadge, StatusBadge, Reveal, Empty, Loading, Dot } from "../components/ui.jsx";
import { api, fmt } from "../api.js";

const GRAD = ["#1d4ed8", "#4f46e5", "#06b6d4"];
const TOOLTIP = {
  contentStyle: { borderRadius: 14, border: "1px solid rgba(226,232,240,.9)", background: "rgba(255,255,255,.88)", backdropFilter: "blur(10px)", fontSize: 12, boxShadow: "0 8px 24px rgba(16,24,40,.08)" },
  labelStyle: { color: "#64748b", fontWeight: 600 },
};

function KpiCard({ icon: Icon, label, value, sub, tone, delay, accent }) {
  return (
    <Reveal delay={delay}>
      <Card className="relative h-full overflow-hidden p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[12.5px] font-medium text-ink2">{label}</div>
            <div className="num mt-2.5 text-[30px] font-medium leading-none text-ink">{value}</div>
            {sub && <div className="mt-2 text-[11.5px] text-ink3">{sub}</div>}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: accent }}>
            <Icon size={18} className={tone} />
          </div>
        </div>
        {/* 顶部极细光 */}
        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
      </Card>
    </Reveal>
  );
}

export default function Dashboard({ health }) {
  const [sum, setSum] = useState(null);
  const [ins, setIns] = useState(null);
  const [queue, setQueue] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.summary().then(setSum).catch(() => setErr(true));
    api.tickets({ page_size: 6, status: "待处理" }).then((d) => setQueue(d.items)).catch(() => {});
    api.insight().then(setIns).catch(() => {});
  }, []);

  const trend = sum?.trend || [];
  const cat = useMemo(() => {
    const m = { 运输: "#1d4ed8", 仓储: "#4f46e5", 关务: "#06b6d4", 账单: "#64748b", 其他: "#94a3b8" };
    return (sum?.category_dist || []).map((d) => ({ ...d, fill: m[d.name] || "#94a3b8" }));
  }, [sum]);
  const intents = useMemo(
    () => (sum?.top_intents || []).map((d) => ({ ...d })).sort((a, b) => a.value - b.value),
    [sum]
  );

  if (err) return <Empty text="看板数据加载失败，请确认后端服务在 8010 端口运行" />;

  return (
    <div className="space-y-6">
      <HeroHeader health={health} />

      {/* KPI */}
      <div className="grid grid-cols-4 gap-5">
        <KpiCard icon={Activity} label="今日工单量" value={sum ? sum.kpi.today_count : "—"} sub={sum ? `累计 ${sum.kpi.total} 条` : ""} tone="text-blue-700" accent="rgba(29,78,216,.10)" delay={0.05} />
        <KpiCard icon={Sparkles} label="AI 自动处理率" value={sum ? `${sum.kpi.ai_rate}%` : "—"} sub={sum ? `AI已处理 ${sum.kpi.ai_count} / ${sum.kpi.total}` : ""} tone="text-indigo-600" accent="rgba(79,70,229,.10)" delay={0.12} />
        <KpiCard icon={Clock} label="平均首次响应" value={sum ? (sum.kpi.avg_response_minutes == null ? "—" : sum.kpi.avg_response_minutes < 60 ? `${Math.round(sum.kpi.avg_response_minutes)}m` : `${(sum.kpi.avg_response_minutes / 60).toFixed(1)}h`) : "—"} sub="工单接收到首次回复" tone="text-cyan-600" accent="rgba(6,182,212,.12)" delay={0.19} />
        <KpiCard icon={Flame} label="高紧急占比" value={sum ? `${sum.kpi.urgent_rate}%` : "—"} sub={sum ? `高紧急 ${sum.kpi.urgent_count} 条` : ""} tone="text-red-500" accent="rgba(239,68,68,.10)" delay={0.26} />
      </div>

      {/* 趋势 + 分类（不对称：Stripe 式） */}
      <div className="grid grid-cols-12 gap-5">
        <Reveal delay={0.1} className="col-span-8">
          <Card className="h-full">
            <CardHead title="近 7 日工单趋势" sub="Daily ticket volume · SQL aggregated" right={<span className="flex items-center gap-1.5 text-[11.5px] text-ink3"><Radio size={12} className="ai-pulse text-blue-500" /> Live</span>} />
            {trend.length ? (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.26} />
                        <stop offset="60%" stopColor="#4f46e5" stopOpacity={0.08} />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="rgba(148,163,184,.18)" />
                    <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip {...TOOLTIP} />
                    <Area type="monotone" dataKey="count" stroke="url(#gLine)" strokeWidth={2.4} fill="url(#gT)" />
                    <defs>
                      <linearGradient id="gLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#1d4ed8" />
                        <stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                    </defs>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <Loading />}
          </Card>
        </Reveal>

        <Reveal delay={0.18} className="col-span-4">
          <Card className="h-full">
            <CardHead title="分类分布" sub="Category mix" />
            {cat.length ? (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip {...TOOLTIP} formatter={(v) => [`${v} 条`, ""]} />
                    <Pie data={cat} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={3} strokeWidth={0}>
                      {cat.map((c) => <Cell key={c.name} fill={c.fill} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : <Loading />}
          </Card>
        </Reveal>
      </div>

      {/* 意图 + 超时风险（不对称） */}
      <div className="grid grid-cols-12 gap-5">
        <Reveal delay={0.1} className="col-span-5">
          <Card className="h-full">
            <CardHead title="Top 意图" sub="Intents by volume" />
            {intents.length ? (
              <div className="h-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={intents} layout="vertical" margin={{ top: 0, right: 10, left: -6, bottom: 0 }}>
                    <defs>
                      {["igA", "igB", "igC"].map((id, i) => (
                        <linearGradient key={id} id={id} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={GRAD[i]} stopOpacity={0.55} />
                          <stop offset="100%" stopColor={GRAD[i]} stopOpacity={1} />
                        </linearGradient>
                      ))}
                    </defs>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={46} tick={{ fontSize: 11.5, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip {...TOOLTIP} cursor={{ fill: "rgba(29,78,216,.05)" }} />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={16}>
                      {intents.map((_, i) => <Cell key={i} fill={`url(#${["igA", "igB", "igC"][i % 3]})`} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <Loading />}
          </Card>
        </Reveal>

        <Reveal delay={0.18} className="col-span-7">
          <Card className="h-full">
            <CardHead title="超时工单 · SLA Risk" sub={`响应超 ${sum?.overdue_hours_threshold ?? 4} 小时未闭环`} right={<BadgeDanger n={sum?.overdue?.length ?? 0} />} />
            {queue == null ? <Loading /> : queue.length === 0 ? <Empty text="✅ 暂无超时工单" /> : (
              <div className="space-y-1">
                {queue.map((t) => (
                  <div key={t.id} className="row-hover flex items-center gap-3 rounded-xl px-2.5 py-2">
                    <span className="num w-9 text-[11px] text-ink3">#{t.id}</span>
                    <CategoryBadge category={t.category} />
                    <UrgencyBadge urgency={t.urgency} />
                    <span className="flex-1 truncate text-[13px] text-ink/85">{t.raw_text}</span>
                    <span className="text-[11.5px] text-ink3">{fmt.date(t.created_at)}</span>
                    <StatusBadge status={t.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Reveal>
      </div>

      {/* AI 改善建议 */}
      {ins && (
        <Reveal delay={0.1}>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full" style={{ background: "radial-gradient(circle, rgba(29,78,216,.10), transparent 65%)" }} />
            <CardHead title="AI 运营洞察" sub={`${ins.mode === "llm" ? "LLM 生成 · glm-4-flash" : "规则模板生成"} · ${ins.generated_at?.slice(5, 16)}`} right={<span className="rounded-full bg-blue-50 px-3 py-1 text-[11.5px] font-medium text-blue-700">Insight</span>} />
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {String(ins.insight).split("\n").filter(Boolean).slice(0, 6).map((line, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-2xl bg-surface2/60 px-4 py-3 text-[13px] leading-relaxed text-ink/85">
                  <span className="grad-text num mt-0.5 text-[12px] font-semibold">{String(i + 1).padStart(2, "0")}</span>
                  <span>{line.replace(/^\d+\.\s*/, "")}</span>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      )}
    </div>
  );
}

function BadgeDanger({ n }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-[11.5px] font-semibold text-red-600">
      <AlertTriangle size={12} /> {n} 条待响应
    </span>
  );
}
