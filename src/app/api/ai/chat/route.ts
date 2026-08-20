import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runChat, type ChatMessage, type ToolCallInfo } from "@/lib/ai/orchestrator";
import { processLocalQuery } from "@/lib/ai/local-query";

import { AI_ROUTE_MAX_DURATION_SEC } from "@/lib/ai/limits";

// Must cover the LLM budget: the active preset's timeoutSec (validated
// 30…600) is clamped in runChat to maxDuration minus AI_LOOP_SAFETY_MS, so
// the loop aborts before the platform kills the function. Next reads
// maxDuration at build time and only accepts a literal — keep this number
// in sync with AI_ROUTE_MAX_DURATION_SEC in src/lib/ai/limits.ts.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    scenarioId,
    conversationId,
    messages,
  } = body as {
    scenarioId: string;
    conversationId?: string;
    messages: ChatMessage[];
  };

  if (!scenarioId || !messages?.length) {
    return Response.json({ error: "scenarioId and messages required" }, { status: 400 });
  }

  // Get scenario name for context
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    select: { name: true },
  });
  if (!scenario) {
    return Response.json({ error: "Scenario not found" }, { status: 404 });
  }

  // Try local query processing first (no external LLM)
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "user") {
    // Check if user explicitly approved LLM usage with prefix "!ai "
    const useLlm = lastMessage.content.startsWith("!ai ");

    if (!useLlm) {
      const localResult = await processLocalQuery(lastMessage.content, scenarioId);
      if (localResult.handled) {
        return buildLocalResponseStream(
          localResult.response,
          localResult.sources,
          messages,
          scenarioId,
          conversationId
        );
      }

      // Local search didn't handle it — ask permission before using external LLM
      const askPermissionResponse = `Для ответа на этот запрос необходимо обращение к внешней AI-модели.

**Данные из локальных источников не найдены.**

Чтобы отправить запрос во внешнюю LLM, добавьте префикс \`!ai\` к вашему сообщению, например:
> !ai ${lastMessage.content.slice(0, 80)}${lastMessage.content.length > 80 ? "..." : ""}

Или используйте локальные команды:
- **Бенчмарки**: «бенчмарки для IT-интеграторов», «какой overhead нормальный»
- **Диагностика**: «что у нас не в норме», «отклонения от бенчмарков»
- **База знаний**: «найди в базе знаний про RACI», «документы про Минцберга»`;

      return buildLocalResponseStream(
        askPermissionResponse,
        [],
        messages,
        scenarioId,
        conversationId
      );
    }

    // Strip "!ai " prefix before sending to LLM
    messages[messages.length - 1] = {
      ...lastMessage,
      content: lastMessage.content.slice(4),
    };
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Heartbeat: send ping every 5s to keep connection alive
      const heartbeatInterval = setInterval(() => {
        send("heartbeat", { ts: Date.now() });
      }, 5000);

      // Timeout warning a minute before maxDuration
      const timeoutWarningTimer = setTimeout(() => {
        send("warning", { type: "timeout", message: "Запрос выполняется дольше обычного. Возможен таймаут." });
      }, AI_ROUTE_MAX_DURATION_SEC * 1000 - 60_000);

      const cleanup = () => {
        clearInterval(heartbeatInterval);
        clearTimeout(timeoutWarningTimer);
      };

      const toolCalls: ToolCallInfo[] = [];

      send("status", { phase: "connecting" });

      await runChat(messages, scenarioId, scenario.name, {
        onText: (text) => {
          send("status", { phase: "streaming" });
          send("text", { text });
        },
        onStatus: (phase, detail) => {
          send("status", { phase, detail });
        },
        onProgress: (toolName, step) => {
          send("progress", { tool: toolName, step });
        },
        onToolCall: (info) => {
          toolCalls.push(info);
          send("tool_call", {
            name: info.name,
            input: info.input,
          });
          send("tool_result", {
            name: info.name,
            result: info.result,
          });
        },
        onDone: async (fullResponse, allToolCalls) => {
          cleanup();
          // Save conversation
          try {
            const allMessages = [
              ...messages,
              { role: "assistant" as const, content: fullResponse },
            ];
            const title =
              messages[0]?.content.slice(0, 100) || "Диалог с AI";

            if (conversationId) {
              await prisma.aiConversation.update({
                where: { id: conversationId },
                data: {
                  messages: JSON.parse(JSON.stringify(allMessages)) as Prisma.InputJsonValue,
                  updatedAt: new Date(),
                },
              });
            } else {
              const conv = await prisma.aiConversation.create({
                data: {
                  scenarioId,
                  title,
                  messages: JSON.parse(JSON.stringify(allMessages)) as Prisma.InputJsonValue,
                  context: { toolCalls: allToolCalls.map((t) => t.name) } as Prisma.InputJsonValue,
                },
              });
              send("conversation_id", { id: conv.id });
            }
          } catch {
            // Don't fail the stream if save fails
          }

          send("done", { toolCalls: allToolCalls.map((t) => t.name) });
          controller.close();
        },
        onError: (error) => {
          cleanup();
          send("error", { message: error.message });
          controller.close();
        },
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Build SSE stream for locally processed queries (no external LLM)
 */
function buildLocalResponseStream(
  response: string,
  sources: Array<{ type: string; label: string }>,
  messages: ChatMessage[],
  scenarioId: string,
  conversationId?: string
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      send("status", { phase: "local_search" });

      // Send response text
      send("text", { text: response });

      // Save conversation
      try {
        const allMessages = [
          ...messages,
          { role: "assistant" as const, content: response },
        ];
        const title = messages[0]?.content.slice(0, 100) || "Локальный поиск";

        if (conversationId) {
          await prisma.aiConversation.update({
            where: { id: conversationId },
            data: {
              messages: JSON.parse(JSON.stringify(allMessages)) as Prisma.InputJsonValue,
              updatedAt: new Date(),
            },
          });
        } else {
          const conv = await prisma.aiConversation.create({
            data: {
              scenarioId,
              title,
              messages: JSON.parse(JSON.stringify(allMessages)) as Prisma.InputJsonValue,
              context: { local: true, sources } as Prisma.InputJsonValue,
            },
          });
          send("conversation_id", { id: conv.id });
        }
      } catch {
        // Don't fail if save fails
      }

      send("done", { local: true, sources });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
