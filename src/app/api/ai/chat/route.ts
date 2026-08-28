import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runChat, type ChatMessage, type ToolCallInfo } from "@/lib/ai/orchestrator";

export const maxDuration = 60;

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

      // Timeout warning at 50s (maxDuration is 60s)
      const timeoutWarningTimer = setTimeout(() => {
        send("warning", { type: "timeout", message: "Запрос выполняется дольше обычного. Возможен таймаут." });
      }, 50000);

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
