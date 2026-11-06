// 浏览器侧适配层：把 /api/* 的 fetch 请求交给内存内核（api-core.js）处理。
// 必须在应用 bundle 之前加载——页面里两个 module 脚本按文档顺序执行。
import { createMockApi } from "./api-core.js";
import { DEMO_DATA } from "./data.js";

const api = createMockApi(DEMO_DATA);
const realFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

window.fetch = async function mockFetch(input, init = {}) {
  const url = typeof input === "string" ? input : (input && input.url) || String(input);
  const u = new URL(url, location.href);

  if (!u.pathname.startsWith("/api/")) {
    if (realFetch) return realFetch(input, init);
    return Promise.reject(new TypeError("演示模式下不支持该网络请求"));
  }

  const method = String(init.method || (input && input.method) || "GET").toUpperCase();
  let body = null;
  if (typeof init.body === "string" && init.body.trim()) {
    try { body = JSON.parse(init.body); } catch (_) { body = null; }
  }
  const res = api.handle({ method, path: u.pathname, query: u.searchParams, body });
  (window.__MOCK_LOG = window.__MOCK_LOG || []).push(`${method} ${u.pathname} -> ${res.status}`);
  // 轻微延迟，让加载态/骨架屏按真实节奏出现（问答模拟 RAG 检索耗时）
  await sleep(u.pathname === "/api/qa" ? 520 : 160);
  return new Response(JSON.stringify(res.body), {
    status: res.status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};

// 角标：明确告诉查看者这是静态演示（数据来自真实后端响应快照）
window.addEventListener("DOMContentLoaded", () => {
  try {
    const tag = document.createElement("div");
    tag.textContent = "静态演示 · 数据为真实后端响应快照";
    tag.style.cssText = [
      "position:fixed", "right:14px", "bottom:14px", "z-index:9999",
      "padding:6px 10px", "border-radius:999px", "font:500 11px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif",
      "color:#0f172a", "background:rgba(255,255,255,.88)", "border:1px solid rgba(15,23,42,.12)",
      "box-shadow:0 4px 14px rgba(15,23,42,.12)", "pointer-events:none", "letter-spacing:.02em",
    ].join(";");
    document.body.appendChild(tag);
  } catch (_) { /* 角标失败不影响演示 */ }
});
