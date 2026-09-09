import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Radar, BookOpen, Cpu, PenLine, Loader2, CheckCircle2, Play, X,
  Zap, Activity, ScrollText, Wrench, ArrowRight, User, Bot, Layers,
} from "lucide-react";
import { Card, Badge, Dot, Empty } from "../components/ui.jsx";
import { api, cls } from "../api.js";

/* ═════════ Agent 编排定义（演示链路：输入 → 5 Agent） ═════════ */
const AGENTS = [
  { id: "intent", icon: Brain, tint: "bg-indigo-50 text-indigo-600", name: "Intent Agent", purpose: "识别客户意图与问题分类", tool: "schema.extract", lat: 96 },
  { id: "tracking", icon: Radar, tint: "bg-blue-50 text-blue-600", name: "Tracking Agent", purpose: "解析提单/柜号并查询物流上下文", tool: "carrier.status", lat: 128 },
  { id: "knowledge", icon: BookOpen, tint: "bg-cyan-50 text-cyan-600", name: "Knowledge Agent", purpose: "检索知识片段为答复提供依据", tool: "kb.bm25_search", lat: 156 },
  { id: "reasoning", icon: Cpu, tint: "bg-violet-50 text-violet-600", name: "Reasoning Agent", purpose: "综合判断风险与处置策略", tool: "llm.reason", lat: 204 },
  { id: "reply", icon: PenLine, tint: "bg-emerald-50 text-emerald-600", name: "Reply Agent", purpose: "生成建议回复", tool: "llm.generate", lat: 142 },
];

const SAMPLE_MSG = "提单号 COSU664512345 的货在洛杉矶被海关查验扣货，品名申报不符，客户非常着急，需要提供什么资料？";

/* ═════════ Header ═════════ */
function PageHeader({ running, agents, tickets, onRun }) {
  const avgLat = Math.round(AGENTS.reduce((s, a) => s + a.lat, 0) / AGENTS.length);
  const runningCount = agents.filter((a) => a.status === "run").length;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
      className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-[30px] font-semibold tracking-[-0.02em] text-ink">AI Agent Runtime</h1>
        <p className="mt-1 text-[13.5px] text-ink2">多 Agent 编排运行监控中心 · 物流客服场景</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12px] text-ink2">
          <Dot tone={runningCount > 0 ? "primary" : "success"} pulse={runningCount > 0} />
          {runningCount > 0 ? `${runningCount} 个 Agent 运行中` : "Agent 集群待命"}
        </span>
        <div className="hidden items-center gap-3 md:flex">
          <div className="rounded-xl border border-line bg-surface px-3 py-1.5">
            <div className="text-[9.5px] text-ink3">平均延迟（演示口径）</div>
            <div className="num text-[13px] font-semibold text-ink">{(avgLat / 1000).toFixed(2)}s</div>
          </div>
          <div className="rounded-xl border border-line bg-surface px-3 py-1.5">
            <div className="text-[9.5px] text-ink3">已处理工单</div>
            <div className="num text-[13px] font-semibold text-ink">{tickets > 0 ? tickets : "—"}</div>
          </div>
        </div>
        <button onClick={onRun} disabled={running}
          className="btn-grad flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold">
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} 运行模拟
        </button>
      </div>
    </motion.div>
  );
}

/* ═════════ Workflow Canvas ═════════ */
function WorkflowCanvas({ agents, request, activeIdx, onNodeClick }) {
  return (
    <Card className="relative overflow-hidden p-6">
      <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(29,78,216,.08), transparent 65%)" }} />
      <div className="pointer-events-none absolute -left-16 -bottom-24 h-64 w-64 rounded-full" style={{ background: "radial-gradient(circle, rgba(6,182,212,.07), transparent 65%)" }} />

      <div className="mb-5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"><Layers size={14} className="text-blue-600" /> Agent Workflow Canvas</span>
        <span className="flex items-center gap-1.5 text-[10.5px] text-ink3">
          <span className="rounded-full bg-surface2 px-2 py-0.5">意图 → 跟踪 → 知识 → 推理 → 回复</span>
          <span className="rounded-full bg-surface2 px-2 py-0.5">延迟 / 工具为演示口径</span>
        </span>
      </div>

      {/* 请求气泡 */}
      <div className="mx-auto mb-6 flex max-w-[640px] items-start gap-2.5 rounded-2xl border border-blue-100 bg-blue-50/40 px-4 py-3">
        <User size={14} className="mt-0.5 shrink-0 text-blue-500" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-400">Customer Request</div>
          <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink/85">{request || SAMPLE_MSG}</div>
        </div>
        <span className="num shrink-0 text-[10px] text-ink3">in</span>
      </div>

      {/* 节点行 */}
      <div className="flex items-stretch justify-between gap-1">
        {AGENTS.map((a, i) => {
          const st = agents.find((x) => x.id === a.id)?.status || "wait";
          const Icon = a.icon;
          const active = i === activeIdx;
          return (
            <div key={a.id} className="flex min-w-0 flex-1 items-center">
              <button
                data-agent={a.id}
                onClick={() => onNodeClick(a.id)}
                className={cls(
                  "flex min-w-0 flex-1 flex-col items-center rounded-2xl border bg-surface px-2 py-4 text-center transition-all duration-300 hover:-translate-y-0.5",
                  active ? "border-blue-300 shadow-[0_0_0_3px_rgba(29,78,216,.12),0_14px_30px_-14px_rgba(29,78,216,.5)]"
                    : st === "done" ? "border-emerald-200 hover:border-emerald-300"
                    : "border-line hover:border-blue-200 hover:shadow-[0_10px_24px_-14px_rgba(29,78,216,.35)]"
                )}
              >
                <div className="relative">
                  <div className={cls("flex h-9 w-9 items-center justify-center rounded-xl", a.tint)}><Icon size={16} /></div>
                  {st === "run" && <span className="ai-pulse absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-white" />}
                  {st === "done" && <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white"><CheckCircle2 size={10} className="text-white" /></span>}
                </div>
                <div className="mt-2 truncate text-[11.5px] font-semibold text-ink">{a.name}</div>
                <div className="mt-1 flex min-h-[14px] items-center gap-1 text-[9.5px] text-ink3">
                  {st === "run" ? <><Loader2 size={9} className="animate-spin text-blue-600" /> 处理中</>
                    : st === "done" ? <><span className="text-emerald-600">完成</span> · <span className="num">{a.lat}ms</span></>
                    : "等待"}
                </div>
                <div className="mt-1.5 flex max-w-full items-center gap-1 rounded-full bg-surface2 px-2 py-0.5 text-[9px] text-ink3">
                  <Wrench size={8} className="shrink-0" /> <span className="truncate">{a.tool}</span>
                </div>
              </button>
              {i < AGENTS.length - 1 && (
                <div className="relative mx-1 h-px w-5 shrink-0">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/70 to-cyan-400/70" />
                  <ArrowRight size={8} className="absolute -right-0.5 -top-[3.5px] text-cyan-500" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-center gap-1.5 text-[10.5px] text-ink3">
        <Bot size={11} className="text-emerald-500" />
        输出将进入工单台「AI Decision Center」进行人工确认 · 点击任一 Agent 查看详情
      </div>
    </Card>
  );
}

/* ═════════ Runtime 三栏 ═════════ */
function AgentStatusCol({ agents }) {
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="mb-3 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink2"><Activity size={13} className="text-ink3" /> Agent 状态</div>
      <div className="flex-1 space-y-1">
        {AGENTS.map((a) => {
          const st = agents.find((x) => x.id === a.id)?.status || "wait";
          const Icon = a.icon;
          return (
            <div key={a.id} className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-surface2/60">
              <div className={cls("flex h-7 w-7 items-center justify-center rounded-lg", a.tint)}><Icon size={13} /></div>
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">{a.name}</span>
              {st === "run" ? <span className="flex items-center gap-1 text-[10.5px] font-medium text-blue-600"><Loader2 size={10} className="animate-spin" /> 运行中</span>
                : st === "done" ? <span className="flex items-center gap-1 text-[10.5px] text-emerald-600"><CheckCircle2 size={10} /> 完成</span>
                : <span className="text-[10.5px] text-ink3">等待</span>}
              <span className="num w-10 text-right text-[10px] text-ink3">{st === "done" ? `${a.lat}ms` : "—"}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ToolCallsCol({ calls }) {
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink2"><Wrench size={13} className="text-ink3" /> 工具调用</span>
        <span className="rounded-full bg-surface2 px-2 py-0.5 text-[9.5px] text-ink3">演示链路</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {calls.length === 0 ? (
          <Empty text="运行模拟后展示各 Agent 的工具调用" />
        ) : calls.map((c, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface px-3 py-2">
            <div className="flex items-center justify-between text-[10px] text-ink3">
              <span className="num">{c.time}</span>
              <span className="font-medium text-ink">{c.agent}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink/85">
              <span className="rounded bg-surface2 px-1.5 py-px font-medium text-ink2">调用</span>
              <span className="num">{c.tool}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-emerald-600">
              <CheckCircle2 size={9} /> {c.result}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LogsCol({ logs }) {
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink2"><ScrollText size={13} className="text-ink3" /> 执行日志</span>
        <span className="flex items-center gap-1 text-[9.5px] text-ink3"><Dot tone="success" pulse /> 实时</span>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto pr-1">
        {logs.length === 0 ? (
          <Empty text="运行模拟后展示执行日志流" />
        ) : logs.map((l, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg px-2 py-1 hover:bg-surface2/50">
            <span className="num shrink-0 text-[10px] text-ink3">{l.time}</span>
            <span className={cls("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", l.done ? "bg-emerald-400" : "bg-blue-400 ai-pulse")} />
            <span className="min-w-0 flex-1 break-words text-[11.5px] leading-snug text-ink/80">{l.msg}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ═════════ Detail Drawer ═════════ */
function Drawer({ agent, ticket, onClose }) {
  const A = AGENTS.find((a) => a.id === agent) || AGENTS[0];
  const Icon = A.icon;
  const row = (k, v) => (
    <div className="border-b border-line/60 py-2.5 last:border-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink3">{k}</div>
      <div className="mt-0.5 break-words text-[12px] leading-relaxed text-ink/90">{v}</div>
    </div>
  );
  return (
    <AnimatePresence>
      <motion.div key={agent} initial={{ x: 380 }} animate={{ x: 0 }} exit={{ x: 380 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed bottom-0 right-0 top-0 z-40 w-[380px] overflow-y-auto border-l border-line bg-white/95 shadow-[-24px_0_60px_-30px_rgba(15,23,42,.25)] backdrop-blur-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white/90 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <div className={cls("flex h-9 w-9 items-center justify-center rounded-xl", A.tint)}><Icon size={16} /></div>
            <div>
              <div className="text-[14px] font-semibold text-ink">{A.name}</div>
              <div className="text-[10.5px] text-ink3">Agent Detail</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink3 hover:bg-surface2"><X size={15} /></button>
        </div>
        <div className="px-5 py-3">
          {row("Purpose · 职责", A.purpose)}
          {row("Model · 模型", ticket ? "glm-4-flash（OpenAI 兼容）" : "未运行：将使用 glm-4-flash / 规则降级")}
          {row("Tools · 工具", A.tool)}
          {row("Input · 输入", ticket ? ticket.raw_text : "等待运行模拟…")}
          {row("Output · 输出", ticket ? (ticket.suggested_reply || "建议回复已生成，可在工单台查看") : "—")}
          {row("Latency · 延迟（演示）", `${A.lat}ms`)}
          {row("Token 用量（演示）", `${Math.round(A.lat * 2.4)}`)}
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-ink3"><Zap size={10} /> 数值为本地演示口径；真实调用由 LLM 网关计量</div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ═════════ 页面 ═════════ */
export default function AgentFlow({ health }) {
  const [agents, setAgents] = useState(AGENTS.map((a) => ({ ...a, status: "wait" })));
  const [calls, setCalls] = useState([]);
  const [logs, setLogs] = useState([]);
  const [request, setRequest] = useState("");
  const [tickets, setTickets] = useState(0);
  const [running, setRunning] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [drawer, setDrawer] = useState(null);
  const [output, setOutput] = useState(null);
  const timers = useRef([]);

  useEffect(() => {
    api.health().then((h) => setTickets(h.tickets)).catch(() => {});
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const now = () => new Date().toTimeString().slice(0, 8);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setOutput(null);
    setCalls([]);
    setLogs([]);
    setAgents(AGENTS.map((a) => ({ ...a, status: "wait" })));
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const msg = SAMPLE_MSG;
    setRequest(msg);

    const step = [
      { i: 0, log: "意图识别完成：查询 · 运输异常" },
      { i: 1, log: "调用 carrier.status 查询提单上下文" },
      { i: 2, log: "知识检索命中 2 个片段" },
      { i: 3, log: "推理完成：判定高风险 · 关务异常" },
      { i: 4, log: "建议回复已生成，等待人工确认" },
    ];
    let stage = 0;
    const tick = () => {
      if (stage >= step.length) return;
      const s = step[stage];
      setActiveIdx(s.i);
      setAgents((prev) => prev.map((a, idx) => {
        if (idx === s.i) return { ...a, status: "run" };
        if (idx < s.i) return { ...a, status: "done" };
        return { ...a, status: "wait" };
      }));
      if (s.i > 0) {
        const prev = AGENTS[s.i - 1];
        setCalls((c) => [...c, { time: now(), agent: prev.name, tool: prev.tool, result: "输出已就绪，传递给下一节点" }]);
      }
      setLogs((l) => [...l, { time: now(), msg: s.log, done: false }]);
      stage += 1;
      if (stage < step.length) timers.current.push(setTimeout(tick, 600));
    };
    timers.current.push(setTimeout(tick, 300));

    try {
      const t = await api.createTicket(msg);
      setOutput(t);
      setActiveIdx(-1);
      setAgents(AGENTS.map((a) => ({ ...a, status: "done" })));
      setCalls((c) => [...c, { time: now(), agent: "Reply Agent", tool: "llm.generate", result: "建议回复已生成" }]);
      setLogs((l) => [...l, { time: now(), msg: "工单 #" + t.id + " 已入库，进入 AI Decision Center", done: true }]);
      api.health().then((h) => setTickets(h.tickets)).catch(() => {});
    } catch (e) {
      setLogs((l) => [...l, { time: now(), msg: "执行异常：" + e.message, done: true }]);
    }
    setRunning(false);
  };

  return (
    <div className="space-y-5">
      <PageHeader running={running} agents={agents} tickets={tickets} onRun={run} />

      <WorkflowCanvas agents={agents} request={request} activeIdx={activeIdx} onNodeClick={setDrawer} />

      {/* 三栏 Runtime */}
      <div className="grid grid-cols-12 items-stretch gap-5">
        <div className="col-span-4 flex flex-col"><AgentStatusCol agents={agents} /></div>
        <div className="col-span-4 flex flex-col"><ToolCallsCol calls={calls} /></div>
        <div className="col-span-4 flex flex-col"><LogsCol logs={logs} /></div>
      </div>

      {/* 输出预览 */}
      <AnimatePresence>
        {output && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"><Bot size={14} className="text-emerald-500" /> 执行输出 · 结构化工单 #{output.id}</span>
                <Badge tone="success">已完成 · 进入工单台确认</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {[["分类", output.category], ["紧急度", output.urgency], ["意图", output.intent], ["提单号", output.bill_no || "—"], ["柜号", output.container_no || "—"], ["航线", [output.pol, output.pod].filter(Boolean).join(" → ") || "—"]].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-surface2/60 px-3 py-1.5"><span className="mr-2 text-[10.5px] text-ink3">{k}</span><span className="num text-[12px] font-semibold text-ink">{v}</span></div>
                ))}
              </div>
              <div className="mt-3 rounded-xl bg-surface2/50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink/85">{output.suggested_reply}</div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Drawer */}
      {drawer && <Drawer agent={drawer} ticket={output} onClose={() => setDrawer(null)} />}
    </div>
  );
}
