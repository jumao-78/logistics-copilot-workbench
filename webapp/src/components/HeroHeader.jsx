import React from "react";
import { motion } from "framer-motion";
import { Sparkles, Globe2, BookOpenCheck, Radar, Ship } from "lucide-react";

/* Hero Header — Vectrus Energy 灵感：mesh gradient + radial glow + AI Orb */
export default function HeroHeader({ health }) {
  const llm = health?.ai_mode === "llm";
  const status = [
    { icon: Radar, label: llm ? "LLM Connected" : "Rule Mode Active", tone: llm ? "text-emerald-200" : "text-amber-200", dot: llm ? "bg-emerald-300" : "bg-amber-300" },
    { icon: Globe2, label: "FedEx API Connected", tone: "text-emerald-200", dot: "bg-emerald-300" },
    { icon: BookOpenCheck, label: `Knowledge Synced · ${health?.kb_docs ?? "—"} docs`, tone: "text-cyan-200", dot: "bg-cyan-300" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
      className="relative h-[300px] overflow-hidden rounded-[36px]"
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
      <div className="absolute bottom-9 left-10 max-w-[560px]">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.22em] text-blue-200/80">
          <Sparkles size={13} /> AI Customer Success Workspace
        </div>
        <h1 className="display text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
          Resolve global logistics tickets
          <br />
          with AI-powered workflows.
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-blue-100/75">
          {health ? `${health.tickets} tickets · ${health.kb_docs} knowledge docs · ${health.qa_logs} QA sessions` : "Connecting to workspace…"}
        </p>
      </div>

      {/* 左上品牌标签（Logo 已在 Sidebar，此处极简水印） */}
      <div className="absolute left-10 top-8 text-[11px] font-medium uppercase tracking-[0.3em] text-white/50">
        Logistics Copilot
      </div>

      {/* AI Orb —— 蓝色玻璃球 */}
      <motion.div
        className="pointer-events-none absolute right-24 top-1/2 -translate-y-1/2"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.45, duration: 0.9, ease: "easeOut" }}
      >
        <div className="orb-float relative">
          <div
            className="h-40 w-40 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 32% 28%, rgba(191,219,254,.85), rgba(59,130,246,.34) 38%, rgba(30,58,138,.14) 70%, rgba(6,182,212,.30))",
              boxShadow:
                "inset 0 0 34px rgba(255,255,255,.28), inset -14px -18px 44px rgba(15,23,42,.35), 0 0 70px rgba(56,189,248,.42)",
              backdropFilter: "blur(2px)",
              border: "1px solid rgba(255,255,255,.28)",
            }}
          />
          {/* 内部结构线 */}
          <div className="absolute inset-3 rounded-full border border-white/15" />
          <div className="absolute inset-3 rounded-full" style={{ background: "linear-gradient(150deg, transparent 40%, rgba(103,232,249,.16) 60%, transparent 80%)" }} />
          <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200 ai-pulse shadow-[0_0_16px_rgba(165,243,252,.9)]" />
          {/* 轨道环 */}
          <div className="absolute -inset-5 rounded-full border border-white/8" />
        </div>
      </motion.div>

      {/* 底部细光 */}
      <div className="pointer-events-none absolute bottom-0 inset-x-16 h-px bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent" />
      <Ship size={300} className="pointer-events-none absolute -right-14 -bottom-20 text-white opacity-[0.03]" strokeWidth={1} />
    </motion.div>
  );
}
