import Anthropic from "@anthropic-ai/sdk";
import { aiTools } from "./tools";
import { executeTool } from "./tool-executor";
import { buildSystemPrompt } from "./system-prompt";

const anthropic = new Anthropic();

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
 * Run a conversation turn with Claude, handling tool use loops.
 * Streams text back via callbacks.
 */
export async function runChat(
  messages: ChatMessage[],
  scenarioId: string,
  scenarioName: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const systemPrompt = buildSystemPrompt(scenarioName);
  const allToolCalls: ToolCallInfo[] = [];
  let fullResponse = "";

  // Convert messages to Anthropic format
  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    let continueLoop = true;

    while (continueLoop) {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        tools: aiTools,
        messages: anthropicMessages,
      });

      const response = await stream.finalMessage();

      // Process content blocks
      let hasToolUse = false;
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          fullResponse += block.text;
          callbacks.onText(block.text);
        } else if (block.type === "tool_use") {
          hasToolUse = true;

          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            scenarioId
          );

          const toolInfo: ToolCallInfo = {
            name: block.name,
            input: block.input as Record<string, unknown>,
            result,
          };
          allToolCalls.push(toolInfo);
          callbacks.onToolCall(toolInfo);

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      if (hasToolUse) {
        // Add assistant message and tool results, then continue
        anthropicMessages.push({
          role: "assistant",
          content: response.content,
        });
        anthropicMessages.push({
          role: "user",
          content: toolResults,
        });
      } else {
        continueLoop = false;
      }
    }

    callbacks.onDone(fullResponse, allToolCalls);
  } catch (error) {
    callbacks.onError(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}
