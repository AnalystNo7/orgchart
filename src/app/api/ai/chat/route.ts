import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  runChat,
  type ChatMessage,
  type PartialRun,
  type ToolCallInfo,
} from "@/lib/ai/orchestrator";
import { processLocalQuery } from "@/lib/ai/local-query";
import { toolLabel } from "@/lib/ai/tool-labels";

// Binds ONLY on Vercel (locally there is no platform limit; runChat clamps
// the loop budget under it only when process.env.VERCEL is set). Next reads
// maxDuration at build time and only accepts a literal — keep this number in
// sync with AI_ROUTE_MAX_DURATION_SEC in src/lib/ai/limits.ts. Long reports
// on Vercel need the "автопродолжение" follow-up task.
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

      const cleanup = () => {
        clearInterval(heartbeatInterval);
      };

      const toolCalls: ToolCallInfo[] = [];

      send("status", { phase: "connecting" });

      await runChat(messages, scenarioId, scenario.name, {
        onText: (text) => {
          send("status", { phase: "streaming" });
          send("text", { text });
        },
        onStatus: (phase, detail) => {
          // Fired by the orchestrator a minute before the real total budget —
          // only it knows what that budget is.
          if (phase === "timeout_warning") {
            send("warning", {
              type: "timeout",
              message: "Запрос выполняется дольше обычного. Возможен таймаут.",
            });
            return;
          }
          // Retry wait: show the attempt counter in the warning banner AND
          // switch the phase label.
          if (phase === "retry_wait") {
            if (detail) send("warning", { type: "retry", message: detail });
            send("status", { phase });
            return;
          }
          send("status", { phase, detail });
        },
        onProgress: (toolName, step) => {
          send("progress", { tool: toolName, step });
        },
        onMeta: (meta) => {
          send("meta", meta);
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
          const newId = await saveConversation({
            scenarioId,
            conversationId,
            messages,
            assistantContent: fullResponse,
            context: { toolCalls: allToolCalls.map((t) => t.name) },
          });
          if (newId) send("conversation_id", { id: newId });

          send("done", { toolCalls: allToolCalls.map((t) => t.name) });
          controller.close();
        },
        onError: async (error, partial) => {
          cleanup();
          // Everything gathered so far is otherwise thrown away: the model's
          // text stays only in the browser and the turn is never persisted,
          // so a follow-up "продолжай" reaches the model with no memory of it.
          const note = buildAbortNote(partial);
          send("text", { text: note });
          const newId = await saveConversation({
            scenarioId,
            conversationId,
            messages,
            assistantContent: partial.text
              ? `${partial.text}\n\n${note}`
              : note,
            context: {
              toolCalls: partial.toolNames,
              aborted: true,
              steps: partial.steps,
            },
          });
          if (newId) send("conversation_id", { id: newId });

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

      const newId = await saveConversation({
        scenarioId,
        conversationId,
        messages,
        assistantContent: response,
        context: { local: true, sources },
        fallbackTitle: "Локальный поиск",
      });
      if (newId) send("conversation_id", { id: newId });

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

/**
 * Persist a finished turn. Returns the id of a freshly created conversation
 * (so the caller can announce it), or null when updating an existing one or
 * when the save fails — a failed save must never break the stream.
 */
async function saveConversation(params: {
  scenarioId: string;
  conversationId?: string;
  messages: ChatMessage[];
  assistantContent: string;
  context: Record<string, unknown>;
  fallbackTitle?: string;
}): Promise<string | null> {
  const {
    scenarioId,
    conversationId,
    messages,
    assistantContent,
    context,
    fallbackTitle = "Диалог с AI",
  } = params;

  try {
    const allMessages = [
      ...messages,
      { role: "assistant" as const, content: assistantContent },
    ];
    const title = messages[0]?.content.slice(0, 100) || fallbackTitle;

    if (conversationId) {
      await prisma.aiConversation.update({
        where: { id: conversationId },
        data: {
          messages: JSON.parse(JSON.stringify(allMessages)) as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });
      return null;
    }

    const conv = await prisma.aiConversation.create({
      data: {
        scenarioId,
        title,
        messages: JSON.parse(JSON.stringify(allMessages)) as Prisma.InputJsonValue,
        context: JSON.parse(JSON.stringify(context)) as Prisma.InputJsonValue,
      },
    });
    return conv.id;
  } catch {
    // Don't fail the stream if save fails
    return null;
  }
}

/** Honest note appended to an aborted turn, listing what did get collected. */
function buildAbortNote(partial: PartialRun): string {
  const collected = [...new Set(partial.toolNames)].map(toolLabel);
  const lines = [
    `\n\n---\n⏱ **Ответ не доведён до конца** — превышен лимит времени` +
      (partial.steps > 0 ? ` после ${partial.steps} шаг(ов)` : ""),
  ];
  if (collected.length > 0) {
    lines.push(`Уже собрано: ${collected.join(", ")}.`);
  }
  lines.push(
    "Диалог сохранён — повторите запрос с префиксом `!ai`, " +
      "либо сузьте его, чтобы модели требовалось меньше выкладок."
  );
  return lines.join("\n\n");
}
