/*
 * Мок OpenAI-совместимого провайдера для проверки повторов и очереди AI-чата
 * (задача 0.3 в docs/IMPLEMENTATION-PLAN.md).
 *
 * Запуск:  node scripts/ai-retry-check/mock-llm.mjs   (слушает 127.0.0.1:8089)
 * Затем в другом терминале — retry-test.ts, либо вручную: создать в
 * «Настройки → LLM» пресет openai_compatible с base URL http://127.0.0.1:8089/v1
 * и переключать режимы: curl "http://127.0.0.1:8089/__control?mode=concurrent:2&reset=1"
 */
// Мок OpenAI-совместимого провайдера для проверки повторов и очереди.
// Режимы переключаются на лету: GET /__control?mode=<mode>&reset=1
//   ok                 — сразу успешный стрим
//   slow:<ms>          — успешный стрим через <ms>
//   concurrent:<n>     — первые n запросов: 429 "too many concurrent requests"
//   ratelimit:<n>:<ra> — первые n запросов: 429 rate limit + Retry-After: <ra> с
//   overloaded:<n>     — первые n запросов: 529 overloaded
//   auth               — всегда 401
//   usage              — всегда 400 "usage limits"
import http from "node:http";

let mode = "ok";
let count = 0;
let log = [];

function fail(res, status, message, type, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify({ error: { message, type } }));
}

function streamOk(res, n) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  const base = { id: "mock-" + n, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "mock" };
  const chunk = (delta, finish = null) =>
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  chunk({ role: "assistant", content: "" });
  chunk({ content: `Ответ мок-модели №${n}.` });
  chunk({}, "stop");
  res.write(`data: ${JSON.stringify({ ...base, choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__control") {
    mode = url.searchParams.get("mode") ?? mode;
    if (url.searchParams.get("reset")) { count = 0; log = []; }
    res.end(JSON.stringify({ mode, count }));
    return;
  }
  if (url.pathname === "/__stats") { res.end(JSON.stringify({ mode, count, log })); return; }
  if (req.method === "POST" && url.pathname.endsWith("/chat/completions")) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      count += 1;
      const n = count;
      log.push({ n, at: Date.now(), mode });
      const [kind, a1, a2] = mode.split(":");
      const n1 = Number(a1 ?? 0);
      if (kind === "concurrent" && n <= n1) return fail(res, 429, "too many concurrent requests", "rate_limit_error");
      if (kind === "ratelimit" && n <= n1) return fail(res, 429, "Rate limit exceeded: 30000 tokens per minute", "rate_limit_error", { "retry-after": String(a2 ?? 0) });
      if (kind === "overloaded" && n <= n1) return fail(res, 529, "Overloaded", "overloaded_error");
      if (kind === "auth") return fail(res, 401, "Invalid API key provided", "authentication_error");
      if (kind === "usage") return fail(res, 400, "You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC.", "invalid_request_error");
      const delay = kind === "slow" ? n1 : 0;
      setTimeout(() => streamOk(res, n), delay);
    });
    return;
  }
  res.writeHead(404); res.end("not found");
});
server.listen(8089, "127.0.0.1", () => console.log("mock-llm listening on http://127.0.0.1:8089"));
