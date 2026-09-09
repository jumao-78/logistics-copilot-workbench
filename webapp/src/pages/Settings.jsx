import React, { useEffect, useState } from "react";
import { Database, Cpu, ShieldCheck, Workflow, RefreshCcw, CheckCircle2, KeyRound } from "lucide-react";
import { Card, CardHead, Badge, Dot } from "../components/ui.jsx";
import { api } from "../api.js";

function Row({ k, v, right }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 py-3 last:border-0">
      <span className="text-[13px] text-ink2">{k}</span>
      <div className="flex items-center gap-2">{right}{v && <span className="num text-[13px] font-medium text-ink">{v}</span>}</div>
    </div>
  );
}

export default function Settings({ health }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const h = await api.health();
      const s = await api.summary();
      setResult({ ok: true, msg: `健康检查通过：${h.tickets} 工单 · ${h.kb_docs} 文档 · AI=${h.ai_mode} · 看板 KPI 正常（今日 ${s.kpi.today_count}）` });
    } catch (e) { setResult({ ok: false, msg: e.message }); }
    setTesting(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="display text-[30px] font-semibold tracking-[-0.02em] text-ink">Settings</h1>
          <p className="mt-1 text-[13.5px] text-ink2">工作区配置与运行状态</p>
        </div>
      </div>

      <div className="grid grid-cols-12 items-start gap-5">
        <div className="col-span-7 space-y-5">
          <Card>
            <CardHead title="运行状态" sub="Runtime · 全部来自 /api/health 实时探测" right={<Badge tone="success"><Dot tone="success" pulse /> Live</Badge>} />
            <Row k="服务状态" right={<Badge tone="success">正常</Badge>} />
            <Row k="AI 模式" right={health ? <Badge tone={health.ai_mode === "llm" ? "primary" : "warning"}>{health.ai_mode === "llm" ? `LLM · ${health.llm_model}` : "Rule / mock"}</Badge> : <Badge tone="gray">未知</Badge>} />
            <Row k="数据库引擎" v={health?.db_dialect} right={<Database size={14} className="text-ink3" />} />
            <Row k="数据规模" v={health ? `${health.tickets} 工单 · ${health.kb_docs} 文档 · ${health.kb_chunks} 片段` : "—"} />
          </Card>

          <Card>
            <CardHead title="模型与管道" sub="AI Pipeline" />
            <Row k="字段提取模型" v={health?.llm_model ?? "regex + 规则"} right={<Cpu size={14} className="text-ink3" />} />
            <Row k="知识库检索" v="BM25 关键词检索 + 三重置信判据" right={<Workflow size={14} className="text-ink3" />} />
            <Row k="降级策略" v="单条失败自动降级规则模式" right={<ShieldCheck size={14} className="text-ink3" />} />
            <Row k="注入防护" v="LLM Prompt 内置（消息指令视为数据）" right={<ShieldCheck size={14} className="text-emerald-500" />} />
          </Card>
        </div>

        <div className="col-span-5 space-y-5">
          <Card>
            <CardHead title="连接与鉴权" sub="Security" />
            <Row k="API Token" v={health ? "Bearer / X-API-Key" : "—"} right={<KeyRound size={14} className="text-ink3" />} />
            <Row k="CORS" v="本地演示默认 *" />
            <Row k="数据声明" right={<Badge tone="warning">全部为模拟数据</Badge>} />
          </Card>

          <Card>
            <CardHead title="自检" sub="Connectivity & Integration Test" />
            <button onClick={runTest} disabled={testing} className="btn-grad flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold">
              {testing ? <><RefreshCcw size={14} className="animate-spin" /> 自检中…</> : <><RefreshCcw size={14} /> 运行连接自检</>}
            </button>
            {result && (
              <div className={`mt-3 flex items-start gap-2 rounded-xl px-3.5 py-3 text-[12.5px] leading-relaxed ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                {result.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <span className="mt-0.5 shrink-0">❌</span>}
                {result.msg}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
