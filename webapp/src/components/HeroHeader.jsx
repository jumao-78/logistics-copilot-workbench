import React from "react";
import { motion } from "framer-motion";
import { Sparkles, Globe2, BookOpenCheck, Radar, Ship } from "lucide-react";

/* Hero Header — Vectrus Energy 灵感：mesh gradient + radial glow + AI Orb */
export default function HeroHeader({ health }) {
  const llm = health?.ai_mode === "llm";
  const status = [
    { icon: Radar, label: llm ? "LLM 已连接" : "规则模式运行中", tone: llm ? "text-emerald-200" : "text-amber-200", dot: llm ? "bg-emerald-300" : "bg-amber-300" },
    { icon: Globe2, label: "FedEx API 已连接", tone: "text-emerald-200", dot: "bg-emerald-300" },
    { icon: BookOpenCheck, label: `知识库已同步 · ${health?.kb_docs ?? "—"} 篇`, tone: "text-cyan-200", dot: "bg-cyan-300" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
      className="relative h-[236px] overflow-hidden rounded-[36px]"
      style={{
        background:
          "linear-gradient(118deg, #0b1e4b 0%, #123a8f 30%, #4f46e5 68%, #0e7490 100%)",
        boxShadow: "0 30px 80px -24px rgba(30,64,175,.55)",
      }}
    >
      {/* 内层 mesh 光晕 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(700px 340px at 82% -20%, rgba(103,232,249,.34), transparent 62%)," +
            "radial-gradient(560px 300px at 14% 130%, rgba(129,140,248,.30), transparent 60%)," +
            "radial-gradient(420px 260px at 60% 118%, rgba(6,182,212,.16), transparent 65%)",
        }}
      />
      {/* 极淡网格 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px),linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)", backgroundSize: "44px 44px" }}
      />
      {/* Glass 上缘 */}
      <div className="pointer-events-none absolute inset-x-10 top-6 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />

      {/* 状态 chips 右上 */}
      <div className="absolute right-8 top-8 flex items-center gap-2.5">
        {status.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.12, duration: 0.5 }}
            className="glass flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-medium"
          >
            <span className={s.tone}>{s.label}</span>
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ai-pulse`} />
          </motion.div>
        ))}
      </div>

      {/* 左下标题区 */}
      <div className="absolute bottom-8 left-10 max-w-[560px]">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.22em] text-blue-200/80">
          <Sparkles size={13} /> AI 智能客服工作台
        </div>
        <h1 className="display text-[33px] font-semibold leading-[1.08] tracking-[-0.02em] text-white">
          让全球物流工单
          <br />
          用 AI 工作流自动闭环
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-blue-100/75">
          {health ? `${health.tickets} 张工单 · ${health.kb_docs} 篇知识库 · ${health.qa_logs} 次问答` : "正在连接工作区…"}
        </p>
      </div>

      {/* 左上品牌标签（Logo 已在 Sidebar，此处极简水印） */}
      <div className="absolute left-10 top-8 text-[11px] font-medium uppercase tracking-[0.3em] text-white/50">
        Logistics Copilot
      </div>

      {/* 航线轨道核心 —— 右下角固定，避开所有文字区 */}
      <motion.div
        className="pointer-events-none absolute right-[6%] top-[42%]"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.45, duration: 0.9, ease: "easeOut" }}
      >
        <div className="relative h-[132px] w-[132px]">
          {/* 环境光晕 */}
          <div
            className="absolute -inset-6 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(56,189,248,.26), rgba(56,189,248,0) 68%)" }}
          />
          {/* 轨道 1（外） */}
          <div className="absolute inset-0 rounded-full border border-white/14" />
          <div className="absolute inset-0 animate-[spin_16s_linear_infinite]">
            <span className="absolute left-1/2 top-0 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200 shadow-[0_0_12px_rgba(165,243,252,1)]" />
            <span className="absolute bottom-[4%] right-[7%] h-[4px] w-[4px] rounded-full bg-blue-300/90 shadow-[0_0_8px_rgba(147,197,253,.9)]" />
          </div>
          {/* 轨道 2（中，反向） */}
          <div className="absolute inset-[10%] rounded-full border border-white/12" />
          <div className="absolute inset-[10%] animate-[spin_24s_linear_infinite_reverse]">
            <span className="absolute left-[8%] top-1/2 h-[4px] w-[4px] -translate-y-1/2 rounded-full bg-sky-200 shadow-[0_0_10px_rgba(186,230,253,1)]" />
          </div>
          {/* 轨道 3（内，快） */}
          <div className="absolute inset-[22%] rounded-full border border-white/10" />
          <div className="absolute inset-[22%] animate-[spin_10s_linear_infinite]">
            <span className="absolute left-1/2 top-1/2 h-[4px] w-[4px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,.95)]" style={{ marginTop: "-50%" }} />
          </div>
          {/* 中心发光核心 */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative flex h-9 w-9 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-cyan-300/25 blur-[6px]" />
              <div className="grad h-5 w-5 rounded-full shadow-[0_0_18px_rgba(56,189,248,.85)]" />
              <div className="absolute inset-[-6px] rounded-full border border-white/25" />
              <div className="absolute inset-[-12px] rounded-full border border-dashed border-white/12" />
            </div>
          </div>
        </div>
      </motion.div>

      {/* 底部细光 */}
      <div className="pointer-events-none absolute bottom-0 inset-x-16 h-px bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent" />
      <Ship size={300} className="pointer-events-none absolute -right-14 -bottom-20 text-white opacity-[0.03]" strokeWidth={1} />
    </motion.div>
  );
}
