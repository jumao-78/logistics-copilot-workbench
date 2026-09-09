import React, { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, PolarGrid, PolarAngleAxis, RadarChart, Radar, Legend, BarChart, Bar, Cell } from "recharts";
import { motion } from "framer-motion";
import { Card, CardHead, Reveal, Empty, Loading, Badge } from "../components/ui.jsx";
import { api } from "../api.js";

const TOOLTIP = {
  contentStyle: { borderRadius: 14, border: "1px solid rgba(226,232,240,.9)", background: "rgba(255,255,255,.88)", backdropFilter: "blur(10px)", fontSize: 12, boxShadow: "0 8px 24px rgba(16,24,40,.08)" },
  labelStyle: { color: "#64748b", fontWeight: 600 },
};

export default function Analytics() {
  const [sum, setSum] = useState(null);
  const [logs, setLogs] = useState([]);
  useEffect(() => { api.summary().then(setSum).catch(() => {}); api.qaLogs().then(setLogs).catch(() => {}); }, []);

  const sla = useMemo(() => {
    if (!sum) return [];
    const yes = sum.overdue.length === 0 ? 0 : 100 - Math.min(40, sum.overdue.length * 6);
    return [{ name: "SLA", value: Math.max(60, 100 - (sum.kpi.today_count > 0 ? sum.overdue.length * 5 : 0)), fill: "url(#slaG)" }];
  }, [sum]);

  const delayDist = useMemo(() => {
    if (!sum) return [];
    const l = sum.overdue.length;
    return [
      { name: "≤ 1h", value: Math.max(4, Math.round(sum.kpi.today_count * 0.22)), fill: "#10b981" },
      { name: "1-4h", value: Math.max(3, Math.round(sum.kpi.today_count * 0.16)), fill: "#f59e0b" },
      { name: "> 4h", value: l, fill: "#ef4444" },
    ];
  }, [sum]);

  const geo = useMemo(() => {
    const m = {};
    (sum?.trend || []).forEach((t, i) => {
      const zone = ["North America", "Europe", "Asia", "SEA"][i % 4];
      m[zone] = (m[zone] || 0) + t.count;
    });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [sum]);

  const agents = [
    { name: "分类", acc: 0.97, full: 100 },
    { name: "字段提取", acc: 1.0, full: 100 },
    { name: "意图", acc: 0.85, full: 100 },
    { name: "紧急度", acc: 0.9, full: 100 },
    { name: "拒答准确", acc: 0.94, full: 100 },
  ].map((a) => ({ ...a, value: a.acc * 100 }));

  if (!sum) return <div className="py-20"><Loading text="加载执行分析…" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="display text-[30px] font-semibold tracking-[-0.02em] text-ink">Analytics</h1>
          <p className="mt-1 text-[13.5px] text-ink2">执行层驾驶舱 · SLA · 质量 · 分布 · 归因</p>
        </div>
        <div className="rounded-full border border-line bg-surface px-4 py-1.5 text-[12px] text-ink2">数据窗口：近 7 日 · 模拟数据</div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* SLA Health 径向 */}
        <Reveal className="col-span-4">
          <Card className="h-full">
            <CardHead title="SLA Health" sub="超时响应压力指数" />
            <div className="relative h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart innerRadius="72%" outerRadius="100%" data={sla} startAngle={220} endAngle={-40}>
                  <defs>
                    <linearGradient id="slaG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1d4ed8" /><stop offset="100%" stopColor="#06b6d4" /></linearGradient>
                  </defs>
                  <RadialBar dataKey="value" cornerRadius={12} background={{ fill: "rgba(148,163,184,.12)" }} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="num absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[30px] font-semibold text-ink">{sla[0]?.value}%</span>
                <span className="mt-1 text-[11px] text-ink3">无超时 = 100</span>
              </div>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-2 text-center">
              {[{ k: "今日", v: sum.kpi.today_count }, { k: "超时", v: sum.overdue.length }, { k: "AI 率", v: `${sum.kpi.ai_rate}%` }].map((x) => (
                <div key={x.k} className="rounded-xl bg-surface2/60 py-2"><div className="num text-[15px] font-semibold text-ink">{x.v}</div><div className="text-[10.5px] text-ink3">{x.k}</div></div>
              ))}
            </div>
          </Card>
        </Reveal>

        {/* 延迟分布 */}
        <Reveal delay={0.08} className="col-span-4">
          <Card className="h-full">
            <CardHead title="Delay Distribution" sub="首响耗时分布（近 7 日估算）" />
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={delayDist} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="rgba(148,163,184,.16)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis hide allowDecimals={false} />
                  <Tooltip {...TOOLTIP} cursor={{ fill: "rgba(29,78,216,.04)" }} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={44}>{delayDist.map((d) => <Cell key={d.name} fill={d.fill} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Reveal>

        {/* 地区分布雷达 */}
        <Reveal delay={0.16} className="col-span-4">
          <Card className="h-full">
            <CardHead title="Country Distribution" sub="航线区域工单量" />
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={geo} outerRadius="72%">
                  <PolarGrid stroke="rgba(148,163,184,.22)" />
                  <PolarAngleAxis dataKey="name" tick={{ fontSize: 10.5, fill: "#64748b" }} />
                  <Radar dataKey="value" stroke="#4f46e5" strokeWidth={2} fill="#4f46e5" fillOpacity={0.22} />
                  <Tooltip {...TOOLTIP} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Reveal>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* AI 质量雷达 */}
        <Reveal className="col-span-5">
          <Card className="h-full">
            <CardHead title="AI Resolution Quality" sub="20 条标注集 · mock 基线 vs LLM" />
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={agents.map((a) => ({ ...a, mock: 100, llm: a.name === "意图" ? 80 : a.name === "紧急度" ? 65 : 95 }))} outerRadius="68%">
                  <PolarGrid stroke="rgba(148,163,184,.2)" />
                  <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Radar name="Rule" dataKey="mock" stroke="#94a3b8" strokeWidth={1.6} fill="#94a3b8" fillOpacity={0.14} />
                  <Radar name="LLM" dataKey="llm" stroke="#4f46e5" strokeWidth={2} fill="#4f46e5" fillOpacity={0.2} />
                  <Legend wrapperStyle={{ fontSize: 11.5 }} />
                  <Tooltip {...TOOLTIP} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Reveal>

        {/* QA 会话流 */}
        <Reveal delay={0.08} className="col-span-7">
          <Card className="h-full">
            <CardHead title="Live QA Sessions" sub="知识库问答留痕（qa_logs）" right={<Badge tone="gray">{logs.length} 条</Badge>} />
            {logs.length === 0 ? (
              <Empty text="还没有问答记录——去 Knowledge 页问一个问题试试" />
            ) : (
              <div className="max-h-[250px] space-y-1 overflow-y-auto pr-1">
                {logs.map((l) => (
                  <div key={l.id} className="row-hover rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2"><span className="num text-[10.5px] text-ink3">{l.created_at?.slice(5, 16)}</span><span className="flex-1 truncate text-[13px] font-medium text-ink">{l.question}</span></div>
                    <div className="mt-0.5 line-clamp-2 pl-4 text-[12px] leading-relaxed text-ink2">{l.answer}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Reveal>
      </div>
    </div>
  );
}
