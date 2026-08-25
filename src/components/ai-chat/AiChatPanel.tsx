"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Bot, X, Plus, History, Send, FolderOpen, ChevronDown, Check } from "lucide-react";
import { useAiChatStore, type AiMessage, type StreamingPhase } from "@/lib/ai-store";
import { useOrgChartStore } from "@/lib/store";
import { ChatMessage } from "./ChatMessage";
import { QuickActions } from "./QuickActions";
import { ConversationList } from "./ConversationList";
import { StreamingStatus } from "./StreamingStatus";
import { ResizablePanel } from "@/components/ui/resizable-panel";

interface ScenarioItem {
  id: string;
  name: string;
  isBaseline: boolean;
  status: string;
  createdFrom: { id: string; name: string } | null;
}

const statusDotColor: Record<string, string> = {
  DRAFT: "bg-yellow-400",
  ACTIVE: "bg-green-400",
  ARCHIVED: "bg-neutral-400",
};

function useScenarios() {
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((data: ScenarioItem[]) => setScenarios(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { scenarios, loading };
}

function ScenarioBadge({
  scenarioId,
  scenarios,
  onSelect,
}: {
  scenarioId: string | null;
  scenarios: ScenarioItem[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = scenarios.find((s) => s.id === scenarioId);

  return (
    <div className="relative w-full">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg border border-ai/25 bg-ai-bg px-3 py-2 text-left text-sm transition-colors hover:bg-ai-bg"
      >
        <FolderOpen className="h-4 w-4 shrink-0 text-ai/70" />
        <div className="flex-1 truncate">
          <span className="text-xs text-ai/60">Сценарий:</span>
          <span className="ml-1 font-medium text-ai">
            {current ? current.name : "Не выбран"}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-ai/60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded-lg border border-line-strong bg-white shadow-lg">
          {scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                onSelect(s.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-ai-bg"
            >
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotColor[s.status] ?? "bg-neutral-300"}`}
              />
              <span className="flex-1 truncate">
                {s.isBaseline ? "\u2605 " : ""}
                {s.name}
                {/* Pre-existing derived scenarios lack the reference in the
                    name; new clones carry it, so skip to avoid duplication. */}
                {s.createdFrom && !s.name.includes("(из:") && (
                  <span className="block truncate text-xs text-neutral-400">
                    из: {s.createdFrom.name}
                  </span>
                )}
              </span>
              {s.id === scenarioId && (
                <Check className="h-3.5 w-3.5 text-ai" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AiChatPanel() {
  const scenarioId = useOrgChartStore((s) => s.currentScenarioId);
  const setCurrentScenarioId = useOrgChartStore((s) => s.setCurrentScenarioId);
  const {
    close,
    messages,
    addMessage,
    appendToLastAssistant,
    clearMessages,
    isStreaming,
    setStreaming,
    streamingPhase,
    setStreamingPhase,
    currentToolName,
    setCurrentToolName,
    streamingStartedAt,
    setStreamingStartedAt,
    completedSteps,
    addCompletedStep,
    clearCompletedSteps,
    lastHeartbeat,
    setLastHeartbeat,
    timeoutWarning,
    setTimeoutWarning,
    budgetMs,
    setBudgetMs,
    maxSteps,
    setMaxSteps,
    currentStep,
    setCurrentStep,
    stepStartedAt,
    setStepStartedAt,
    activeConversationId,
    setActiveConversationId,
    showConversationList,
    setShowConversationList,
  } = useAiChatStore();

  const { scenarios } = useScenarios();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingPhase, completedSteps]);

  const resetStreamingState = useCallback(() => {
    setStreaming(false);
    setStreamingPhase(null);
    setCurrentToolName(null);
    setStreamingStartedAt(null);
    setLastHeartbeat(null);
    setTimeoutWarning(null);
    setBudgetMs(null);
    setMaxSteps(null);
    setCurrentStep(null);
    setStepStartedAt(null);
    abortControllerRef.current = null;
  }, [setStreaming, setStreamingPhase, setCurrentToolName, setStreamingStartedAt, setLastHeartbeat, setTimeoutWarning, setBudgetMs, setMaxSteps, setCurrentStep, setStepStartedAt]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    resetStreamingState();
    addMessage({
      role: "assistant",
      content: "Запрос отменён пользователем.",
      timestamp: new Date().toISOString(),
    });
  }, [resetStreamingState, addMessage]);

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
      setStreamingPhase("connecting");
      setCurrentToolName(null);
      setStreamingStartedAt(Date.now());
      clearCompletedSteps();
      setTimeoutWarning(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

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
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          const errorText = res.status === 429
            ? "Слишком много запросов. Подождите минуту и попробуйте снова."
            : err.error || res.statusText;
          addMessage({
            role: "assistant",
            content: `⚠️ ${errorText}`,
            timestamp: new Date().toISOString(),
          });
          resetStreamingState();
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          resetStreamingState();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // SSE framing: events are separated by a blank line. Split into
          // complete frames and keep the unfinished tail in the buffer.
          // (The previous line-based scan used lines.indexOf(line), which
          // returns the FIRST occurrence — with a fast-streaming model many
          // identical "event: text" lines land in one chunk, so the first
          // delta was appended N times and the rest were lost.)
          const frames = buffer.split("\n\n");
          buffer = frames.pop() || "";

          for (const frame of frames) {
            let event = "";
            let dataStr = "";
            for (const line of frame.split("\n")) {
              if (line.startsWith("event: ")) event = line.slice(7);
              else if (line.startsWith("data: ")) dataStr = line.slice(6);
            }
            if (event && dataStr) {
              {
                try {
                  const data = JSON.parse(dataStr);
                  if (event === "text") {
                    appendToLastAssistant(data.text);
                  } else if (event === "tool_call") {
                    toolCalls.push({ name: data.name, input: data.input });
                  } else if (event === "conversation_id") {
                    setActiveConversationId(data.id);
                  } else if (event === "status") {
                    setStreamingPhase(data.phase as StreamingPhase);
                    if (data.detail) {
                      setCurrentToolName(data.detail);
                    }
                    // Track completed tools in the step log
                    if (data.phase === "tool_completed" && data.detail) {
                      addCompletedStep({
                        type: "tool_completed",
                        tool: data.detail,
                        ts: Date.now(),
                      });
                    }
                  } else if (event === "progress") {
                    // Tool internal progress (e.g. what-if sub-steps)
                    setCurrentToolName(data.tool);
                    addCompletedStep({
                      type: "progress",
                      tool: data.tool,
                      detail: data.step,
                      ts: Date.now(),
                    });
                  } else if (event === "error") {
                    // Server-side error (API limit, network, etc.)
                    resetStreamingState();
                    addMessage({
                      role: "assistant",
                      content: `⚠️ ${data.message || "Неизвестная ошибка"}`,
                      timestamp: new Date().toISOString(),
                    });
                  } else if (event === "meta") {
                    // Run metadata: budget once at start, step_start per step.
                    if (data.type === "budget") {
                      setBudgetMs(data.totalMs);
                      setMaxSteps(data.maxSteps);
                    } else if (data.type === "step_start") {
                      setCurrentStep(data.step);
                      setStepStartedAt(Date.now());
                    }
                  } else if (event === "heartbeat") {
                    setLastHeartbeat(data.ts);
                  } else if (event === "warning") {
                    setTimeoutWarning(data.message);
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
        if (err instanceof DOMException && err.name === "AbortError") {
          // Already handled by handleCancel
          return;
        }
        addMessage({
          role: "assistant",
          content: `Ошибка соединения: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`,
          timestamp: new Date().toISOString(),
        });
      } finally {
        resetStreamingState();
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
      setStreamingPhase,
      setCurrentToolName,
      setStreamingStartedAt,
      setActiveConversationId,
      resetStreamingState,
      clearCompletedSteps,
      addCompletedStep,
      setLastHeartbeat,
      setTimeoutWarning,
      setBudgetMs,
      setMaxSteps,
      setCurrentStep,
      setStepStartedAt,
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
      <ResizablePanel defaultWidth={384} minWidth={300} className="h-full border-l bg-white">
        <ConversationList />
      </ResizablePanel>
    );
  }

  return (
    <ResizablePanel defaultWidth={384} minWidth={300} className="h-full border-l bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-ai" />
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
            <Bot className="mb-3 h-10 w-10 text-ai/25" />
            <p className="text-sm font-medium text-neutral-500">
              AI-ассистент
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Задайте вопрос или выберите действие
            </p>
            {scenarios.length > 0 && (
              <div className="mt-4 w-full px-2">
                <ScenarioBadge
                  scenarioId={scenarioId}
                  scenarios={scenarios}
                  onSelect={setCurrentScenarioId}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <ChatMessage key={i} message={msg} />
            ))}
            {isStreaming && (
              <StreamingStatus
                phase={streamingPhase}
                budgetMs={budgetMs}
                maxSteps={maxSteps}
                currentStep={currentStep}
                stepStartedAt={stepStartedAt}
                currentToolName={currentToolName}
                startedAt={streamingStartedAt}
                completedSteps={completedSteps}
                lastHeartbeat={lastHeartbeat}
                timeoutWarning={timeoutWarning}
                onCancel={handleCancel}
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Quick actions (only when empty and scenario selected) */}
      {messages.length === 0 && scenarioId && (
        <QuickActions onAction={sendMessage} disabled={isStreaming} />
      )}

      {/* Input */}
      <div className="border-t px-3 py-2">
        {!scenarioId ? (
          <div className="text-center text-xs text-neutral-400">
            Выберите сценарий выше для начала работы
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder={isStreaming ? "Подождите ответа..." : "Задайте вопрос..."}
              rows={1}
              className="max-h-24 min-h-[36px] flex-1 resize-none rounded-md border border-line-strong px-3 py-2 text-sm focus:border-ai/50 focus:outline-none focus:ring-1 focus:ring-ai/25 disabled:bg-ink-50 disabled:text-ink-400 disabled:cursor-not-allowed"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ai text-white transition-colors hover:bg-[var(--ai-purple-600)] disabled:bg-ink-200 disabled:text-ink-400"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </ResizablePanel>
  );
}
