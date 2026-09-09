import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, BookOpen, Sparkles, FileText, X, Brain, Database, FolderSearch,
  Filter, PenLine, ChevronDown, ChevronUp, CornerDownRight, Bot, Loader2, CheckCircle2,
} from "lucide-react";
import { Card, Badge, Empty, Dot } from "../components/ui.jsx";
import { api } from "../api.js";

/* 相关推荐问题（基于知识库真实覆盖主题） */
const RELATED = [
  { q: "海关扣货了怎么办？", cat: "关务" },
  { q: "出口报关需要哪些资料？", cat: "关务" },
  { q: "滞箱费是怎么收费的？", cat: "账单" },
  { q: "目的港滞留超期会怎样？", cat: "仓储" },
  { q: "货物破损如何索赔？", cat: "运输" },
  { q: "船期延误如何查询最新 ETA？", cat: "运输" },
];

/* RAG 检索管道（真实实现：BM25 关键词索引 + 置信过滤；向量检索为升级路径） */
const RAG_STEPS = [
  { icon: Brain, name: "查询理解", sub: "分词与信息词提取", tint: "bg-indigo-50 text-indigo-600" },
  { icon: Database, name: "BM25 索引检索", sub: "知识片段相关度打分", tint: "bg-blue-50 text-blue-600" },
  { icon: FolderSearch, name: "片段召回", sub: "Top-K 排序", tint: "bg-cyan-50 text-cyan-600" },
  { icon: Filter, name: "置信过滤", sub: "无命中建议转人工", tint: "bg-amber-50 text-amber-600" },
  { icon: PenLine, name: "回答生成", sub: "LLM / 摘录并标注来源", tint: "bg-emerald-50 text-emerald-600" },
];

/* 回答轻渲染：保留换行、【来源】行转高亮块 */
function renderAnswer(text) {
  if (!text) return null;
  const lines = String(text).split("\n");
  return lines.map((line, i) => {
    const t = line.trim();
    if (/^【来源/.test(t)) {
      return (
        <div key={i} className="mt-3 flex items-start gap-2 rounded-xl bg-blue-50/70 px-3 py-2 text-[12px] text-blue-800">
          <CornerDownRight size={12} className="mt-0.5 shrink-0 text-blue-400" />
          <span className="whitespace-pre-wrap break-all">{t}</span>
        </div>
      );
    }
    const m = t.match(/^(\d+)[.、]\s*(.*)$/) || t.match(/^[-•]\s*(.*)$/);
    if (m) {
      const no = /^\d+[.、]/.test(t) ? t.match(/^(\d+)[.、]/)[1] : "•";
      return (
        <div key={i} className="mb-1 flex gap-2 text-[13.5px] leading-[1.9] text-ink/90">
          <span className="grad-text num mt-[3px] shrink-0 text-[11px] font-semibold">{no}</span>
          <span>{m[1] || m[2]}</span>
        </div>
      );
    }
    return t === "" ? <div key={i} className="h-2" /> : <p key={i} className="mb-1.5 whitespace-pre-wrap text-[13.5px] leading-[1.9] text-ink/90">{t}</p>;
  });
}

export default function Knowledge({ health }) {
  const [docs, setDocs] = useState([]);
  const [q, setQ] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | search | generate | done | empty | error
  const [ans, setAns] = useState(null);
  const [expand, setExpand] = useState(null);
  const [detail, setDetail] = useState(null);
  const timers = useRef([]);
  const llm = health?.ai_mode === "llm";

  useEffect(() => {
    api.kbDocs().then(setDocs).catch(() => {});
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const ask = async (question) => {
    const text = (question ?? q).trim();
    if (!text || phase === "search" || phase === "generate") return;
    setQ(text);
    setAns(null);
    setExpand(null);
    setPhase("search");
    timers.current.forEach(clearTimeout);
    timers.current = [setTimeout(() => setPhase("generate"), 750)];
    try {
      const r = await api.qa(text);
      setAns(r);
      setPhase(r.mode === "fallback" || !r.sources?.length ? "empty" : "done");
    } catch (e) {
      setAns({ answer: "请求失败：" + e.message, sources: [], retrieved: [], question: text });
      setPhase("error");
    }
  };

  const thinking = phase === "search" || phase === "generate";
  const thinkLabel = phase === "search" ? "正在检索知识库…" : "正在生成回答…";
  const totalChunks = useMemo(() => docs.reduce((s, d) => s + d.chunks, 0), [docs]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="display text-[30px] font-semibold tracking-[-0.02em] text-ink">知识库</h1>
          <p className="mt-1 text-[13.5px] text-ink2">企业级 RAG 检索 · 答案带来源 · 无命中自动建议转人工</p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-ink2">
          <Dot tone={llm ? "success" : "warning"} pulse /> {llm ? "LLM 生成回答" : "摘录模式 · 规则"}
        </div>
      </div>

      {/* ═══ AI Search Bar ═══ */}
      <Card className="relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full" style={{ background: "radial-gradient(circle, rgba(6,182,212,.12), transparent 65%)" }} />
        <div className="relative flex items-center gap-2.5 rounded-2xl border border-line bg-surface2/40 px-4 py-3 transition focus-within:border-blue-300 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(29,78,216,.07)]">
          <Search size={17} className="shrink-0 text-ink3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="问任何物流流程问题：滞箱费、清关资料、索赔流程……"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink3"
          />
          <button onClick={() => ask()} disabled={thinking}
            className="btn-grad flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold">
            {thinking ? <><Loader2 size={13} className="animate-spin" /> {thinkLabel}</> : "检索"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {RELATED.slice(0, 4).map((s) => (
            <button key={s.q} onClick={() => ask(s.q)}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-ink2 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
              {s.q}
            </button>
          ))}
        </div>
      </Card>

      {/* ═══ 主体：左右两栏 ═══ */}
      <div className="grid grid-cols-12 items-start gap-5">
        {/* 左：AI Answer Workspace */}
        <div className="col-span-8">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <Card className="relative min-h-[540px] overflow-hidden p-6">
              {(phase === "done" || phase === "empty") && (
                <div className="pointer-events-none absolute inset-0 rounded-[28px] shadow-[0_0_44px_-12px_rgba(29,78,216,.32)] ring-1 ring-blue-200/80" />
              )}
              {thinking && (
                <div className="space-y-4 py-8">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="grad flex h-9 w-9 items-center justify-center rounded-xl shadow-[0_8px_18px_-6px_rgba(37,99,235,.5)]"><Bot size={16} className="text-white" /></div>
                      <span className="ai-pulse absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
                    </div>
                    <div>
                      <div className="text-[13.5px] font-semibold text-ink">AI 正在检索与生成</div>
                      <div className="text-[11.5px] text-ink3">{thinkLabel}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {RAG_STEPS.map((s, i) => {
                      const Icon = s.icon;
                      const done = phase === "generate" ? i < 3 : i < 1;
                      const active = phase === "generate" && i === 3;
                      return (
                        <div key={s.name} className="flex items-center gap-1.5">
                          <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] ${done ? "bg-emerald-50 font-medium text-emerald-600" : active ? "bg-blue-50 font-medium text-blue-600" : "bg-surface2 text-ink3"}`}>
                            {done ? <CheckCircle2 size={9} /> : active ? <Loader2 size={9} className="animate-spin" /> : <Icon size={9} />}
                            {s.name}
                          </span>
                          {i < RAG_STEPS.length - 1 && <span className="text-[10px] text-ink3">→</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!thinking && !ans && (
                <div className="flex min-h-[480px] flex-col items-center justify-center text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 ring-1 ring-blue-100">
                    <BookOpen size={22} className="text-blue-600" />
                  </div>
                  <div className="text-[15px] font-semibold text-ink">向知识库提问，获得带来源的回答</div>
                  <div className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-ink3">
                    覆盖清关、滞箱费、索赔等高频问题 · {docs.length} 篇文档 · {totalChunks} 个检索片段 · 答不上自动建议转人工
                  </div>
                  <div className="mx-auto mt-5 grid max-w-md grid-cols-3 gap-2 text-left">
                    {[
                      { k: "检索", v: "BM25 命中片段" },
                      { k: "引用", v: "来源一键展开" },
                      { k: "兜底", v: "无命中转人工" },
                    ].map((x) => (
                      <div key={x.k} className="rounded-xl bg-surface2/60 px-3 py-2.5">
                        <div className="text-[11px] font-semibold text-ink">{x.k}</div>
                        <div className="mt-0.5 text-[10px] leading-snug text-ink3">{x.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!thinking && ans && (
                <div>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-[13px] text-ink2">
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-ink2">Q</span>
                      <span className="truncate font-medium text-ink">{ans.question}</span>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10.5px] font-semibold text-blue-600">
                      <Sparkles size={10} /> AI 生成
                    </span>
                  </div>
                  {phase === "empty" ? (
                    <div className="rounded-2xl bg-amber-50/70 px-4 py-4 text-[13.5px] leading-relaxed text-amber-800">
                      知识库中暂无相关内容，建议转人工客服
                      <div className="mt-1.5 text-[11.5px] text-amber-600/80">可尝试调整关键词，或点击下方相关问题</div>
                    </div>
                  ) : (
                    <div>{renderAnswer(ans.answer)}</div>
                  )}
                  <div className="mt-4 flex items-center gap-2 text-[10.5px] text-ink3">
                    <span className="rounded-full bg-surface2 px-2 py-0.5">{ans.mode === "llm" ? "LLM 生成 · glm-4-flash" : ans.mode === "error" ? "请求异常" : ans.mode === "fallback" ? "未命中" : "摘录模式"}</span>
                    <span>引用 {ans.sources?.length ?? 0} 篇文档</span>
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        </div>

        {/* 右：Evidence + 文档总览（等高链） */}
        <div className="col-span-4 space-y-5">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.08 }} >
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink2"><FileText size={13} className="text-ink3" /> 证据与来源</span>
                <Badge tone="gray">{ans?.sources?.length ?? 0} 篇</Badge>
              </div>
              {!ans || ans.sources?.length === 0 ? (
                <Empty text={thinking ? "检索中…" : "搜索后展示命中的知识片段"} />
              ) : (
                <div className="space-y-2.5">
                  {ans.sources.map((s, i) => {
                    const snippet = ans.retrieved?.[i] || "（命中片段）";
                    const open = expand === i;
                    return (
                      <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                        <div className={`rounded-2xl border transition-all ${open ? "border-blue-200 shadow-[0_6px_18px_-10px_rgba(29,78,216,.4)]" : "border-line bg-surface hover:border-blue-200 hover:shadow-[0_6px_16px_-10px_rgba(29,78,216,.25)]"}`}>
                          <button onClick={() => setExpand(open ? null : i)} className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left">
                            <FileText size={14} className="shrink-0 text-blue-500" />
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{s.title}</span>
                            {open ? <ChevronUp size={13} className="shrink-0 text-ink3" /> : <ChevronDown size={13} className="shrink-0 text-ink3" />}
                          </button>
                          <AnimatePresence>
                            {open && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                                <div className="border-t border-line/70 px-3.5 py-3">
                                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink3">命中片段</div>
                                  <div className="line-clamp-4 whitespace-pre-wrap rounded-lg bg-surface2/60 px-2.5 py-2 text-[11.5px] leading-relaxed text-ink/80">{snippet}</div>
                                  <button onClick={() => api.kbDoc(s.id).then(setDetail).catch(() => {})}
                                    className="mt-2 flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline">
                                    <BookOpen size={11} /> 查看文档原文
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    );
                  })}
                  <div className="rounded-xl border border-dashed border-line px-3 py-2 text-[10.5px] text-ink3">
                    片段为检索返回的真实内容，相关度由 BM25 排序决定
                  </div>
                </div>
              )}
            </Card>
          </motion.div>

          {/* 文档总览卡：平衡右栏高度 */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.12 }} >
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink2"><BookOpen size={13} className="text-ink3" /> 知识库文档</span>
                <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-ink3">{docs.length} 篇</span>
              </div>
              <div className="max-h-[240px] space-y-0.5 overflow-y-auto pr-1">
                {docs.map((d) => (
                  <button key={d.id} onClick={() => api.kbDoc(d.id).then(setDetail).catch(() => {})}
                    className="row-hover flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left">
                    <span className="num w-6 shrink-0 text-[10.5px] text-ink3">{String(d.id).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-ink/85">{d.title}</span>
                    <span className="num shrink-0 text-[10px] text-ink3">{d.chunks} 块</span>
                  </button>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* ═══ Bottom：RAG Pipeline + Related Questions ═══ */}
      <div className="grid grid-cols-12 items-stretch gap-5">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05 }} className="col-span-7 flex flex-col">
          <Card className="flex flex-1 flex-col p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink">RAG 检索管道</span>
              <span className="text-[10.5px] text-ink3">BM25 关键词索引 · 向量检索为升级路径</span>
            </div>
            <div className="flex items-stretch">
              {RAG_STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={s.name} className="flex flex-1 items-center">
                    <motion.div whileHover={{ y: -2 }}
                      className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface px-1 py-3 text-center transition hover:border-blue-200 hover:shadow-[0_6px_16px_-10px_rgba(29,78,216,.25)]">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${s.tint}`}><Icon size={13} /></div>
                      <div className="text-[10.5px] font-semibold text-ink">{s.name}</div>
                      <div className="hidden px-1 text-[8.5px] leading-tight text-ink3 lg:block">{s.sub}</div>
                    </motion.div>
                    {i < RAG_STEPS.length - 1 && (
                      <div className="relative mx-1 h-px w-4 shrink-0 overflow-hidden rounded bg-slate-200">
                        <motion.div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-400"
                          initial={{ x: "-100%" }} animate={{ x: "100%" }}
                          transition={{ duration: 1.6, repeat: Infinity, ease: "linear", delay: i * 0.2 }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1 }} className="col-span-5 flex flex-col">
          <Card className="flex flex-1 flex-col p-5">
            <div className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-ink"><Sparkles size={13} className="text-blue-500" /> 相关问题</div>
            <div className="grid grid-cols-1 gap-1">
              {RELATED.map((s) => (
                <button key={s.q} onClick={() => ask(s.q)}
                  className="row-hover group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left">
                  <span className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-ink3">{s.cat}</span>
                  <span className="flex-1 text-[12.5px] text-ink/85 group-hover:text-blue-700">{s.q}</span>
                  <CornerDownRight size={12} className="text-ink3 opacity-0 transition group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* 文档详情弹层 */}
      <AnimatePresence>
        {detail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-6 backdrop-blur-sm" onClick={() => setDetail(null)}>
            <motion.div initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }}
              className="card-premium max-h-[78vh] w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-line px-6 py-3.5">
                <span className="flex items-center gap-2 text-[14px] font-semibold text-ink"><FileText size={15} className="text-blue-500" /> {detail.title}</span>
                <button onClick={() => setDetail(null)} className="rounded-full p-1.5 text-ink3 hover:bg-surface2"><X size={15} /></button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap px-6 py-4 text-[13px] leading-[1.9] text-ink/85">{detail.content}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
