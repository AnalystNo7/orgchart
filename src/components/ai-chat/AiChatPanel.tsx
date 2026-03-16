"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Bot, X, Plus, History, Send, Loader2 } from "lucide-react";
import { useAiChatStore, type AiMessage } from "@/lib/ai-store";
import { useOrgChartStore } from "@/lib/store";
import { ChatMessage } from "./ChatMessage";
import { QuickActions } from "./QuickActions";
import { ConversationList } from "./ConversationList";

export function AiChatPanel() {
  const scenarioId = useOrgChartStore((s) => s.currentScenarioId);
  const {
    close,
    messages,
    addMessage,
    appendToLastAssistant,
    clearMessages,
    isStreaming,
    setStreaming,
    activeConversationId,
    setActiveConversationId,
    showConversationList,
    setShowConversationList,
  } = useAiChatStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !scenarioId || isStreaming) return;

      const userMsg: AiMessage = {
        role: "user",
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };
      addMessage(userMsg);
      setInput("");
      setStreaming(true);

      try {
        const allMessages = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenarioId,
            conversationId: activeConversationId,
            messages: allMessages,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          addMessage({
            role: "assistant",
            content: `Ошибка: ${err.error || res.statusText}`,
            timestamp: new Date().toISOString(),
          });
          setStreaming(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setStreaming(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              const event = line.slice(7);
              const dataLine = lines[lines.indexOf(line) + 1];
              if (dataLine?.startsWith("data: ")) {
                try {
                  const data = JSON.parse(dataLine.slice(6));
                  if (event === "text") {
                    appendToLastAssistant(data.text);
                  } else if (event === "tool_call") {
                    toolCalls.push({ name: data.name, input: data.input });
                  } else if (event === "conversation_id") {
                    setActiveConversationId(data.id);
                  }
                } catch {
                  // skip
                }
              }
            }
          }
        }

        // Attach tool calls to last assistant message
        if (toolCalls.length > 0) {
          const msgs = useAiChatStore.getState().messages;
          const last = msgs[msgs.length - 1];
          if (last?.role === "assistant") {
            useAiChatStore.setState({
              messages: [
                ...msgs.slice(0, -1),
                { ...last, toolCalls },
              ],
            });
          }
        }
      } catch (err) {
        addMessage({
          role: "assistant",
          content: `Ошибка соединения: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`,
          timestamp: new Date().toISOString(),
        });
      } finally {
        setStreaming(false);
      }
    },
    [
      scenarioId,
      isStreaming,
      messages,
      activeConversationId,
      addMessage,
      appendToLastAssistant,
      setStreaming,
      setActiveConversationId,
    ]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (showConversationList) {
    return (
      <aside className="flex h-full w-96 flex-col border-l bg-white">
        <ConversationList />
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-96 flex-col border-l bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-purple-600" />
          <span className="text-sm font-semibold">AI-ассистент</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              clearMessages();
            }}
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            title="Новый диалог"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowConversationList(true)}
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            title="История"
          >
            <History className="h-4 w-4" />
          </button>
          <button
            onClick={close}
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-3 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Bot className="mb-3 h-10 w-10 text-purple-200" />
            <p className="text-sm font-medium text-neutral-500">
              AI-ассистент
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Задайте вопрос или выберите действие
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <ChatMessage key={i} message={msg} />
            ))}
            {isStreaming && (
              <div className="flex items-center gap-2 text-sm text-purple-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Анализирую...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Quick actions (only when empty) */}
      {messages.length === 0 && (
        <QuickActions onAction={sendMessage} disabled={isStreaming || !scenarioId} />
      )}

      {/* Input */}
      <div className="border-t px-3 py-2">
        {!scenarioId ? (
          <div className="text-center text-xs text-neutral-400">
            Выберите сценарий для работы с AI
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Задайте вопрос..."
              rows={1}
              className="max-h-24 min-h-[36px] flex-1 resize-none rounded-md border border-neutral-200 px-3 py-2 text-sm focus:border-purple-300 focus:outline-none focus:ring-1 focus:ring-purple-300"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-purple-600 text-white transition-colors hover:bg-purple-700 disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
