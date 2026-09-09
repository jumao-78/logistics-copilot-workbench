import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Search, BookOpen, Sparkles, CornerDownRight, FileText, X } from "lucide-react";
import { Card, Badge, Empty, Loading, Dot } from "../components/ui.jsx";
import { api } from "../api.js";

const SUGGEST = ["滞箱费怎么算？", "出口报关需要哪些资料？", "免堆期是几天？", "货物破损怎么索赔？", "改单要多少钱？"];

export default function Knowledge({ health }) {
  const [docs, setDocs] = useState([]);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [ans, setAns] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => { api.kbDocs().then(setDocs).catch(() => {}); }, []);

  const ask = async (question) => {
    const text = (question ?? q).trim();
    if (!text) return;
    setQ(text);
    setAsking(true);
    setAns(null);
    try { setAns(await api.qa(text)); } catch (e) { setAns({ answer: "❌ " + e.message, sources: [], mode: "error" }); }
    setAsking(false);
  };

  const llm = health?.ai_mode === "llm";

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="display text-[30px] font-semibold tracking-[-0.02em] text-ink">Knowledge</h1>
          <p className="mt-1 text-[13.5px] text-ink2">检索增强问答 · 带来源引用 · 答不上自动建议转人工</p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-ink2">
          <Dot tone={llm ? "success" : "warning"} pulse /> {llm ? "LLM 回答" : "检索模式"}
        </div>
      </div>

      {/* 搜索首位 */}
      <Card className="relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full" style={{ background: "radial-gradient(circle, rgba(6,182,212,.12), transparent 65%)" }} />
        <div className="relative flex items-center gap-3 rounded-2xl border border-line bg-surface2/40 px-4 py-3 transition focus-within:border-blue-300 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(29,78,216,.08)]">
          <Search size={17} className="text-ink3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="问任何物流流程问题：滞箱费、清关资料、索赔流程……"
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink3"
          />
          <button onClick={() => ask()} disabled={asking} className="btn-grad flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold">
            {asking ? "检索中…" : "检索"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGEST.map((s) => (
            <button key={s} onClick={() => ask(s)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-ink2 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
              {s}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-12 items-start gap-5">
        {/* 左答案面板 */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="col-span-8">
          <Card className="min-h-[340px] p-6">
            {asking ? (
              <div className="space-y-3 py-10">
                <div className="mx-auto h-8 w-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
                <div className="text-center text-[13px] text-ink3">检索知识库片段 → 生成回答…</div>
              </div>
            ) : !ans ? (
              <div className="py-14 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50"><BookOpen size={20} className="text-blue-600" /></div>
                <div className="text-[14px] font-medium text-ink">搜索知识库，获取带来源的回答</div>
                <div className="mt-1 text-[12.5px] text-ink3">{docs.length} 篇文档 · {docs.reduce((s, d) => s + d.chunks, 0)} 个检索片段</div>
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-[14.5px] leading-[1.9] text-ink/90">{ans.answer}</div>
            )}
          </Card>
        </motion.div>

        {/* 右：引用 / 相关 */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="col-span-4 space-y-5">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink2"><CornerDownRight size={12} /> 引用来源 · {ans?.sources?.length ?? 0}</div>
            {ans && ans.sources.length > 0 ? (
              <div className="space-y-2">
                {ans.sources.map((s) => (
                  <button key={s.id} onClick={() => api.kbDoc(s.id).then(setDetail).catch(() => {})} className="row-hover flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-left">
                    <FileText size={13} className="text-blue-500" />
                    <span className="flex-1 truncate text-[12.5px] text-ink">{s.title}</span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] text-blue-600">{ans.mode === "mock" ? "片段" : "引用"}</span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty text="暂无引用来源" />
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink2"><Sparkles size={12} /> 知识库文档</div>
            <div className="space-y-1.5">
              {docs.map((d) => (
                <button key={d.id} onClick={() => api.kbDoc(d.id).then(setDetail).catch(() => {})} className="row-hover flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left">
                  <span className="num text-[11px] text-ink3">{String(d.id).padStart(2, "0")}</span>
                  <span className="flex-1 truncate text-[13px] text-ink/90">{d.title}</span>
                  <Badge tone="gray">{d.chunks} 块</Badge>
                </button>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* 文档预览 Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-6 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card-premium max-h-[78vh] w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-ink"><FileText size={16} className="text-blue-600" /> {detail.title}</div>
              <button onClick={() => setDetail(null)} className="rounded-full p-1.5 text-ink3 hover:bg-surface2"><X size={16} /></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap px-6 py-5 text-[13.5px] leading-[1.9] text-ink/85">{detail.content}</div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
