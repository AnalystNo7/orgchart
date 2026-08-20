import { generateText, stepCountIs } from "ai";
import { getLlm } from "./provider";
import { buildTools } from "./tools";
import { buildSystemPrompt } from "./system-prompt";

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
  onError: (error: Error) => void;
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
  const { model, settings } = await getLlm();
  const tools = buildTools(scenarioId, onToolProgress, settings.toolResultMaxBytes);

  // Step timing: the gaps between steps are the model's own latency, which
  // is what a whole-loop timeout usually burns through.
  const runStartedAt = Date.now();
  let stepNo = 0;

  try {
    callbacks.onStatus("llm_thinking");

    const result = await generateText({
      model,
      temperature: settings.temperature,
      maxOutputTokens: settings.maxOutputTokens,
      timeout: settings.timeoutMs,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      tools,
      stopWhen: stepCountIs(10),
      onStepFinish: ({ text, toolCalls, toolResults }) => {
        stepNo += 1;
        console.log(
          `[AI_STEP] #${stepNo} +${Date.now() - runStartedAt}ms` +
            `, tools: ${toolCalls?.map((t) => t.toolName).join(", ") || "—"}` +
            `, text: ${text ? text.length : 0} chars`
        );
        if (text) {
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

    callbacks.onDone(result.text, allToolCalls);
  } catch (error) {
    console.error(
      `[AI_CHAT_ERROR] after ${Date.now() - runStartedAt}ms, ${stepNo} step(s) completed`,
      error
    );
    callbacks.onError(new Error(formatAIError(error)));
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
