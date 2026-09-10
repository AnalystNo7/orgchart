/*
 * Мок OpenAI-совместимого провайдера для проверки повторов, очереди и отмены
 * AI-чата (задача 0.3 в docs/IMPLEMENTATION-PLAN.md, tasks/ai-cancel-and-early-retry).
 *
 * Запуск:  node scripts/ai-retry-check/mock-llm.mjs   (слушает 127.0.0.1:8089)
 * Режимы переключаются на лету: GET /__control?mode=<mode>&reset=1
 *   ok                     — сразу успешный стрим
 *   slow:<ms>              — успешный стрим через <ms>
 *   drip:<ms>              — 200 SSE, текстовый чанк каждые <ms> до 60 с (цель для отмены)
 *   concurrent:<n>         — первые n запросов: 429 "too many concurrent requests"
 *   ratelimit:<n>:<ra>     — первые n запросов: 429 rate limit + Retry-After: <ra> с
 *   overloaded:<n>         — первые n запросов: 529 overloaded
 *   fail_step2:<n>[:<len>] — шаг 1: текст (<len> символов, по умолчанию короткий)
 *                            + tool_call list_scenarios; первые n запросов шага 2 → 429,
 *                            затем успех
 *   stream_error:<n>       — первые n запросов: текст, затем ошибка внутри 200 SSE
 *   think_marker           — стиль MiniMax: <think> без закрытия, черновик, затем
 *                            строка «### Ответ» и сам ответ
 *   think_nomarker         — <think> без закрытия и БЕЗ маркера (проверка страховки)
 *   think_tool_step        — шаг 1: <think>план + tool_call; шаг 2: черновик + маркер
 *   auth                   — всегда 401
 *   usage                  — всегда 400 "usage limits"
 * GET /__stats → { mode, count, closed, step2Count, log }; closed — соединений,
 * оборванных клиентом до конца ответа.
 */
import http from "node:http";

let mode = "ok";
let count = 0;
let closed = 0;
let step2Count = 0;
let log = [];

function fail(res, status, message, type, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify({ error: { message, type } }));
}

function sseHead(res) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
}
function chunkOf(n, delta, finish = null) {
  return {
    id: "mock-" + n, object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000), model: "mock",
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}
function write(res, obj) {
  if (res.destroyed) return;
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}
function finishStream(res, n) {
  if (res.destroyed) return;
  res.write(`data: ${JSON.stringify({ id: "mock-" + n, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "mock", choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

function streamOk(res, n) {
  if (res.destroyed) return;
  sseHead(res);
  write(res, chunkOf(n, { role: "assistant", content: "" }));
  write(res, chunkOf(n, { content: `Ответ мок-модели №${n}.` }));
  write(res, chunkOf(n, {}, "stop"));
  finishStream(res, n);
}

/** Шаг 1 реального двухшагового прогона: короткий текст + вызов read-only инструмента. */
function streamToolCall(res, n, textLen) {
  if (res.destroyed) return;
  sseHead(res);
  const base = "Сначала посмотрю список сценариев. ";
  const text = textLen > 0 ? base.repeat(Math.ceil(textLen / base.length)).slice(0, textLen) : base.trim();
  write(res, chunkOf(n, { role: "assistant", content: "" }));
  write(res, chunkOf(n, { content: text }));
  write(res, chunkOf(n, {
    tool_calls: [{ index: 0, id: "call_" + n, type: "function", function: { name: "list_scenarios", arguments: "{}" } }],
  }));
  write(res, chunkOf(n, {}, "tool_calls"));
  finishStream(res, n);
}

function streamDrip(res, n, everyMs) {
  if (res.destroyed) return;
  sseHead(res);
  write(res, chunkOf(n, { role: "assistant", content: "" }));
  let i = 0;
  const timer = setInterval(() => {
    if (res.destroyed || i >= Math.ceil(60_000 / everyMs)) {
      clearInterval(timer);
      if (!res.destroyed) { write(res, chunkOf(n, {}, "stop")); finishStream(res, n); }
      return;
    }
    write(res, chunkOf(n, { content: `часть ${++i}… ` }));
  }, everyMs);
  res.on("close", () => clearInterval(timer));
}

/** Отдать готовый текст мелкими чанками — чтобы теги и маркер резались границами дельт. */
function streamChunks(res, n, text, finish = "stop") {
  if (res.destroyed) return;
  sseHead(res);
  write(res, chunkOf(n, { role: "assistant", content: "" }));
  for (const piece of text.match(/[\s\S]{1,7}/g) ?? []) {
    write(res, chunkOf(n, { content: piece }));
  }
  write(res, chunkOf(n, {}, finish));
  finishStream(res, n);
}

/** Шаг 1 двухшагового прогона: черновик в <think> и вызов read-only инструмента. */
function streamThinkToolCall(res, n, text) {
  if (res.destroyed) return;
  sseHead(res);
  write(res, chunkOf(n, { role: "assistant", content: "" }));
  for (const piece of text.match(/[\s\S]{1,7}/g) ?? []) {
    write(res, chunkOf(n, { content: piece }));
  }
  write(res, chunkOf(n, {
    tool_calls: [{ index: 0, id: "call_" + n, type: "function", function: { name: "list_scenarios", arguments: "{}" } }],
  }));
  write(res, chunkOf(n, {}, "tool_calls"));
  finishStream(res, n);
}

const DRAFT = "<think>Let me analyse the request. The user wants a breakdown, so I will check the data first and then summarise.";
const ANSWER = "\n### Ответ\nИтог по данным: всё в норме.";

function streamError(res, n) {
  if (res.destroyed) return;
  sseHead(res);
  write(res, chunkOf(n, { role: "assistant", content: "" }));
  write(res, chunkOf(n, { content: "Начинаю…" }));
  write(res, { error: { message: "rate limit exceeded: too many concurrent requests", type: "rate_limit_error" } });
  res.end();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__control") {
    mode = url.searchParams.get("mode") ?? mode;
    if (url.searchParams.get("reset")) { count = 0; closed = 0; step2Count = 0; log = []; }
    res.end(JSON.stringify({ mode, count }));
    return;
  }
  if (url.pathname === "/__stats") { res.end(JSON.stringify({ mode, count, closed, step2Count, log })); return; }
  if (req.method === "POST" && url.pathname.endsWith("/chat/completions")) {
    res.on("close", () => { if (!res.writableFinished) closed += 1; });
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      count += 1;
      const n = count;
      let msgs = [];
      try { msgs = JSON.parse(body).messages ?? []; } catch { /* не JSON */ }
      const secondStep = msgs.some((m) => m.role === "tool");
      log.push({ n, at: Date.now(), mode, secondStep });
      const [kind, a1, a2] = mode.split(":");
      const n1 = Number(a1 ?? 0);
      if (kind === "concurrent" && n <= n1) return fail(res, 429, "too many concurrent requests", "rate_limit_error");
      if (kind === "ratelimit" && n <= n1) return fail(res, 429, "Rate limit exceeded: 30000 tokens per minute", "rate_limit_error", { "retry-after": String(a2 ?? 0) });
      if (kind === "overloaded" && n <= n1) return fail(res, 529, "Overloaded", "overloaded_error");
      if (kind === "auth") return fail(res, 401, "Invalid API key provided", "authentication_error");
      if (kind === "usage") return fail(res, 400, "You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC.", "invalid_request_error");
      if (kind === "fail_step2") {
        if (!secondStep) return streamToolCall(res, n, Number(a2 ?? 0));
        step2Count += 1;
        if (step2Count <= n1) return fail(res, 429, "too many concurrent requests", "rate_limit_error");
        return streamOk(res, n);
      }
      if (kind === "stream_error" && n <= n1) return streamError(res, n);
      if (kind === "think_marker") return streamChunks(res, n, DRAFT + ANSWER);
      if (kind === "think_nomarker") return streamChunks(res, n, DRAFT);
      if (kind === "think_tool_step") {
        if (!secondStep) return streamThinkToolCall(res, n, "<think>Plan: I should call the scenarios tool first.");
        return streamChunks(res, n, DRAFT + ANSWER);
      }
      if (kind === "drip") return streamDrip(res, n, Math.max(20, n1));
      const delay = kind === "slow" ? n1 : 0;
      setTimeout(() => streamOk(res, n), delay);
    });
    return;
  }
  res.writeHead(404); res.end("not found");
});
server.listen(8089, "127.0.0.1", () => console.log("mock-llm listening on http://127.0.0.1:8089"));
