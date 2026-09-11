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
import { getRunQueueSnapshot } from "@/lib/ai/run-queue";

const MOCK = "http://127.0.0.1:8089";
type Preset = { maxRetries?: number; retryDelaySec?: number; maxConcurrentRuns?: number; queueTimeoutSec?: number };

async function control(mode: string) { await fetch(`${MOCK}/__control?mode=${encodeURIComponent(mode)}&reset=1`); }
async function stats(): Promise<{ count: number; closed: number; step2Count: number }> { return (await fetch(`${MOCK}/__stats`)).json(); }

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

interface RunResult { events: string[]; done: string | null; error: string | null; ms: number; text: string; aborted: boolean; abortedSteps: number | null; replaced: string | null }
async function run(opts: { signal?: AbortSignal } = {}): Promise<RunResult> {
  const events: string[] = []; let done: string | null = null; let error: string | null = null;
  let text = ""; let aborted = false; let abortedSteps: number | null = null; let replaced: string | null = null;
  const t0 = Date.now();
  await runChat([{ role: "user", content: "привет" }], scenarioId, scenarioName, {
    onText: (t) => { text += t; }, onToolCall: () => {}, onProgress: () => {}, onMeta: () => {},
    onStatus: (phase, detail) => events.push(`${phase}${detail ? ": " + detail : ""}`),
    onDone: (t) => { done = t; },
    onError: (e) => { error = e.message; },
    onAbort: (p) => { aborted = true; abortedSteps = p.steps; },
    onReplace: (t) => { replaced = t; text = t; },
  }, { signal: opts.signal });
  return { events, done, error, ms: Date.now() - t0, text, aborted, abortedSteps, replaced };
}
const abortAfter = (ms: number) => { const ac = new AbortController(); setTimeout(() => ac.abort(), ms); return ac.signal; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
function check(name: string, cond: boolean, info = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${info ? "  (" + info + ")" : ""}`);
  if (!cond) failed += 1;
}
function show(r: RunResult) {
  for (const e of r.events) if (!e.startsWith("llm_thinking") && !e.startsWith("streaming")) console.log("    status:", e);
  const verdict = r.done != null ? `DONE «${r.done.slice(0, 60)}»` : r.aborted ? `ABORTED (шагов ${r.abortedSteps}, текста ${r.text.length})` : `ERROR «${r.error}»`;
  console.log("    result:", verdict, `за ${(r.ms / 1000).toFixed(1)} с`);
}

async function main() {
  await ensureScenario();
  const quiet = ["log"] as const; // подавляем шум [AI_RUN]/[AI_STEP]
  const origLog = console.log;
  const keep = (...a: unknown[]) => { const s = String(a[0] ?? ""); if (s.startsWith("[AI_RETRY") || s.startsWith("[AI_QUEUE]") || s.startsWith("[AI_ABORT]") || s.startsWith("[AI_LANG]") || !s.startsWith("[AI_")) origLog(...a); };
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

  origLog("\n### 11. 429 на шаге 2 при коротком тексте шага 1 — повтор с пометкой");
  await setPreset({ maxRetries: 3, retryDelaySec: 2, maxConcurrentRuns: 1, queueTimeoutSec: 30 }); await control("fail_step2:1");
  r = await run(); show(r); st = await stats();
  check("ответ доведён до конца", r.done != null);
  check("4 HTTP-запроса (шаг1, шаг2-429, шаг1 из кэша, шаг2)", st.count === 4, `count=${st.count}`);
  check("в тексте пометка о повторе с причиной", r.text.includes("Повтор из-за ошибки провайдера") && r.text.includes("занят слот шлюза"));
  check("ровно один retry_wait", r.events.filter((e) => e.startsWith("retry_wait")).length === 1);
  check("слот освобождён", getRunQueueSnapshot().active === 0);

  origLog("\n### 12. То же при maxRetries=0 — без повтора");
  await setPreset({ maxRetries: 0, retryDelaySec: 2 }); await control("fail_step2:1");
  r = await run(); show(r); st = await stats();
  check("ошибка, 2 запроса, без пометки", r.error != null && st.count === 2 && !r.text.includes("Повтор"), `count=${st.count}`);

  origLog("\n### 13. Отмена во время запроса к провайдеру (ответ через 5 с, отмена через 0.5 с)");
  await setPreset({ maxRetries: 3, retryDelaySec: 2, maxConcurrentRuns: 1, queueTimeoutSec: 30 }); await control("slow:5000");
  r = await run({ signal: abortAfter(500) }); show(r); st = await stats();
  check("onAbort вызван, done/error нет", r.aborted && r.done == null && r.error == null);
  check("прогон завершился быстро (< 2 с)", r.ms < 2000, `${(r.ms / 1000).toFixed(1)} с`);
  check("слот освобождён сразу", getRunQueueSnapshot().active === 0 && getRunQueueSnapshot().waiting === 0);
  check("мок увидел обрыв соединения", st.closed >= 1, `closed=${st.closed}`);
  await control("ok"); r = await run(); show(r);
  check("следующий прогон стартует без queue_wait", r.done != null && !r.events.some((e) => e.startsWith("queue_wait")));

  origLog("\n### 14. Отмена посреди стрима (текст каждые 200 мс, отмена через 1 с)");
  await control("drip:200");
  r = await run({ signal: abortAfter(1000) }); show(r);
  check("aborted, частичный текст сохранён", r.aborted && r.text.length > 0, `${r.text.length} символов`);
  check("вернулся быстро (< 2.5 с)", r.ms < 2500, `${(r.ms / 1000).toFixed(1)} с`);
  check("слот освобождён", getRunQueueSnapshot().active === 0);

  origLog("\n### 15. Отмена во время ожидания в очереди");
  await control("slow:4000");
  // Первый занимает слот, второй стартует позже и точно попадает в очередь.
  const pa = run(); await sleep(300);
  const pb = run({ signal: abortAfter(500) });
  const [qa, qb] = await Promise.all([pa, pb]);
  origLog("  первый:"); show(qa); origLog("  второй:"); show(qb); st = await stats();
  check("второй стоял в очереди", qb.events.some((e) => e.startsWith("queue_wait")));
  check("ждавший отменён быстро (< 1.5 с)", qb.aborted && qb.ms < 1500, `${(qb.ms / 1000).toFixed(1)} с`);
  check("первый завершился, к провайдеру 1 запрос", qa.done != null && st.count === 1, `count=${st.count}`);

  origLog("\n### 16. Отмена во время паузы повтора (пауза 10 с, отмена через 1 с)");
  await setPreset({ maxRetries: 3, retryDelaySec: 10 }); await control("concurrent:99");
  r = await run({ signal: abortAfter(1000) }); show(r); st = await stats();
  check("сон прерван, aborted за < 1.6 с", r.aborted && r.ms < 1600, `${(r.ms / 1000).toFixed(1)} с`);
  check("1 запрос к провайдеру", st.count === 1, `count=${st.count}`);
  check("слот освобождён", getRunQueueSnapshot().active === 0);

  origLog("\n### 17. 429 на шаге 2 при длинном тексте шага 1 (400 символов) — без повтора");
  await setPreset({ maxRetries: 3, retryDelaySec: 2 }); await control("fail_step2:1:400");
  r = await run(); show(r); st = await stats();
  check("ошибка обрыва, 2 запроса, без retry_wait", r.error != null && st.count === 2 && !r.events.some((e) => e.startsWith("retry_wait")), `count=${st.count}`);
  check("текст без пометки о повторе", !r.text.includes("Повтор из-за"));

  origLog("\n### 18. Ошибка внутри 200 SSE (finish: error) на шаге 1 — повтор");
  await setPreset({ maxRetries: 3, retryDelaySec: 1 }); await control("stream_error:1");
  r = await run(); show(r); st = await stats();
  check("повтор и успех, 2 запроса", r.done != null && st.count === 2, `count=${st.count}`);

  origLog("\n### 19. Рассуждения MiniMax: <think> без закрытия + маркер «### Ответ»");
  await setPreset({ maxRetries: 3, retryDelaySec: 2, maxConcurrentRuns: 1, queueTimeoutSec: 30 }); await control("think_marker");
  r = await run(); show(r);
  check("черновик и тег скрыты", !r.text.includes("<think>") && !r.text.includes("Let me analyse"), JSON.stringify(r.text.slice(0, 60)));
  check("строка-маркер в ответ не попала", !r.text.includes("### Ответ") && !r.text.includes("Ответ\n"), JSON.stringify(r.text.slice(0, 40)));
  check("ответ показан целиком", r.text.trim() === "Итог по данным: всё в норме." && r.done != null, JSON.stringify(r.text));
  check("была фаза «Модель рассуждает»", r.events.some((e) => e.startsWith("llm_reasoning")));

  origLog("\n### 20. Страховка: <think> без закрытия и без маркера — показываем всё");
  await control("think_nomarker");
  r = await run(); show(r);
  check("черновик показан (ответ не потерян)", r.text.includes("Let me analyse") && r.done != null, JSON.stringify(r.text.slice(0, 50)));
  check("сам тег <think> убран", !r.text.includes("<think>"));

  origLog("\n### 21. Двухшаговый прогон: текст планирующего шага отброшен");
  await control("think_tool_step");
  r = await run(); show(r); st = await stats();
  check("план шага 1 не показан", !r.text.includes("Plan: I should call"), JSON.stringify(r.text.slice(0, 60)));
  check("виден только итог финального шага", r.text.trim() === "Итог по данным: всё в норме.", JSON.stringify(r.text));
  check("прогон дошёл до конца за 2 запроса", r.done != null && st.count === 2, `count=${st.count}`);

  origLog("\n### 22. Иероглиф в ответе → автопочинка одним вызовом без инструментов");
  await setPreset({ maxRetries: 3, retryDelaySec: 2, maxConcurrentRuns: 1, queueTimeoutSec: 30 }); await control("cjk_leak");
  r = await run(); show(r); st = await stats();
  check("итоговый текст без иероглифов", !/[\u4E00-\u9FFF]/.test(r.text) && r.text.includes("управленческого слоя"), JSON.stringify(r.text.slice(0, 70)));
  check("событие replace пришло и done совпадает с исправленным", r.replaced != null && r.done === r.replaced);
  check("ровно 2 запроса: ответ + починка", st.count === 2, `count=${st.count}`);
  check("числа сохранены", r.text.includes("4.2") && r.text.includes("29%") && r.text.includes("30–40"));

  origLog("\n### 23. Отмена во время ответа с иероглифом → починка не запускается");
  await control("cjk_leak:1000");
  r = await run({ signal: abortAfter(150) }); show(r); st = await stats();
  check("aborted, починки не было (1 запрос)", r.aborted && st.count === 1 && r.replaced == null, `count=${st.count}`);

  console.log = origLog;
  await prisma.llmSetting.deleteMany({ where: { name: "__mock" } });
  await prisma.$disconnect();
  origLog(`\n=== ИТОГ: ${failed === 0 ? "все проверки пройдены" : failed + " проверок провалено"} ===`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
