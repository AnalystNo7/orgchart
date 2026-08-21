import { streamText, stepCountIs } from "ai";
import { getLlm } from "./provider";
import { buildTools, createToolRunStats, type ToolRunStats } from "./tools";
import { getSystemPrompt } from "./system-prompt";
import {
  AI_CHUNK_TIMEOUT_MS,
  AI_DEFAULT_TOTAL_TIMEOUT_MS,
  AI_LOOP_SAFETY_MS,
  AI_MAX_STEPS,
  AI_ROUTE_MAX_DURATION_SEC,
  AI_STEP_TIMEOUT_MS,
} from "./limits";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolCallInfo {
  name: string;
  input: Record<string, unknown>;
  result: string;
}

export interface StreamCallbacks {
  onText: (text: string) => void;
  onToolCall: (info: ToolCallInfo) => void;
  onStatus: (phase: string, detail?: string) => void;
  onProgress: (toolName: string, step: string) => void;
  onDone: (fullResponse: string, toolCalls: ToolCallInfo[]) => void;
  onError: (error: Error, partial: PartialRun) => void;
  onMeta: (meta: RunMeta) => void;
}

/**
 * Run metadata for the live status indicator: the client cannot know the
 * budget or the current step on its own — only this side does.
 */
export type RunMeta =
  | { type: "budget"; totalMs: number; maxSteps: number }
  | { type: "step_start"; step: number; inputKb: number };

/** What a turn managed to produce before it was aborted. */
export interface PartialRun {
  /** Text the model emitted across completed steps (already streamed to the UI). */
  text: string;
  /** Tools that ran, in order. */
  toolNames: string[];
  /** Steps that completed. */
  steps: number;
}

/**
 * Run a conversation turn with the configured LLM provider,
 * handling tool use loops. Reports progress via callbacks.
 */
export async function runChat(
  messages: ChatMessage[],
  scenarioId: string,
  scenarioName: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  const { prompt: systemPrompt, isCustom: promptIsCustom } =
    await getSystemPrompt(scenarioName);
  const allToolCalls: ToolCallInfo[] = [];

  const onToolProgress = (toolName: string, step: string) => {
    callbacks.onProgress(toolName, step);
  };

  // Resolve the LLM first: the tool-result cap comes from the active preset.
  const { model, settings, info } = await getLlm();
  const toolStats = createToolRunStats();
  const tools = buildTools(
    scenarioId,
    onToolProgress,
    settings.toolResultMaxBytes,
    toolStats,
  );

  // Total budget: the preset's timeoutSec, or a generous default. The clamp
  // below the platform's maxDuration applies ONLY on Vercel — locally there is
  // no platform limit, and a self-imposed 280s ceiling was exactly what kept
  // killing long reasoning runs.
  let totalMs = settings.timeoutMs ?? AI_DEFAULT_TOTAL_TIMEOUT_MS;
  let vercelClamped = false;
  if (process.env.VERCEL) {
    const platformBudget = AI_ROUTE_MAX_DURATION_SEC * 1000 - AI_LOOP_SAFETY_MS;
    if (totalMs > platformBudget) {
      totalMs = platformBudget;
      vercelClamped = true;
      console.log(
        `[AI_LIMIT] timeout урезан до ${sec(platformBudget)}s` +
          ` (Vercel maxDuration ${AI_ROUTE_MAX_DURATION_SEC}s − запас ${sec(AI_LOOP_SAFETY_MS)}s)`,
      );
    }
  }
  const stepMs = Math.min(AI_STEP_TIMEOUT_MS, totalMs);

  // Who is actually answering and under what caps. maxOutputTokens is nullable
  // in the preset, and an absent cap is a different thing from an unknown one —
  // for a reasoning model it means nothing bounds the generation.
  console.log(
    `[AI_RUN] ${info.source === "preset" ? `пресет "${info.name}"` : "env-конфигурация"}` +
      ` · ${info.provider} · ${info.model}` +
      ` · maxOutputTokens=${settings.maxOutputTokens ?? "НЕ ЗАДАН"}` +
      ` · temperature=${settings.temperature ?? "по умолчанию"}` +
      ` · timeout total ${sec(totalMs)}s / step ${sec(stepMs)}s / chunk ${sec(AI_CHUNK_TIMEOUT_MS)}s${vercelClamped ? " (Vercel clamp)" : ""}` +
      ` · tool-cap ${settings.toolResultMaxBytes ?? "по умолчанию"}` +
      ` · инструментов ${Object.keys(tools).length}` +
      ` · промпт ${promptIsCustom ? "изменён" : "стандартный"}`,
  );

  // Step timing: the gaps between steps are the model's own latency, which
  // is what a whole-loop timeout usually burns through.
  const runStartedAt = Date.now();
  let stepNo = 0;
  let firstStepMs = 0;
  // A step that never finishes leaves no [AI_STEP] line at all, so the only
  // way to name the culprit on abort is to record it when it starts.
  let inFlightStep = 0;
  let inFlightStartedAt = 0;
  let inFlightInputBytes = 0;
  let partialText = "";

  // Warn the user a minute before the total budget runs out. Lives here (not
  // in the route) because only this side knows the actual budget.
  const warnTimer =
    totalMs > 120_000
      ? setTimeout(
          () => callbacks.onStatus("timeout_warning"),
          totalMs - 60_000,
        )
      : null;

  // With streaming, the underlying failure (429, network…) is delivered to
  // the onError callback, while the iteration throws a NoOutputGeneratedError
  // wrapper — mapping errors off the caught object alone is blind.
  let lastStreamError: unknown;
  // Age of the last sign of life from the provider: tells a chunk-timeout
  // stall apart from an exhausted total budget in the finish handling.
  let lastActivityAt = Date.now();

  // Gonka rejects a new request while an aborted one still holds its slot
  // ("too many concurrent requests"); the slot frees in tens of seconds, so
  // the SDK's fast built-in retries (3 attempts in ~7s) never make it.
  const MAX_CONCURRENT_RETRIES = 3;
  const CONCURRENT_RETRY_DELAY_MS = 20_000;

  for (let attempt = 0; ; attempt++) {
    lastStreamError = undefined;
    stepNo = 0;
    firstStepMs = 0;
    inFlightStep = 0;
    inFlightStartedAt = 0;
    inFlightInputBytes = 0;
    lastActivityAt = Date.now();

    try {
      callbacks.onMeta({ type: "budget", totalMs, maxSteps: AI_MAX_STEPS });
      callbacks.onStatus("llm_thinking");

      const result = streamText({
        model,
        temperature: settings.temperature,
        maxOutputTokens: settings.maxOutputTokens,
        timeout: {
          totalMs,
          stepMs,
          chunkMs: AI_CHUNK_TIMEOUT_MS,
        },
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools,
        stopWhen: stepCountIs(AI_MAX_STEPS),
        onError: ({ error }) => {
          lastStreamError = error;
          console.error(
            "[AI_STREAM_ERROR]",
            error instanceof Error ? error.message : error,
          );
        },
        experimental_onStepStart: ({ stepNumber, messages: stepMessages }) => {
          // Streamed deltas of consecutive steps would otherwise concatenate
          // into one paragraph.
          if (partialText && !partialText.endsWith("\n\n")) {
            partialText += "\n\n";
            callbacks.onText("\n\n");
          }
          inFlightStep = stepNumber + 1;
          inFlightStartedAt = Date.now();
          lastActivityAt = Date.now();
          inFlightInputBytes = Buffer.byteLength(
            JSON.stringify(stepMessages),
            "utf8",
          );
          console.log(
            `[AI_STEP_START] #${inFlightStep} +${sec(inFlightStartedAt - runStartedAt)}s` +
              ` · сообщений ${stepMessages.length}` +
              ` · вход ~${kb(inFlightInputBytes)} КБ`,
          );
          callbacks.onMeta({
            type: "step_start",
            step: inFlightStep,
            inputKb: Math.round(inFlightInputBytes / 1024),
          });
        },
        onStepFinish: ({ text, toolCalls, toolResults }) => {
          lastActivityAt = Date.now();
          stepNo += 1;
          if (stepNo === 1) firstStepMs = Date.now() - runStartedAt;
          console.log(
            `[AI_STEP] #${stepNo} +${Date.now() - runStartedAt}ms` +
              `, tools: ${toolCalls?.map((t) => t.toolName).join(", ") || "—"}` +
              `, text: ${text ? text.length : 0} chars`,
          );
          // Text is NOT sent from here any more — it already went out as
          // stream deltas; re-sending would duplicate every step's text.
          if (toolCalls && toolCalls.length > 0) {
            for (let i = 0; i < toolCalls.length; i++) {
              const tc = toolCalls[i];
              const tr = toolResults?.[i] as
                | Record<string, unknown>
                | undefined;
              const tcAny = tc as Record<string, unknown>;
              const toolInput = tcAny.input ?? tcAny.args ?? {};
              const trResult = tr?.result;
              const info: ToolCallInfo = {
                name: tc.toolName,
                input: toolInput as Record<string, unknown>,
                result:
                  typeof trResult === "string"
                    ? trResult
                    : JSON.stringify(trResult ?? ""),
              };
              allToolCalls.push(info);
              callbacks.onStatus("tool_completed", tc.toolName);
              callbacks.onToolCall(info);
            }
            callbacks.onStatus("llm_analyzing");
          }
        },
      });

      // Drive the stream: deltas reach the user the moment the model emits them,
      // and whatever is on screen at an abort is exactly what partialText holds.
      for await (const delta of result.textStream) {
        if (delta) {
          lastActivityAt = Date.now();
          partialText += delta;
          callbacks.onText(delta);
        }
      }

      const finishReason = await result.finishReason;
      logRunSummary(
        Date.now() - runStartedAt,
        stepNo,
        firstStepMs,
        toolStats,
        await result.totalUsage,
        finishReason,
      );

      if (warnTimer) clearTimeout(warnTimer);

      // A stream timeout does NOT throw — the stream just ends with
      // finish: "other". Anything but a clean "stop" is an interrupted answer
      // and must look like one, not like a finished report cut mid-sentence.
      if (finishReason !== "stop") {
        const silenceMs = Date.now() - lastActivityAt;
        console.log(
          `[AI_INCOMPLETE] finish: ${finishReason} → оформлен как обрыв` +
            ` (тишина ${sec(silenceMs)}s)`,
        );
        callbacks.onError(new Error(finishMessage(finishReason, silenceMs)), {
          text: partialText,
          toolNames: allToolCalls.map((t) => t.name),
          steps: stepNo,
        });
        return;
      }

      callbacks.onDone(partialText, allToolCalls);
      return;
    } catch (error) {
      const realError = pickRealError(error, lastStreamError);

      // The gateway slot held by an aborted request frees up in tens of
      // seconds — retry with real pauses, but only while nothing has been
      // shown to the user yet (a retry would restart the answer from scratch).
      if (
        isConcurrentLimitError(realError) &&
        partialText === "" &&
        attempt < MAX_CONCURRENT_RETRIES
      ) {
        console.log(
          `[AI_RETRY] 429 (concurrent) — попытка ${attempt + 1} из ${MAX_CONCURRENT_RETRIES},` +
            ` пауза ${sec(CONCURRENT_RETRY_DELAY_MS)}s`,
        );
        callbacks.onStatus(
          "retry_wait",
          `Провайдер занят (429) — жду свободный слот, попытка ${attempt + 1} из ${MAX_CONCURRENT_RETRIES}…`,
        );
        await new Promise((r) => setTimeout(r, CONCURRENT_RETRY_DELAY_MS));
        continue;
      }

      if (warnTimer) clearTimeout(warnTimer);
      const elapsed = Date.now() - runStartedAt;
      // inFlightStep > stepNo means that step started and never finished — that
      // is the one that hung, and the log below is the only place it is named.
      const hung =
        inFlightStep > stepNo
          ? ` · шаг #${inFlightStep} висел ${sec(Date.now() - inFlightStartedAt)}s` +
            ` (вход ~${kb(inFlightInputBytes)} КБ)`
          : "";
      console.error(
        `[AI_CHAT_ERROR] ${sec(elapsed)}s, ${stepNo} шаг(ов)` +
          ` · инструменты ${sec(toolStats.totalMs)}s (${formatToolCalls(toolStats)})` +
          ` · модель ~${sec(Math.max(0, elapsed - toolStats.totalMs))}s` +
          hung,
        realError,
      );
      callbacks.onError(new Error(formatAIError(realError)), {
        text: partialText,
        toolNames: allToolCalls.map((t) => t.name),
        steps: stepNo,
      });
      return;
    }
  }
}

/**
 * The error worth reporting: streaming surfaces the underlying failure only
 * via the onError callback, while iteration throws a generic
 * NoOutputGeneratedError wrapper.
 */
function pickRealError(caught: unknown, streamError: unknown): unknown {
  const msg = caught instanceof Error ? caught.message : String(caught);
  if (streamError !== undefined && msg.includes("No output generated")) {
    return streamError;
  }
  return caught;
}

/** Gonka's "slot is still busy" rejection — retryable with a real pause. */
function isConcurrentLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("too many concurrent requests");
}

/** ms → seconds with one decimal, for log readability. */
function sec(ms: number): string {
  return (ms / 1000).toFixed(1);
}

/** Bytes of tool output are what the context budget guards — show them. */
function formatToolCalls(stats: ToolRunStats): string {
  return (
    `${stats.calls} вызов(ов), ${stats.cached} из кэша, ` +
    `${(stats.bytesOut / 1024).toFixed(1)} КБ`
  );
}

/** bytes → KB with one decimal. */
function kb(bytes: number): string {
  return (bytes / 1024).toFixed(1);
}

function tok(n: number | undefined): string {
  return n === undefined ? "н/д" : String(n);
}

/**
 * One-line summary of a finished chat turn: where the wall-clock went
 * (model vs tools), token usage and why generation stopped.
 * Providers behind OpenAI-compatible gateways may omit usage — hence "н/д".
 */
function logRunSummary(
  elapsedMs: number,
  steps: number,
  firstStepMs: number,
  toolStats: ToolRunStats,
  usage:
    | {
        inputTokens?: number;
        outputTokens?: number;
        reasoningTokens?: number;
        cachedInputTokens?: number;
      }
    | undefined,
  finishReason: string,
): void {
  const modelMs = Math.max(0, elapsedMs - toolStats.totalMs);
  console.log(
    `[AI_DONE] ${steps} шаг(ов) · ${sec(elapsedMs)}s ` +
      `(модель ${sec(modelMs)}s / инструменты ${sec(toolStats.totalMs)}s, ${formatToolCalls(toolStats)})` +
      ` · токены ${tok(usage?.inputTokens)} in + ${tok(usage?.outputTokens)} out` +
      ` (reasoning ${tok(usage?.reasoningTokens)}, cached ${tok(usage?.cachedInputTokens)})` +
      ` · finish: ${finishReason}`,
  );

  // A first step that dwarfs everything else is provider-side latency
  // (cold start of the node, system-prompt + tool-schema ingestion),
  // not something to look for in application code.
  if (firstStepMs > 30_000 && firstStepMs > elapsedMs * 0.5) {
    const pct = Math.round((firstStepMs / elapsedMs) * 100);
    console.log(
      `[AI_SLOW_START] шаг #1 занял ${sec(firstStepMs)}s (${pct}% от общего)` +
        ` — задержка на стороне провайдера (холодный старт узла / обработка` +
        ` системного промпта), не в коде приложения`,
    );
  }
}

/** Human-readable reason for a stream that ended without a clean "stop". */
function finishMessage(reason: string, silenceMs: number): string {
  switch (reason) {
    case "other":
    case "unknown":
      // A stall (silence ≈ chunk timeout) is the provider dropping the
      // stream — raising the budget would not help; say so.
      if (silenceMs >= AI_CHUNK_TIMEOUT_MS - 5_000) {
        return (
          `Поток данных от провайдера прервался (тишина ${Math.round(silenceMs / 1000)} с) — ` +
          "обрыв на стороне шлюза. Повторите запрос."
        );
      }
      return "Генерация оборвана по таймауту. Увеличьте таймаут в Настройки → LLM или сузьте запрос.";
    case "length":
      return "Достигнут лимит токенов ответа (maxOutputTokens) — увеличьте его в Настройки → LLM.";
    case "tool-calls":
      return "Достигнут предел шагов анализа (30). Сузьте запрос или разбейте его на части.";
    case "error":
      return "Провайдер прервал генерацию.";
    default:
      return `Генерация не завершена (finish: ${reason}).`;
  }
}

export function formatAIError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const body = (error as Record<string, unknown>)?.responseBody as
    | string
    | undefined;

  // API rate/usage limit
  if (raw.includes("usage limit") || body?.includes("usage limit")) {
    const dateMatch = (body ?? raw).match(/access on (\d{4}-\d{2}-\d{2})/);
    const until = dateMatch ? ` до ${dateMatch[1]}` : "";
    return `Достигнут лимит API${until}. Попробуйте позже или смените AI-провайдер (AI_PROVIDER в .env).`;
  }

  // Authentication
  if (
    raw.includes("401") ||
    raw.includes("authentication") ||
    raw.includes("api_key")
  ) {
    return "Ошибка аутентификации API. Проверьте API-ключ в .env файле.";
  }

  // Gateway concurrent-slot limit: an aborted request still holds its slot
  // for a while — waiting is the fix, not a smaller request.
  if (raw.includes("too many concurrent requests")) {
    return (
      "Провайдер ограничил число одновременных запросов: прерванный запрос " +
      "ещё завершается на его стороне. Подождите 1–2 минуты и повторите."
    );
  }

  // Rate limiting (429) — including per-minute token limits
  if (
    raw.includes("429") ||
    raw.includes("rate_limit") ||
    raw.includes("rate limit") ||
    raw.includes("tokens per minute")
  ) {
    return "Слишком много запросов. Подождите минуту и попробуйте снова.";
  }

  // Model overloaded
  if (raw.includes("overloaded") || raw.includes("529")) {
    return "AI-сервис временно перегружен. Попробуйте через несколько минут.";
  }

  // Network/connection errors
  if (
    raw.includes("ECONNREFUSED") ||
    raw.includes("ETIMEDOUT") ||
    raw.includes("fetch failed")
  ) {
    return "Не удалось подключиться к AI-сервису. Проверьте сетевое соединение.";
  }

  // SDK wrapper when a stream produced nothing and the real error was not
  // captured — the least-informative case, keep a readable text anyway.
  if (raw.includes("No output generated")) {
    return "Модель не вернула данных — поток завершился ошибкой на стороне провайдера. Повторите запрос.";
  }

  // Generic fallback — truncate long messages
  return raw.length > 200 ? raw.slice(0, 200) + "…" : raw;
}
