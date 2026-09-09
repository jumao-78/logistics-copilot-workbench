import React from "react";
import { motion } from "framer-motion";
import { cls } from "../api.js";

/* 通用浮白卡片 */
export function Card({ className = "", children, hover = true, ...rest }) {
  return (
    <div className={cls("card-premium p-6", hover ? "" : "", className)} {...rest}>
      {children}
    </div>
  );
}

/* 卡片标题行：标题 + 说明 */
export function CardHead({ title, sub, right }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</div>
        {sub && <div className="mt-0.5 text-[13px] text-ink2">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

/* 中性徽章（分类/状态统一为单色系 + 语义色仅状态用） */
const tint = {
  primary: "bg-blue-50 text-blue-700",
  gray: "bg-slate-100 text-slate-600",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600",
};
export function Badge({ tone = "gray", children }) {
  return (
    <span className={cls("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tint[tone])}>
      {children}
    </span>
  );
}

/* 分类徽章：中性色，仅文字区分（遵守单色系原则） */
export function CategoryBadge({ category }) {
  return <Badge tone="gray">{category || "其他"}</Badge>;
}

/* 状态徽章 */
export function StatusBadge({ status }) {
  const map = {
    待处理: "danger",
    AI已处理: "primary",
    人工处理: "warning",
    已关闭: "gray",
  };
  return <Badge tone={map[status] || "gray"}>{status}</Badge>;
}

/* 紧急度 */
export function UrgencyBadge({ urgency }) {
  const map = { 高: "danger", 中: "warning", 低: "gray" };
  return <Badge tone={map[urgency] || "gray"}>{urgency || "低"}</Badge>;
}

/* 小圆点状态灯 */
export function Dot({ tone = "success", pulse = false }) {
  const c = { success: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-red-500", primary: "bg-blue-600", gray: "bg-slate-400" };
  return <span className={cls("inline-block h-2 w-2 rounded-full", c[tone], pulse && "ai-pulse")} />;
}

/* 入场动画容器 */
export function Reveal({ children, delay = 0, y = 18, className }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* 空态 */
export function Empty({ text = "暂无数据" }) {
  return <div className="py-12 text-center text-[13px] text-ink3">{text}</div>;
}

/* 加载态（柔和） */
export function Loading({ text = "载入中…" }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-ink3">
      <span className="h-2 w-2 rounded-full bg-blue-500 ai-pulse" />
      {text}
    </div>
  );
}
