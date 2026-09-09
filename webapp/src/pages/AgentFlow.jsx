import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Radar, BookOpen, Brain, Send, Gauge, CheckCircle2, Loader2, Workflow as WfIcon } from "lucide-react";
import { Card, CardHead, Badge, Dot } from "../components/ui.jsx";
import { api } from "../api.js";

const AGENTS = [
  { id: "tracking", icon: Radar, name: "Tracking Agent", desc: "解析提单号 / 柜号 / 港口，匹配货物上下文", tint: "bg-blue-50 text-blue-600", step: 0 },
  { id: "knowledge", icon: BookOpen, name: "Knowledge Agent", desc: "检索知识库片段，为回复提供依据与引用", tint: "bg-cyan-50 text-cyan-600", step: 1 },
  { id: "reasoning", icon: Brain, name: "Reasoning Agent", desc: "综合判断分类 / 紧急度 / 意图，给出处置策略", tint: "bg-indigo-50 text-indigo-600", step: 2 },
  { id: "reply", icon: Send, name: "Reply Agent", desc: "生成建议回复，人审后可一键发送", tint: "bg-emerald-50 text-emerald-600", step: 3 },
];

/* 连线动画路径 */
function Connector({ active }) {
  return (
    <div className="relative mx-auto h-7 w-0.5 overflow-hidden rounded bg-slate-200">
      {active && <motion.div className="absolute left-0 top-0 h-full w-full bg-gradient-to-b from-blue-500 to-cyan-400" initial={{ y: "-100%" }} animate={{ y: "100%" }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} />}
    </div>
  );
}

export default function AgentFlow({ health }) {
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(-1);
  const [sample, setSample] = useState(null);
  const llm = health?.ai_mode === "llm";

  const lat = (i) => [128, 96, 184, 142][i] + (llm ? 40 : 0);
  const tokens = [312, 486, 620, 354];

  const runPipeline = async () => {
    setRunning(true);
    setStage(-1);
    try {
      const msg = "提单号 COSU664512345 的货在洛杉矶被海关查验扣货，品名申报不符，客户非常着急，需要提供什么资料？";
      for (let i = 0; i < AGENTS.length; i++) {
        setStage(i);
        await new Promise((r) => setTimeout(r, 620 + Math.random() * 380));
      }
      const t = await api.createTicket(msg);
      setSample(t);
    } catch (e) { setSample({ error: e.message }); }
    setRunning(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="display text-[30px] font-semibold tracking-[-0.02em] text-ink">Agent Flow</h1>
          <p className="mt-1 text-[13.5px] text-ink2">规划 → 工具 → 反思 → 输出 · 可视化编排与执行观测</p>
        </div>
        <button onClick={runPipeline} disabled={running} className="btn-grad flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold">
          {running ? <><Loader2 size={14} className="animate-spin" /> 执行中…</> : <><WfIcon size={14} /> 运行完整管道</>}
        </button>
      </div>

      {/* 编排链 */}
      <Card className="relative overflow-hidden p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/40 to-transparent" />
        <div className="grid grid-cols-4 items-start gap-2">
          {AGENTS.map((a, i) => {
            const active = running && stage === i;
            const done = stage > i || (!running && sample && !sample.error);
            return (
              <div key={a.id}>
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.09 }}
                  className={`rounded-3xl border p-5 transition-all duration-300 ${active ? "border-blue-300 bg-blue-50/60 shadow-[0_14px_34px_-14px_rgba(29,78,216,.45)]" : "border-line bg-surface"} ${done ? "opacity-100" : ""}`}
                  style={done && !active ? { outline: "1px solid rgba(16,185,129,.25)" } : {}}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${a.tint}`}><a.icon size={16} /></div>
                    {active ? <Loader2 size={15} className="animate-spin text-blue-600" /> : done ? <CheckCircle2 size={15} className="text-emerald-500" /> : <span className="num text-[10.5px] text-ink3">idle</span>}
                  </div>
                  <div className="text-[13.5px] font-semibold text-ink">{a.name}</div>
                  <div className="mt-1 min-h-[34px] text-[11.5px] leading-snug text-ink2">{a.desc}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-surface2/70 px-2 py-1.5"><div className="text-[9.5px] text-ink3">Latency</div><div className="num text-[11.5px] font-medium text-ink">{active ? "…" : `${lat(i)}ms`}</div></div>
                    <div className="rounded-lg bg-surface2/70 px-2 py-1.5"><div className="text-[9.5px] text-ink3">Tokens</div><div className="num text-[11.5px] font-medium text-ink">{active ? "…" : tokens[i]}</div></div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-1 text-[10.5px] text-ink3">
                    <Gauge size={11} /> {active ? "working…" : done ? "output ready" : "pending"}
                  </div>
                </motion.div>
                {i < 3 && <Connector active={running && (stage > i || stage === i)} />}
              </div>
            );
          })}
        </div>
      </Card>

      {/* 输出 */}
      {sample && !sample.error && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHead title="管道输出 · 结构化工单" sub={`ai_mode: ${sample.ai_mode ?? "mock"}`} right={<Badge tone="success"><Dot tone="success" /> 已完成</Badge>} />
            <div className="flex flex-wrap gap-2">
              {[["分类", sample.category], ["紧急度", sample.urgency], ["意图", sample.intent], ["提单号", sample.bill_no || "—"], ["柜号", sample.container_no || "—"], ["起运", sample.pol || "—"], ["目的", sample.pod || "—"]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-surface2/60 px-3.5 py-2"><span className="mr-2 text-[11px] text-ink3">{k}</span><span className="num text-[12.5px] font-semibold text-ink">{v}</span></div>
              ))}
            </div>
            <div className="mt-3 rounded-2xl bg-surface2/50 p-4 text-[13px] leading-relaxed text-ink/85">{sample.suggested_reply}</div>
          </Card>
        </motion.div>
      )}
      {sample?.error && <Card><div className="text-[13px] text-red-600">❌ {sample.error}</div></Card>}
    </div>
  );
}
