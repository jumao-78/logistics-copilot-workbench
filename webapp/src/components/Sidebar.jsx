import React from "react";
import { LayoutDashboard, Inbox, BookOpen, Workflow, BarChart3, Settings, Ship, Bot, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cls } from "../api.js";

const NAV = [
  { id: "dashboard", label: "总览", icon: LayoutDashboard, sub: "运营态势" },
  { id: "inbox", label: "工单台", icon: Inbox, sub: "AI 建议回复" },
  { id: "knowledge", label: "知识库", icon: BookOpen, sub: "RAG 检索问答" },
  { id: "flow", label: "智能管道", icon: Workflow, sub: "Agent 编排" },
  { id: "analytics", label: "数据分析", icon: BarChart3, sub: "执行洞察" },
  { id: "settings", label: "设置", icon: Settings, sub: "工作区配置" },
];

export default function Sidebar({ page, setPage, collapsed, onToggle }) {
  return (
    <aside className={cls("fixed inset-y-0 left-6 top-6 z-30 flex flex-col transition-[width] duration-300 ease-out",
      collapsed ? "w-[72px]" : "w-[228px]")}>
      {/* Floating white sidebar */}
      <div className="card-premium flex h-full flex-col p-3" hover={false}>
        {/* Brand + 折叠按钮 */}
        <div className={cls("flex items-center pb-4 pt-1.5", collapsed ? "flex-col gap-2" : "gap-3 px-2")}>
          <div className="grad flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-[0_8px_20px_-6px_rgba(37,99,235,.6)]">
            <Ship size={20} className="text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="display text-[14px] font-semibold tracking-[-0.01em] text-ink">Logistics</div>
              <div className="display text-[14px] font-semibold tracking-[-0.01em] text-ink">Copilot</div>
            </div>
          )}
          <button
            onClick={onToggle}
            title={collapsed ? "展开导航栏" : "收起导航栏"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink3 transition hover:bg-surface2 hover:text-blue-600"
          >
            {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
          </button>
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
                title={collapsed ? `${n.label} · ${n.sub}` : undefined}
                className={cls(
                  "side-item group flex items-center rounded-2xl text-left",
                  collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                  active ? "side-active" : "text-ink2"
                )}
              >
                <Icon size={17} className={cls("shrink-0", active ? "text-blue-700" : "text-ink3 group-hover:text-ink2")} strokeWidth={2} />
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className={cls("block truncate text-[13.5px] font-medium", active ? "text-ink" : "")}>{n.label}</span>
                      <span className="block truncate text-[11px] text-ink3">{n.sub}</span>
                    </span>
                    {active && <span className="grad ml-1 h-1.5 w-1.5 rounded-full" />}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer status */}
        <div className={cls("mt-auto rounded-2xl bg-surface2/70 text-ink", collapsed ? "flex flex-col items-center gap-1.5 py-2.5" : "p-3")}>
          {collapsed ? (
            <>
              <Bot size={15} className="grad-text" />
              <span className="num text-[9.5px] text-ink3">v2.0</span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[11.5px] font-medium text-ink">
                <Bot size={14} className="grad-text" /> 4 个 Agent 持续运行
              </div>
              <div className="mt-2 flex items-center justify-between text-[10.5px] text-ink3">
                <span>规则 / LLM 模式</span>
                <span className="num">v2.0</span>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
