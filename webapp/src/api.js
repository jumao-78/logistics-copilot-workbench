// API 层：复用后端全部现有接口（V2 只改 UI，不改业务）
// 统一请求超时（默认 25s，覆盖 LLM 慢响应），避免按钮无限转圈
const REQUEST_TIMEOUT = 25000;
const call = async (path, opts = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  let resp;
  try {
    resp = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...opts,
    });
  } catch (e) {
    clearTimeout(timer);
    throw new Error(e.name === "AbortError" ? `请求超时（>${REQUEST_TIMEOUT / 1000}s）` : "网络连接失败");
  }
  clearTimeout(timer);
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch (_) {}
    throw new Error(detail);
  }
  return resp.json();
};

export const api = {
  health: () => call("/api/health"),
  tickets: (params = {}) =>
    call("/api/tickets?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ""))),
  ticket: (id) => call(`/api/tickets/${id}`),
  createTicket: (raw_text, channel) =>
    call("/api/tickets", { method: "POST", body: JSON.stringify({ raw_text, channel: channel || undefined }) }),
  setStatus: (id, status) =>
    call(`/api/tickets/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  reprocess: (id) => call(`/api/tickets/${id}/reprocess`, { method: "POST" }),
  summary: () => call("/api/dashboard/summary"),
  insight: () => call("/api/dashboard/insight"),
  qa: (question) => call("/api/qa", { method: "POST", body: JSON.stringify({ question }) }),
  kbDocs: () => call("/api/kb/docs"),
  kbDoc: (id) => call(`/api/kb/docs/${id}`),
  qaLogs: () => call("/api/qa/logs?limit=50"),
};

// 通用工具
export const fmt = {
  date: (s) => (s ? String(s).slice(5, 16).replace(" ", " ") : "—"),
  time: (s) => (s ? String(s).slice(11, 16) : "—"),
};
export const cls = (...xs) => xs.filter(Boolean).join(" ");
