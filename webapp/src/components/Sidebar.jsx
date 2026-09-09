import React from "react";
import { LayoutDashboard, Inbox, BookOpen, Workflow, BarChart3, Settings, Ship, Bot } from "lucide-react";
import { cls } from "../api.js";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, sub: "运营总览" },
  { id: "inbox", label: "Inbox", icon: Inbox, sub: "工单与 AI Copilot" },
  { id: "knowledge", label: "Knowledge", icon: BookOpen, sub: "知识库检索" },
  { id: "flow", label: "Agent Flow", icon: Workflow, sub: "AI 管道编排" },
  { id: "analytics", label: "Analytics", icon: BarChart3, sub: "执行分析" },
  { id: "settings", label: "Settings", icon: Settings, sub: "设置" },
];

export default function Sidebar({ page, setPage }) {
  return (
    <aside className="fixed inset-y-0 left-6 top-6 z-30 flex w-[228px] flex-col">
      {/* Floating white sidebar */}
      <div className="card-premium flex h-full flex-col p-4" hover={false}>
        {/* Brand */}
        <div className="flex items-center gap-3 px-2 pb-5 pt-2">
          <div className="grad flex h-10 w-10 items-center justify-center rounded-2xl shadow-[0_8px_20px_-6px_rgba(37,99,235,.6)]">
            <Ship size={20} className="text-white" />
          </div>
          <div className="leading-tight">
            <div className="display text-[14px] font-semibold tracking-[-0.01em] text-ink">Logistics</div>
            <div className="display text-[14px] font-semibold tracking-[-0.01em] text-ink">Copilot</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="mt-1 flex flex-col gap-1">
          {NAV.map((n) => {
            const active = page === n.id;
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                onClick={() => setPage(n.id)}
                className={cls(
                  "side-item group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left",
                  active ? "side-active" : "text-ink2"
                )}
              >
                <Icon size={17} className={active ? "text-blue-700" : "text-ink3 group-hover:text-ink2"} strokeWidth={2} />
                <span className="flex-1">
                  <span className={cls("block text-[13.5px] font-medium", active ? "text-ink" : "")}>{n.label}</span>
                  <span className="block text-[11px] text-ink3">{n.sub}</span>
                </span>
                {active && <span className="grad ml-1 h-1.5 w-1.5 rounded-full" />}
              </button>
            );
          })}
        </nav>

        {/* Footer status */}
        <div className="mt-auto rounded-2xl bg-surface2/70 p-3">
          <div className="flex items-center gap-2 text-[11.5px] font-medium text-ink">
            <Bot size={14} className="grad-text" /> 4 AI Agents Active
          </div>
          <div className="mt-2 flex items-center justify-between text-[10.5px] text-ink3">
            <span>Rule / LLM mode</span>
            <span className="num">v2.0</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
