// demo 接口内核的行为测试：直接跑真实快照数据，验证每个端点的返回结构。
// 运行：cd demo/mock && node --test api-core.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { createMockApi, extractFields } from "./api-core.js";
import { DEMO_DATA } from "./data.js";

const api = createMockApi(DEMO_DATA);
const call = (method, path, { query = "", body = null } = {}) =>
  api.handle({ method, path, query: new URLSearchParams(query), body });

test("health 反映快照规模", () => {
  const { status, body } = call("GET", "/api/health");
  assert.equal(status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.tickets, 320);
  assert.equal(body.kb_docs, 10);
  assert.equal(body.ai_mode, "mock");
});

test("tickets 支持分页与状态筛选", () => {
  const all = call("GET", "/api/tickets", { query: "page=1&page_size=40" });
  assert.equal(all.body.total, 320);
  assert.equal(all.body.items.length, 40);
  assert.equal(all.body.page, 1);

  const pending = call("GET", "/api/tickets", { query: "status=待处理&page_size=100" });
  assert.ok(pending.body.total > 0);
  assert.ok(pending.body.items.every((t) => t.status === "待处理"));

  const second = call("GET", "/api/tickets", { query: "page=2&page_size=40" });
  assert.notEqual(second.body.items[0].id, all.body.items[0].id);
});

test("tickets 关键词搜索命中提单号", () => {
  const withBill = api.state.tickets.find((t) => t.bill_no);
  assert.ok(withBill, "快照里应存在带提单号的工单");
  const res = call("GET", "/api/tickets", { query: `q=${withBill.bill_no}` });
  assert.ok(res.body.total >= 1);
  assert.ok(res.body.items.some((t) => t.id === withBill.id));
});

test("规则提取与后端 mock 分支一致", () => {
  // 与 app/ai_pipeline.py 的 mock_extract 逐字段对齐（同一句话在 Python 侧输出同值）
  const f = extractFields("您好，柜号 MSKU1234567 从上海到洛杉矶，被海关扣货了，提单号 COSU4481201661");
  assert.equal(f.bill_no, "COSU4481201661");
  assert.equal(f.container_no, "MSKU1234567");
  assert.equal(f.category, "关务");
  assert.equal(f.urgency, "高");
  assert.equal(f.pol, "上海");
  assert.equal(f.pod, "洛杉矶");

  assert.equal(extractFields("账单里的滞箱费好像多收了，麻烦核对").category, "账单");
  assert.equal(extractFields("仓库入库预约时间能改吗").category, "仓储");
  assert.equal(extractFields("我们想订下周舱位，运价多少").category, "运输");
  assert.equal(extractFields("随便问问").urgency, "低");
});

test("新建工单写回内存并影响 KPI", () => {
  const before = api.state.tickets.length;
  const { status, body } = call("POST", "/api/tickets", {
    body: { raw_text: "客户来电：柜号 TGHU7788991 在目的港被扣留了，非常急，麻烦尽快处理", channel: "phone" },
  });
  assert.equal(status, 200);
  assert.equal(body.channel, "phone");
  assert.equal(body.urgency, "高");
  assert.equal(body.status, "AI已处理");
  assert.ok(body.suggested_reply.length > 10);
  assert.equal(api.state.tickets.length, before + 1);

  const summary = call("GET", "/api/dashboard/summary").body;
  assert.equal(summary.kpi.total, 321);
});

test("重复创建被 409 拦下", () => {
  const raw = "同一句话在 30 分钟内重复提交";
  assert.equal(call("POST", "/api/tickets", { body: { raw_text: raw } }).status, 200);
  assert.equal(call("POST", "/api/tickets", { body: { raw_text: raw } }).status, 409);
});

test("状态流转校验非法值", () => {
  const id = api.state.tickets[0].id;
  const ok = call("PATCH", `/api/tickets/${id}/status`, { body: { status: "人工处理" } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, "人工处理");
  const bad = call("PATCH", `/api/tickets/${id}/status`, { body: { status: "瞎写" } });
  assert.equal(bad.status, 400);
});

test("RAG 问答命中知识库并给出来源", () => {
  const res = call("POST", "/api/qa", { body: { question: "滞箱费怎么算？" } });
  assert.equal(res.status, 200);
  assert.equal(res.body.mode, "mock");
  assert.ok(res.body.answer.includes("【来源："));
  assert.ok(res.body.sources.length >= 1);
  assert.ok(res.body.retrieved.length >= 1);

  const doc = call("POST", "/api/qa", { body: { question: "提单电放怎么办" } });
  assert.ok(doc.body.sources.some((s) => s.title.includes("提单")));

  const off = call("POST", "/api/qa", { body: { question: "今天天气怎么样" } });
  assert.equal(off.body.mode, "fallback");
  assert.equal(off.body.sources.length, 0);
});

test("问答写入日志并可按 limit 读取", () => {
  const before = call("GET", "/api/qa/logs", { query: "limit=50" }).body.length;
  call("POST", "/api/qa", { body: { question: "目的港清关要多久" } });
  const logs = call("GET", "/api/qa/logs", { query: "limit=5" }).body;
  assert.equal(logs.length, 5);
  assert.ok(logs[0].question.includes("清关"));
  assert.ok(call("GET", "/api/qa/logs", { query: "limit=50" }).body.length >= before);
});

test("知识库列表与详情字段齐全", () => {
  const docs = call("GET", "/api/kb/docs").body;
  assert.equal(docs.length, 10);
  assert.ok(docs.every((d) => d.id && d.title && typeof d.chunks === "number"));

  const one = call("GET", `/api/kb/docs/${docs[0].id}`).body;
  assert.ok(one.content.length > 100);
  assert.equal(one.title, docs[0].title);
});

test("看板与洞察返回前端所需字段", () => {
  const s = call("GET", "/api/dashboard/summary").body;
  for (const k of ["kpi", "trend", "category_dist", "top_intents", "status_dist", "overdue"]) {
    assert.ok(k in s, `summary 缺少 ${k}`);
  }
  assert.equal(s.trend.length, 7);

  const ins = call("GET", "/api/dashboard/insight").body;
  assert.ok(ins.insight.length > 50);
  assert.ok("kpi_snapshot" in ins);
});

test("未实现接口返回 404 而不是静默成功", () => {
  const res = call("GET", "/api/unknown");
  assert.equal(res.status, 404);
  assert.match(res.body.detail, /未实现/);
});
