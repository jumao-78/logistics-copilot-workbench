import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Cpu, BookOpen, ShieldCheck, Lock, FileText, Wrench, Database,
  RefreshCcw, CheckCircle2, KeyRound, ChevronDown, Globe2, Sparkles, Bot, Server, Landmark,
} from "lucide-react";
import { Card, Badge, Dot } from "../components/ui.jsx";
import { api, cls } from "../api.js";

/* 状态徽章：真实状态呈现 */
function StateBadge({ on, label, onLabel }) {
  return on
    ? <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10.5px] font-semibold text-emerald-600"><Dot tone="success" /> {onLabel || "已启用"}</span>
    : <span className="rounded-full bg-surface2 px-2.5 py-0.5 text-[10.5px] text-ink3">{label || "—"}</span>;
}

function SectionHead({ icon: Icon, tint, title, right }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={cls("flex h-7 w-7 items-center justify-center rounded-lg", tint)}><Icon size={14} /></div>
        <span className="text-[14px] font-semibold text-ink">{title}</span>
      </div>
      {right}
    </div>
  );
}

function InfoRow({ k, v, badge }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/50 py-2.5 last:border-0">
      <span className="text-[12.5px] text-ink2">{k}</span>
      <div className="flex items-center gap-2 text-right">
        {badge}
        <span className="num text-[12.5px] font-medium text-ink">{v}</span>
      </div>
    </div>
  );
}

export default function Settings({ health }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [advOpen, setAdvOpen] = useState(false);
  const llm = health?.ai_mode === "llm";

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const h = await api.health();
      setResult({ ok: true, msg: `连接正常：${h.tickets} 工单 · ${h.kb_docs} 文档 · AI=${h.ai_mode} · DB=${h.db_dialect}` });
    } catch (e) { setResult({ ok: false, msg: e.message }); }
    setTesting(false);
  };

  return (
    <div className="space-y-5">
      {/* ═══ 标题 ═══ */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[30px] font-semibold tracking-[-0.02em] text-ink">Workspace Settings</h1>
          <p className="mt-1 text-[13.5px] text-ink2">管理工作区 AI 智能体、模型与连接 · 企业级配置</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12px] text-ink2">
          <Dot tone="success" pulse /> 系统在线
        </span>
      </div>

      {/* ═══ Row A：System Overview + AI Models ═══ */}
      <div className="grid grid-cols-12 items-stretch gap-5">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="col-span-7">
          <Card className="h-full p-6">
            <SectionHead icon={Activity} tint="bg-blue-50 text-blue-600" title="System Overview" right={<Badge tone="success"><Dot tone="success" pulse /> Online</Badge>} />
            <InfoRow k="AI Workspace 状态" v="运行中"
              badge={<span className="flex items-center gap-1 text-[10.5px] text-emerald-600"><CheckCircle2 size={11} /> 健康</span>} />
            <InfoRow k="AI 引擎" v={llm ? health.llm_model || "glm-4-flash" : "规则模式"} badge={<span className="text-[10.5px] text-ink3">{llm ? "LLM" : "无 Key 降级"}</span>} />
            <InfoRow k="Agent 运行时" v="5 Agents" badge={<span className="text-[10.5px] text-ink3">按需编排</span>} />
            <InfoRow k="知识库" v="已同步" badge={<StateBadge on tone="success" />} />
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[
                { k: "工单", v: health?.tickets ?? "—", tint: "bg-blue-50 text-blue-700" },
                { k: "知识文档", v: health?.kb_docs ?? "—", tint: "bg-cyan-50 text-cyan-600" },
                { k: "检索片段", v: health?.kb_chunks ?? "—", tint: "bg-indigo-50 text-indigo-600" },
                { k: "问答留痕", v: health?.qa_logs ?? "—", tint: "bg-slate-100 text-slate-600" },
              ].map((x) => (
                <div key={x.k} className={cls("rounded-2xl px-3 py-3 text-center", x.tint)}>
                  <div className="num text-[20px] font-semibold">{x.v}</div>
                  <div className="mt-0.5 text-[10px] opacity-80">{x.k}</div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }} className="col-span-5">
          <Card className="h-full p-6">
            <SectionHead icon={Cpu} tint="bg-violet-50 text-violet-600" title="AI Models" right={<Badge tone="gray">模型配置</Badge>} />
            <InfoRow k="主模型 · Primary" v={llm ? health.llm_model || "glm-4-flash" : "未连接"} badge={llm ? <StateBadge on /> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">规则模式</span>} />
            <InfoRow k="检索模型 · Retrieval" v="BM25 关键词索引" badge={<span className="text-[10.5px] text-ink3">当前方案</span>} />
            <InfoRow k="Embedding · 向量" v="未启用" badge={<span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-ink3">升级路径</span>} />
            <InfoRow k="推理模式 · Reasoning" v="Balanced" badge={<span className="text-[10.5px] text-ink3">temperature 0.1–0.3</span>} />
            <InfoRow k="降级策略 · Fallback" v="Enabled" badge={<StateBadge on onLabel="自动降级规则模式" />} />
            <div className="mt-4 rounded-xl bg-surface2/60 px-3 py-2.5 text-[10.5px] leading-relaxed text-ink3">
              单次 LLM 调用失败自动降级规则模式，管道不中断；向量检索为接入真实语料后的升级路径
            </div>
          </Card>
        </motion.div>
      </div>

      {/* ═══ Row B：Connections + Security ═══ */}
      <div className="grid grid-cols-12 items-stretch gap-5">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="col-span-5">
          <Card className="h-full p-6">
            <SectionHead icon={Globe2} tint="bg-cyan-50 text-cyan-600" title="Connections" right={<Badge tone="gray">连接状态</Badge>} />
            <InfoRow k="LLM API（OpenAI 兼容）" v={llm ? "智谱开放平台" : "未配置 Key"}
              badge={llm ? <StateBadge on onLabel="已连接" /> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">mock</span>} />
            <InfoRow k="消息渠道 · Channel" v="email / wechat / phone" badge={<StateBadge on onLabel="已接入" />} />
            <InfoRow k="数据存储 · Storage" v={health?.db_dialect || "sqlite"} badge={<StateBadge on onLabel="已连接" />} />
            <InfoRow k="知识库存储 · KB" v="本地 Markdown + 表" badge={<StateBadge on onLabel="Active" />} />
            <div className="mt-4 rounded-xl border border-dashed border-line px-3 py-2.5 text-[10.5px] leading-relaxed text-ink3">
              FedEx / CRM 等外部系统为后续集成项：当前演示以邮件/微信/电话消息渠道模拟接入
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.14 }} className="col-span-7">
          <Card className="h-full p-6">
            <SectionHead icon={ShieldCheck} tint="bg-emerald-50 text-emerald-600" title="Security & Governance" right={<Badge tone="success">已启用 4 项</Badge>} />
            <div className="space-y-0">
              <div className="flex items-center justify-between gap-3 border-b border-line/50 py-2.5">
                <div><div className="text-[12.5px] font-medium text-ink">Prompt 注入防护</div><div className="text-[10px] text-ink3">消息中的指令性内容仅视为数据，不改变系统行为</div></div>
                <StateBadge on onLabel="已启用" />
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-line/50 py-2.5">
                <div><div className="text-[12.5px] font-medium text-ink">对话留痕 · Conversation Logging</div><div className="text-[10px] text-ink3">问答全量写入 qa_logs，支撑评测与审计</div></div>
                <StateBadge on onLabel="已启用" />
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-line/50 py-2.5">
                <div><div className="text-[12.5px] font-medium text-ink">审计追溯 · Audit Trail</div><div className="text-[10px] text-ink3">工单全量留痕 + 操作状态流转可查</div></div>
                <StateBadge on onLabel="已启用" />
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-line/50 py-2.5">
                <div><div className="text-[12.5px] font-medium text-ink">数据隐私 · Data Privacy</div><div className="text-[10px] text-ink3">全程模拟数据 · 可完全本地离线部署</div></div>
                <StateBadge on onLabel="声明已注明" />
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <div><div className="text-[12.5px] font-medium text-ink">知识库权限控制</div><div className="text-[10px] text-ink3">本地单机工作区，无多用户体系</div></div>
                <span className="rounded-full bg-surface2 px-2.5 py-0.5 text-[10.5px] text-ink3">单机模式</span>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* ═══ Row C：Advanced Settings（折叠） ═══ */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.18 }}>
        <Card className="overflow-hidden p-0">
          <button onClick={() => setAdvOpen(!advOpen)} className="flex w-full items-center gap-3 px-6 py-4 text-left transition hover:bg-surface2/40">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Wrench size={14} /></div>
            <span className="flex-1">
              <span className="block text-[14px] font-semibold text-ink">Advanced Settings</span>
              <span className="block text-[10.5px] text-ink3">API Token · CORS · 数据库 · 开发者配置</span>
            </span>
            <ChevronDown size={16} className={cls("text-ink3 transition-transform duration-300", advOpen && "rotate-180")} />
          </button>
          <AnimatePresence>
            {advOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                <div className="border-t border-line/60 px-6 py-5">
                  <div className="grid grid-cols-12 gap-5">
                    <div className="col-span-6 space-y-0">
                      <InfoRow k="API Token 鉴权" v="可选（Bearer / X-API-Key）" badge={<span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-ink3">环境变量 API_TOKEN</span>} />
                      <InfoRow k="CORS 来源" v="默认 *（本地演示）" badge={<span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-ink3">CORS_ORIGINS</span>} />
                      <InfoRow k="上传上限" v="2 MB" badge={<span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-ink3">MAX_UPLOAD_BYTES</span>} />
                      <InfoRow k="消息长度上限" v="3000 字符" badge={<span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-ink3">防超长输入</span>} />
                    </div>
                    <div className="col-span-6 space-y-0">
                      <InfoRow k="数据库" v={health?.db_dialect || "sqlite"} badge={<Database size={12} className="text-ink3" />} />
                      <InfoRow k="连接串来源" v="DATABASE_URL 环境变量" badge={<span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-ink3">可切 PG/MySQL</span>} />
                      <InfoRow k="迁移管理" v="Alembic 预留" badge={<span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-ink3">alembic/</span>} />
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-[12.5px] text-ink2">连接自检</span>
                        <button onClick={runTest} disabled={testing}
                          className="btn-grad flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold">
                          {testing ? <RefreshCcw size={12} className="animate-spin" /> : <RefreshCcw size={12} />} 运行自检
                        </button>
                      </div>
                    </div>
                  </div>
                  <AnimatePresence>
                    {result && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
                        <div className={cls("rounded-xl px-3.5 py-2.5 text-[12px] leading-relaxed", result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
                          {result.ok ? "✓ " : "✗ "}{result.msg}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="mt-4 flex items-start gap-1.5 text-[10px] leading-relaxed text-ink3">
                    <Lock size={10} className="mt-0.5 shrink-0" /> 配置项全部通过环境变量 / .env 管理，不落库、不提交版本库
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>
    </div>
  );
}
