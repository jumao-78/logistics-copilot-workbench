import React, { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { motion } from "framer-motion";
import {
  AlertTriangle, Activity, Clock, Flame, ShieldAlert, ArrowUpRight, Sparkles,
  Radar, BookOpen, Brain, PenLine, Radio, Timer, ArrowRight, Lightbulb, Send,
} from "lucide-react";
import HeroHeader from "../components/HeroHeader.jsx";
import { Card, CardHead, CategoryBadge, UrgencyBadge, StatusBadge, Reveal, Empty, Loading, Dot, Badge } from "../components/ui.jsx";
import { api, fmt } from "../api.js";

const TOOLTIP = {
  contentStyle: { borderRadius: 14, border: "1px solid rgba(226,232,240,.9)", background: "rgba(255,255,255,.88)", backdropFilter: "blur(10px)", fontSize: 12, boxShadow: "0 8px 24px rgba(16,24,40,.08)" },
  labelStyle: { color: "#64748b", fontWeight: 600 },
};

function KpiCard({ icon: Icon, label, value, chip, note, tone, delay, accent }) {
  return (
    <Reveal delay={delay}>
      <Card className="group relative h-full overflow-hidden p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[12.5px] font-medium text-ink2">{label}</div>
            <div className="num mt-2.5 text-[30px] font-medium leading-none text-ink">{value}</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110" style={{ background: accent }}>
            <Icon size={18} className={tone} />
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

/* Feed 规则派生：仅基于今日真实工单（无 LLM 成本） */
function buildFeed(today) {
  if (!today.length) return [];
  const cnt = (f) => today.filter(f).length;
  const out = [];
  const customs = today.filter((t) => t.category === "关务").length;
  const chase = today.filter((t) => t.intent === "催件").length;
  const complain = today.filter((t) => t.intent === "投诉" || t.intent === "索赔").length;
  const urgent = today.filter((t) => t.urgency === "高").length;
  const waiting = today.filter((t) => t.status === "待处理").length;
  const now = new Date().toTimeString().slice(0, 5);
  if (customs >= 3)
    out.push({ icon: BookOpen, tint: "bg-cyan-50 text-cyan-600", agent: "Knowledge Agent", issue: `今日出现 ${customs} 条清关/查验类问题，多为资料与流程咨询`, act: "建议核对清关 FAQ 覆盖度，不足则新增文档", time: now });
  if (chase >= 3)
    out.push({ icon: Radar, tint: "bg-blue-50 text-blue-600", agent: "Tracking Agent", issue: `今日 ${chase} 条催件工单，集中在到港时效`, act: "建议更新到港通知流程，主动推送 ETA", time: now });
  if (complain > 0)
    out.push({ icon: Brain, tint: "bg-indigo-50 text-indigo-600", agent: "Reasoning Agent", issue: `今日出现 ${complain} 条投诉/索赔类信号`, act: "建议优先人工跟进并复盘根因", time: now });
  if (urgent >= 5)
    out.push({ icon: PenLine, tint: "bg-emerald-50 text-emerald-600", agent: "Reply Agent", issue: `今日高紧急工单 ${urgent} 条，需保持 30 分钟内首响`, act: "建议开启高优通道提醒值班主管", time: now });
  if (waiting > 0)
    out.push({ icon: ShieldAlert, tint: "bg-amber-50 text-amber-600", agent: "Reasoning Agent", issue: `今日仍有 ${waiting} 条工单待人工处理`, act: "建议按高紧急优先分配处理人", time: now });
  return out.slice(0, 4);
}

export default function Dashboard({ health }) {
  const [sum, setSum] = useState(null);
  const [todayTickets, setTodayTickets] = useState([]);
  const [openQueue, setOpenQueue] = useState([]);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.summary().then(setSum).catch(() => setErr(true));
    // 今日工单（最新 100 条内聚合；mock 今日约 60+ 条，够覆盖）
    api.tickets({ page_size: 100 }).then((d) => setTodayTickets(d.items)).catch(() => {});
    // 待人工处理队列（全库，取最近）
    api.tickets({ page_size: 30, status: "待处理" }).then((d) => setOpenQueue(d.items)).catch(() => {});
  }, []);

  const k = sum?.kpi;
  const weekTrend = sum?.trend || [];
  const todayDelta = useMemo(() => {
    if (!sum || weekTrend.length < 2) return null;
    const y = weekTrend[weekTrend.length - 2]?.count;
    if (!y) return null;
    const d = Math.round(((k.today_count - y) / y) * 100);
    return { d, up: d >= 0 };
  }, [sum, weekTrend, k]);

  /* ═══ 今日 09:00–21:00 按小时三线（真实聚合今日工单） ═══ */
  const today = useMemo(() => {
    const day = new Date().toISOString().slice(0, 10);
    const todayLocal = new Date();
    const ymd = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, "0")}-${String(todayLocal.getDate()).padStart(2, "0")}`;
    return todayTickets.filter((t) => (t.created_at || "").slice(0, 10) === ymd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayTickets]);

  const hourTrend = useMemo(() => {
    const buckets = [];
    const curHour = new Date().getHours();
    for (let h = 9; h <= 21; h++) {
      if (h > curHour) break; // 只显示已发生的小时
      const items = today.filter((t) => Number((t.created_at || "").slice(11, 13)) === h);
      buckets.push({
        hour: `${String(h).padStart(2, "0")}:00`,
        total: items.length,
        ai: items.filter((t) => t.status === "AI已处理").length,
        human: items.filter((t) => t.status !== "AI已处理").length,
      });
    }
    return buckets;
  }, [today]);

  const todayIntents = useMemo(() => {
    const m = {};
    today.forEach((t) => { const n = t.intent || "其他"; m[n] = (m[n] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => a.value - b.value);
  }, [today]);

  const feed = useMemo(() => buildFeed(today), [today]);

  /* Live High Priority Queue：待处理 + 高紧急优先 + 等待时长排序 */
  const liveQueue = useMemo(() => {
    const now = new Date();
    const w = (t) => {
      try { return Math.round((now - new Date(t.created_at.replace(" ", "T"))) / 60000); } catch (_) { return 0; }
    };
    return [...openQueue]
      .map((t) => ({ ...t, waitMin: w(t) }))
      .sort((a, b) => {
        const pa = a.urgency === "高" ? 0 : a.urgency === "中" ? 1 : 2;
        const pb = b.urgency === "高" ? 0 : b.urgency === "中" ? 1 : 2;
        return pa - pb || b.waitMin - a.waitMin;
      })
      .slice(0, 6);
  }, [openQueue]);

  const waitTxt = (m) => (m < 60 ? `${m}m` : m < 1440 ? `${(m / 60).toFixed(1)}h` : `${(m / 1440).toFixed(1)}d`);

  if (err) return <Empty text="看板数据加载失败，请确认后端服务在 8010 端口运行" />;

  return (
    <div className="space-y-6">
      <HeroHeader health={health} />

      {/* ═══ 今日 KPI ═══ */}
      <div className="grid grid-cols-4 gap-5">
        <KpiCard icon={Activity} label="今日工单量" tone="text-blue-700" accent="rgba(29,78,216,.10)" delay={0.05}
          value={k ? k.today_count : "—"}
          chip={todayDelta ? <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${todayDelta.up ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}><ArrowUpRight size={11} className={todayDelta.up ? "" : "rotate-180"} />{todayDelta.d}%</span> : null}
          note={todayDelta ? "较昨日" : `累计 ${k ? k.total : "—"} 条`} />
        <KpiCard icon={Sparkles} label="AI 自动处理率" tone="text-indigo-600" accent="rgba(79,70,229,.10)" delay={0.12}
          value={k ? `${k.ai_rate}%` : "—"}
          chip={k ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700">{k.ai_count} 条已自动处理</span> : null}
          note={k ? `共 ${k.total} 条` : ""} />
        <KpiCard icon={Clock} label="平均首次响应" tone="text-cyan-600" accent="rgba(6,182,212,.12)" delay={0.19}
          value={k ? (k.avg_response_minutes == null ? "—" : k.avg_response_minutes < 60 ? `${Math.round(k.avg_response_minutes)}m` : `${(k.avg_response_minutes / 60).toFixed(1)}h`) : "—"}
          chip={k && k.avg_response_minutes != null ? <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${k.avg_response_minutes > 240 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>{k.avg_response_minutes > 240 ? "超 4h 目标" : "SLA 达标"}</span> : null}
          note="工单接收到首次回复" />
        <KpiCard icon={Flame} label="高紧急工单" tone="text-red-500" accent="rgba(239,68,68,.10)" delay={0.26}
          value={k ? k.urgent_count : "—"}
          chip={k ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-semibold text-red-500">占 {k.urgent_rate}%</span> : null}
          note="需优先跟进" />
      </div>

      {/* ═══ 今日运营趋势（按小时）+ Live 高优队列 ═══ */}
      <div className="grid grid-cols-12 items-stretch gap-5">
        <Reveal delay={0.08} className="col-span-7">
          <Card className="h-full">
            <CardHead title="今日运营趋势" sub="今日 09:00 起每小时工单动态 · 真实聚合"
              right={
                <div className="flex items-center gap-2.5 text-[10.5px]">
                  <span className="flex items-center gap-1 text-ink2"><span className="h-2 w-2 rounded-full bg-blue-600" /> 新增</span>
                  <span className="flex items-center gap-1 text-ink2"><span className="h-2 w-2 rounded-full bg-indigo-400" /> AI 处理</span>
                  <span className="flex items-center gap-1 text-ink2"><span className="h-2 w-2 rounded-full bg-cyan-400" /> 人工</span>
                  <span className="flex items-center gap-1 text-ink3"><Radio size={11} className="ai-pulse text-blue-500" /> 实时</span>
                </div>
              } />
            {hourTrend.length ? (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourTrend} margin={{ top: 8, right: 6, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hNew" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.22} /><stop offset="100%" stopColor="#1d4ed8" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="rgba(148,163,184,.16)" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10.5, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={1} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip {...TOOLTIP} />
                    <Area type="monotone" dataKey="total" name="新增工单" stroke="#1d4ed8" strokeWidth={2.2} fill="url(#hNew)" animationDuration={900} />
                    <Area type="monotone" dataKey="ai" name="AI 处理" stroke="#4f46e5" strokeWidth={1.8} strokeDasharray="5 3" fill="transparent" animationDuration={1000} />
                    <Area type="monotone" dataKey="human" name="人工" stroke="#06b6d4" strokeWidth={1.8} strokeDasharray="2 4" fill="transparent" animationDuration={1100} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <Empty text="今日暂无工单数据（可到工单台新建一条消息验证）" />}
          </Card>
        </Reveal>

        <Reveal delay={0.14} className="col-span-5">
          <Card className="h-full">
            <CardHead title="实时高优队列" sub="等待人工处理的工单" right={<Badge tone="danger"><Dot tone="danger" pulse /> {liveQueue.length} 条</Badge>} />
            {liveQueue.length === 0 ? <Empty text="✅ 暂无待人工处理的工单" /> : (
              <div className="space-y-1">
                {liveQueue.map((t) => (
                  <div key={t.id} className="row-hover flex items-center gap-2.5 rounded-xl px-2.5 py-2">
                    <span className="num w-10 shrink-0 text-[11px] font-semibold text-ink">#{t.id}</span>
                    <span className="flex w-14 shrink-0 items-center gap-1 text-[10.5px] text-amber-600"><Timer size={10} /> {waitTxt(t.waitMin)}</span>
                    <UrgencyBadge urgency={t.urgency} />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink/75">{t.raw_text}</span>
                    <StatusBadge status={t.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Reveal>
      </div>

      {/* ═══ 今日 Top 意图 + AI Operations Feed ═══ */}
      <div className="grid grid-cols-12 items-stretch gap-5">
        <Reveal delay={0.08} className="col-span-4">
          <Card className="h-full">
            <CardHead title="今日热门意图" sub={`基于今日 ${today.length} 条工单`} />
            {todayIntents.length ? (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={todayIntents} layout="vertical" margin={{ top: 0, right: 12, left: -6, bottom: 0 }}>
                    <defs>
                      {["tiA", "tiB", "tiC"].map((id, i) => (
                        <linearGradient key={id} id={id} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={["#1d4ed8", "#4f46e5", "#06b6d4"][i]} stopOpacity={0.5} />
                          <stop offset="100%" stopColor={["#1d4ed8", "#4f46e5", "#06b6d4"][i]} stopOpacity={1} />
                        </linearGradient>
                      ))}
                    </defs>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={42} tick={{ fontSize: 11.5, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip {...TOOLTIP} cursor={{ fill: "rgba(29,78,216,.05)" }} />
                    <Bar dataKey="value" name="工单" radius={[0, 8, 8, 0]} barSize={16} animationDuration={900}>
                      {todayIntents.map((_, i) => <Cell key={i} fill={`url(#${["tiA", "tiB", "tiC"][i % 3]})`} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <Empty text="今日暂无数据" />}
          </Card>
        </Reveal>

        <Reveal delay={0.14} className="col-span-8">
          <Card className="h-full">
            <CardHead title="AI 运营动态" sub="AI 基于今日工单主动发现的问题与建议（规则引擎）" right={<Badge tone="success"><Dot tone="success" pulse /> 实时</Badge>} />
            {feed.length === 0 ? (
              <Empty text="今日暂无足够工单信号，AI 将持续观察" />
            ) : (
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {feed.map((f, i) => {
                  const Icon = f.icon;
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                      className="row-hover rounded-2xl border border-line bg-surface p-3.5 transition hover:border-blue-200 hover:shadow-[0_8px_20px_-12px_rgba(29,78,216,.3)]">
                      <div className="mb-2 flex items-center gap-2">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${f.tint}`}><Icon size={13} /></div>
                        <span className="text-[11.5px] font-semibold text-ink">{f.agent}</span>
                        <span className="ml-auto text-[9.5px] text-ink3">今日 {f.time}</span>
                      </div>
                      <div className="mb-2 flex items-start gap-1.5 text-[12px] leading-snug text-ink/85">
                        <Lightbulb size={11} className="mt-0.5 shrink-0 text-amber-500" /> {f.issue}
                      </div>
                      <div className="flex items-start gap-1.5 border-t border-line/60 pt-2 text-[11px] leading-snug text-ink2">
                        <Send size={10} className="mt-0.5 shrink-0 text-blue-500" />
                        <span>建议：{f.act}</span>
                        <ArrowRight size={11} className="ml-auto mt-0.5 shrink-0 text-ink3" />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </Card>
        </Reveal>
      </div>
    </div>
  );
}
