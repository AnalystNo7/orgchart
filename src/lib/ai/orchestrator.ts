import { generateText, stepCountIs } from "ai";
import { getModel } from "./provider";
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
  const tools = buildTools(scenarioId);

  try {
    const result = await generateText({
      model: getModel(),
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      tools,
      stopWhen: stepCountIs(10),
      onStepFinish: ({ text, toolCalls, toolResults }) => {
        if (text) {
          callbacks.onText(text);
        }
        if (toolCalls) {
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
            callbacks.onToolCall(info);
          }
        }
      },
    });

    callbacks.onDone(result.text, allToolCalls);
  } catch (error) {
    console.error("[AI_CHAT_ERROR]", error);
    callbacks.onError(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}
