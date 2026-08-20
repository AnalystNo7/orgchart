import { generateText, stepCountIs } from "ai";
import { getLlm } from "./provider";
import { buildTools, createToolRunStats, type ToolRunStats } from "./tools";
import { buildSystemPrompt } from "./system-prompt";
import { AI_LOOP_SAFETY_MS, AI_ROUTE_MAX_DURATION_SEC } from "./limits";

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
}

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
  callbacks: StreamCallbacks
): Promise<void> {
  const systemPrompt = buildSystemPrompt(scenarioName);
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
    toolStats
  );

  // The loop timeout must fire BEFORE the platform kills the function,
  // otherwise the SSE error and the conversation save never make it out.
  const budgetMs = AI_ROUTE_MAX_DURATION_SEC * 1000 - AI_LOOP_SAFETY_MS;
  const timeoutMs = Math.min(settings.timeoutMs ?? budgetMs, budgetMs);
  if (settings.timeoutMs !== undefined && settings.timeoutMs > budgetMs) {
    console.log(
      `[AI_LIMIT] timeout пресета ${sec(settings.timeoutMs)}s урезан до ${sec(budgetMs)}s` +
        ` (запас ${sec(AI_LOOP_SAFETY_MS)}s до maxDuration ${AI_ROUTE_MAX_DURATION_SEC}s)`
    );
  }

  // Who is actually answering and under what caps. maxOutputTokens is nullable
  // in the preset, and an absent cap is a different thing from an unknown one —
  // for a reasoning model it means nothing bounds the generation.
  console.log(
    `[AI_RUN] ${info.source === "preset" ? `пресет "${info.name}"` : "env-конфигурация"}` +
      ` · ${info.provider} · ${info.model}` +
      ` · maxOutputTokens=${settings.maxOutputTokens ?? "НЕ ЗАДАН"}` +
      ` · temperature=${settings.temperature ?? "по умолчанию"}` +
      ` · timeout ${sec(timeoutMs)}s` +
      ` · tool-cap ${settings.toolResultMaxBytes ?? "по умолчанию"}` +
      ` · инструментов ${Object.keys(tools).length}`
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

  try {
    callbacks.onStatus("llm_thinking");

    const result = await generateText({
      model,
      temperature: settings.temperature,
      maxOutputTokens: settings.maxOutputTokens,
      timeout: timeoutMs,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      tools,
      stopWhen: stepCountIs(10),
      experimental_onStepStart: ({ stepNumber, messages: stepMessages }) => {
        inFlightStep = stepNumber + 1;
        inFlightStartedAt = Date.now();
        inFlightInputBytes = Buffer.byteLength(
          JSON.stringify(stepMessages),
          "utf8"
        );
        console.log(
          `[AI_STEP_START] #${inFlightStep} +${sec(inFlightStartedAt - runStartedAt)}s` +
            ` · сообщений ${stepMessages.length}` +
            ` · вход ~${kb(inFlightInputBytes)} КБ`
        );
      },
      onStepFinish: ({ text, toolCalls, toolResults }) => {
        stepNo += 1;
        if (stepNo === 1) firstStepMs = Date.now() - runStartedAt;
        console.log(
          `[AI_STEP] #${stepNo} +${Date.now() - runStartedAt}ms` +
            `, tools: ${toolCalls?.map((t) => t.toolName).join(", ") || "—"}` +
            `, text: ${text ? text.length : 0} chars`
        );
        if (text) {
          partialText += (partialText ? "\n\n" : "") + text;
          callbacks.onText(text);
        }
        if (toolCalls && toolCalls.length > 0) {
          for (let i = 0; i < toolCalls.length; i++) {
            const tc = toolCalls[i];
            const tr = toolResults?.[i] as Record<string, unknown> | undefined;
            const tcAny = tc as Record<string, unknown>;
            const toolInput = tcAny.input ?? tcAny.args ?? {};
            const trResult = tr?.result;
            const info: ToolCallInfo = {
              name: tc.toolName,
              input: toolInput as Record<string, unknown>,
              result: typeof trResult === "string" ? trResult : JSON.stringify(trResult ?? ""),
            };
            allToolCalls.push(info);
            callbacks.onStatus("tool_completed", tc.toolName);
            callbacks.onToolCall(info);
          }
          callbacks.onStatus("llm_analyzing");
        }
      },
    });

    logRunSummary(
      Date.now() - runStartedAt,
      stepNo,
      firstStepMs,
      toolStats,
      result.totalUsage,
      result.finishReason
    );

    callbacks.onDone(result.text, allToolCalls);
  } catch (error) {
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
      error
    );
    callbacks.onError(new Error(formatAIError(error)), {
      text: partialText,
      toolNames: allToolCalls.map((t) => t.name),
      steps: stepNo,
    });
  }
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
  finishReason: string
): void {
  const modelMs = Math.max(0, elapsedMs - toolStats.totalMs);
  console.log(
    `[AI_DONE] ${steps} шаг(ов) · ${sec(elapsedMs)}s ` +
      `(модель ${sec(modelMs)}s / инструменты ${sec(toolStats.totalMs)}s, ${formatToolCalls(toolStats)})` +
      ` · токены ${tok(usage?.inputTokens)} in + ${tok(usage?.outputTokens)} out` +
      ` (reasoning ${tok(usage?.reasoningTokens)}, cached ${tok(usage?.cachedInputTokens)})` +
      ` · finish: ${finishReason}`
  );

  // A first step that dwarfs everything else is provider-side latency
  // (cold start of the node, system-prompt + tool-schema ingestion),
  // not something to look for in application code.
  if (firstStepMs > 30_000 && firstStepMs > elapsedMs * 0.5) {
    const pct = Math.round((firstStepMs / elapsedMs) * 100);
    console.log(
      `[AI_SLOW_START] шаг #1 занял ${sec(firstStepMs)}s (${pct}% от общего)` +
        ` — задержка на стороне провайдера (холодный старт узла / обработка` +
        ` системного промпта), не в коде приложения`
    );
  }
}

export function formatAIError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const body =
    (error as Record<string, unknown>)?.responseBody as string | undefined;

  // API rate/usage limit
  if (raw.includes("usage limit") || body?.includes("usage limit")) {
    const dateMatch = (body ?? raw).match(
      /access on (\d{4}-\d{2}-\d{2})/
    );
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

  // Generic fallback — truncate long messages
  return raw.length > 200 ? raw.slice(0, 200) + "…" : raw;
}
