/*
 * Интеграционная проверка повторов и очереди: настоящий AI SDK и оркестратор
 * против мок-провайдера (mock-llm.mjs должен быть запущен).
 *
 * Требует БД: создаёт временный активный пресет «__mock» (удаляется в конце)
 * и, если сценариев нет, сценарий «__test». Не запускать на боевой БД.
 *
 * Запуск из корня репозитория:
 *   set -a; . ./.env; set +a
 *   npx tsx scripts/ai-retry-check/retry-test.ts
 */
import { prisma } from "@/lib/db";
import { runChat } from "@/lib/ai/orchestrator";

const MOCK = "http://127.0.0.1:8089";
type Preset = { maxRetries?: number; retryDelaySec?: number; maxConcurrentRuns?: number; queueTimeoutSec?: number };

async function control(mode: string) { await fetch(`${MOCK}/__control?mode=${encodeURIComponent(mode)}&reset=1`); }
async function stats(): Promise<{ count: number }> { return (await fetch(`${MOCK}/__stats`)).json(); }

async function setPreset(p: Preset) {
  await prisma.llmSetting.updateMany({ data: { isActive: false } });
  const data = {
    name: "__mock", provider: "openai_compatible", baseUrl: `${MOCK}/v1`, apiKey: "test", model: "mock",
    timeoutSec: 60, isActive: true,
    maxRetries: p.maxRetries ?? 3, retryDelaySec: p.retryDelaySec ?? 2,
    maxConcurrentRuns: p.maxConcurrentRuns ?? 1, queueTimeoutSec: p.queueTimeoutSec ?? 30,
  };
  const existing = await prisma.llmSetting.findFirst({ where: { name: "__mock" } });
  if (existing) await prisma.llmSetting.update({ where: { id: existing.id }, data });
  else await prisma.llmSetting.create({ data });
}

let scenarioId = ""; let scenarioName = "";
async function ensureScenario() {
  let s = await prisma.scenario.findFirst();
  if (!s) s = await prisma.scenario.create({ data: { name: "__test", isBaseline: true } });
  scenarioId = s.id; scenarioName = s.name;
}

interface RunResult { events: string[]; done: string | null; error: string | null; ms: number }
async function run(): Promise<RunResult> {
  const events: string[] = []; let done: string | null = null; let error: string | null = null;
  const t0 = Date.now();
  await runChat([{ role: "user", content: "привет" }], scenarioId, scenarioName, {
    onText: () => {}, onToolCall: () => {}, onProgress: () => {}, onMeta: () => {},
    onStatus: (phase, detail) => events.push(`${phase}${detail ? ": " + detail : ""}`),
    onDone: (text) => { done = text; },
    onError: (e) => { error = e.message; },
  });
  return { events, done, error, ms: Date.now() - t0 };
}

let failed = 0;
function check(name: string, cond: boolean, info = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${info ? "  (" + info + ")" : ""}`);
  if (!cond) failed += 1;
}
function show(r: RunResult) {
  for (const e of r.events) if (!e.startsWith("llm_thinking") && !e.startsWith("streaming")) console.log("    status:", e);
  console.log("    result:", r.done != null ? `DONE «${r.done}»` : `ERROR «${r.error}»`, `за ${(r.ms / 1000).toFixed(1)} с`);
}

async function main() {
  await ensureScenario();
  const quiet = ["log"] as const; // подавляем шум [AI_RUN]/[AI_STEP]
  const origLog = console.log;
  const keep = (...a: unknown[]) => { const s = String(a[0] ?? ""); if (s.startsWith("[AI_RETRY]") || s.startsWith("[AI_QUEUE]") || !s.startsWith("[AI_")) origLog(...a); };
  console.log = keep; void quiet;

  origLog("\n### 1. Слот шлюза: первые 2 запроса 429 concurrent, maxRetries=3, пауза 2 с");
  await setPreset({ maxRetries: 3, retryDelaySec: 2 }); await control("concurrent:2");
  let r = await run(); show(r); let st = await stats();
  check("ответ получен", r.done != null);
  check("ровно 3 HTTP-запроса (SDK-повторы выключены)", st.count === 3, `count=${st.count}`);
  check("два retry_wait с «попытка 1 из 3» и «попытка 2 из 3»",
    r.events.filter((e) => e.startsWith("retry_wait")).length === 2 && r.events.some((e) => e.includes("попытка 2 из 3")));
  check("в баннере причина «занят слот шлюза»", r.events.some((e) => e.includes("занят слот шлюза")));

  origLog("\n### 2. Обычный 429 rate limit с Retry-After: 4 при паузе 2 с");
  await setPreset({ maxRetries: 3, retryDelaySec: 2 }); await control("ratelimit:1:4");
  r = await run(); show(r); st = await stats();
  check("ответ получен после одного повтора", r.done != null && st.count === 2, `count=${st.count}`);
  check("пауза взята из Retry-After (≈4 с, не 2)", r.ms >= 4000 && r.ms < 8000, `${(r.ms / 1000).toFixed(1)} с`);
  check("причина «429, лимит запросов», «повтор через 4 с»", r.events.some((e) => e.includes("лимит запросов") && e.includes("через 4 с")));

  origLog("\n### 3. 529 overloaded один раз");
  await setPreset({ maxRetries: 3, retryDelaySec: 2 }); await control("overloaded:1");
  r = await run(); show(r); st = await stats();
  check("повтор и успех", r.done != null && st.count === 2, `count=${st.count}`);

  origLog("\n### 4. 401 — без повторов");
  await setPreset({ maxRetries: 3, retryDelaySec: 2 }); await control("auth");
  r = await run(); show(r); st = await stats();
  check("ошибка сразу, 1 запрос", r.error != null && st.count === 1, `count=${st.count}`);
  check("текст про аутентификацию", (r.error ?? "").includes("аутентификации"));

  origLog("\n### 5. Месячный usage limit — без повторов");
  await setPreset({ maxRetries: 3, retryDelaySec: 2 }); await control("usage");
  r = await run(); show(r); st = await stats();
  check("ошибка сразу, 1 запрос", r.error != null && st.count === 1, `count=${st.count}`);
  check("текст про лимит API с датой", (r.error ?? "").includes("лимит API") && (r.error ?? "").includes("2026-10-01"));

  origLog("\n### 6. maxRetries=0 — первый 429 сразу ошибка");
  await setPreset({ maxRetries: 0, retryDelaySec: 2 }); await control("concurrent:5");
  r = await run(); show(r); st = await stats();
  check("ошибка без повторов, 1 запрос", r.error != null && st.count === 1 && !r.events.some((e) => e.startsWith("retry_wait")), `count=${st.count}`);

  origLog("\n### 7. Исчерпание повторов: 429 постоянно, maxRetries=2");
  await setPreset({ maxRetries: 2, retryDelaySec: 1 }); await control("concurrent:99");
  r = await run(); show(r); st = await stats();
  check("3 запроса (1 + 2 повтора), затем ошибка", r.error != null && st.count === 3, `count=${st.count}`);

  origLog("\n### 8. Очередь: maxConcurrentRuns=1, два прогона одновременно (ответ через 3 с)");
  await setPreset({ maxConcurrentRuns: 1, queueTimeoutSec: 30 }); await control("slow:3000");
  const [a, b] = await Promise.all([run(), run()]);
  origLog("  первый:"); show(a); origLog("  второй:"); show(b); st = await stats();
  const queued = [a, b].filter((x) => x.events.some((e) => e.startsWith("queue_wait")));
  check("оба завершились успешно", a.done != null && b.done != null);
  check("ровно один ждал в очереди с позицией 1", queued.length === 1 && queued[0].events.some((e) => e.includes("позиция 1")));
  check("второй стартовал после первого (≥ 6 с суммарно у ждавшего)", Math.max(a.ms, b.ms) >= 6000, `${(Math.max(a.ms, b.ms) / 1000).toFixed(1)} с`);
  check("2 запроса к провайдеру", st.count === 2, `count=${st.count}`);

  origLog("\n### 9. Очередь: таймаут ожидания 2 с при занятом слоте 5 с");
  await setPreset({ maxConcurrentRuns: 1, queueTimeoutSec: 2 }); await control("slow:5000");
  const [c, d] = await Promise.all([run(), run()]);
  origLog("  первый:"); show(c); origLog("  второй:"); show(d); st = await stats();
  const timedOut = [c, d].find((x) => x.error?.includes("превышено время ожидания"));
  check("один прогон получил ошибку очереди", !!timedOut);
  check("другой завершился успешно", [c, d].some((x) => x.done != null));
  check("к провайдеру ушёл 1 запрос", st.count === 1, `count=${st.count}`);

  origLog("\n### 10. После ошибки очереди слот не утёк: новый прогон проходит сразу");
  await setPreset({ maxConcurrentRuns: 1, queueTimeoutSec: 30 }); await control("ok");
  r = await run(); show(r);
  check("успех без queue_wait", r.done != null && !r.events.some((e) => e.startsWith("queue_wait")));

  console.log = origLog;
  await prisma.llmSetting.deleteMany({ where: { name: "__mock" } });
  await prisma.$disconnect();
  origLog(`\n=== ИТОГ: ${failed === 0 ? "все проверки пройдены" : failed + " проверок провалено"} ===`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
