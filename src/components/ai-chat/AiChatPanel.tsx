"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Bot, X, Plus, History, Send, FolderOpen, ChevronDown, Check, Maximize2, Minimize2 } from "lucide-react";
import { useAiChatStore, type AiMessage, type StreamingPhase } from "@/lib/ai-store";
import { useOrgChartStore } from "@/lib/store";
import { ChatMessage } from "./ChatMessage";
import { QuickActions, type QuickActionsMode } from "./QuickActions";
import { ConversationList } from "./ConversationList";
import { StreamingStatus } from "./StreamingStatus";
import { ResizablePanel } from "@/components/ui/resizable-panel";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

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
    llmEnabled,
    setLlmEnabled,
    setAskAiOnLast,
    popAskAiExchange,
    setLastAssistantContent,
  } = useAiChatStore();

  const { scenarios } = useScenarios();
  const [input, setInput] = useState("");
  // Блок-подсказка над полем ввода посреди диалога:
  // "ai" — тумблер «AI» перевели во «включено» при непустой ленте (AI-чипы);
  // "local" — завершился любой ответ при выключенном тумблере (локальные чипы).
  // Прячется по клику на чип, крестик или при отправке сообщения. Ставится в
  // обработчиках, а не в эффекте, поэтому при загрузке страницы блока нет.
  const [suggestions, setSuggestions] = useState<QuickActionsMode | null>(null);

  // Масштаб текста сообщений (Ctrl+колесо), 70–180%, живёт между сеансами
  const [chatZoom, setChatZoom] = useState<number>(() => {
    if (typeof window === "undefined") return 100;
    try {
      const raw = Number(localStorage.getItem("aiChatZoom"));
      return raw >= 70 && raw <= 180 ? raw : 100;
    } catch {
      return 100;
    }
  });
  const messagesBoxRef = useRef<HTMLDivElement>(null);

  // Развёрнутый режим — панель поверх всего окна. Не запоминается: после
  // перезагрузки панель снова колонкой справа
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isMaximized) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMaximized(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMaximized]);

  const applyZoom = useCallback((value: number) => {
    const clamped = Math.min(180, Math.max(70, value));
    setChatZoom(clamped);
    try {
      localStorage.setItem("aiChatZoom", String(clamped));
    } catch {
      // приватный режим — просто не запоминаем
    }
  }, []);

  useEffect(() => {
    const el = messagesBoxRef.current;
    if (!el) return;
    // Нативный listener с passive:false — React-овский onWheel пассивный,
    // и preventDefault в нём не отменил бы зум всей страницы
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Шаг по знаку, не по величине: pinch тачпада шлёт мелкие deltaY
      setChatZoom((prev) => {
        const next = Math.min(180, Math.max(70, prev + (e.deltaY < 0 ? 10 : -10)));
        try {
          localStorage.setItem("aiChatZoom", String(next));
        } catch {
          // ignore
        }
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

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
    async (text: string, opts?: { llm?: boolean }) => {
      if (!text.trim() || !scenarioId || isStreaming) return;
      // Тумблер «AI» — по умолчанию; кнопки быстрых действий и «Отправить в AI»
      // передают llm: true явно.
      const useLlm = opts?.llm ?? llmEnabled;
      setSuggestions(null);

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
        // Из стора, а не из замыкания: popAskAiExchange мог только что убрать
        // заглушку и вопрос перед ней.
        const history = useAiChatStore.getState().messages;
        const allMessages = history
          .filter((m) => m !== userMsg)
          .concat(userMsg)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenarioId,
            conversationId: activeConversationId,
            messages: allMessages,
            useLlm,
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
                  } else if (event === "replace") {
                    // Сервер переписал ответ (починка языка) — заменить целиком.
                    setLastAssistantContent(data.text);
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
                  } else if (event === "done") {
                    // Локальный поиск не справился: предложить кнопку
                    // «Отправить в AI» под заглушкой.
                    if (data.needsLlm && typeof data.question === "string") {
                      setAskAiOnLast(data.question);
                    }
                  } else if (event === "heartbeat") {
                    setLastHeartbeat(data.ts);
                  } else if (event === "warning") {
                    // type "clear" (message: null) снимает баннер, когда
                    // ожидание повтора или очереди закончилось.
                    setTimeoutWarning(data.message ?? null);
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
        // Тумблер заблокирован во время стрима, значение из замыкания актуально.
        if (!llmEnabled) setSuggestions("local");
      }
    },
    [
      scenarioId,
      isStreaming,
      llmEnabled,
      setAskAiOnLast,
      setLastAssistantContent,
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
      <ResizablePanel
        defaultWidth={384}
        minWidth={300}
        fullscreen={isMaximized}
        className="h-full border-l bg-white"
      >
        <ConversationList />
      </ResizablePanel>
    );
  }

  return (
    <ResizablePanel
      defaultWidth={384}
      minWidth={300}
      fullscreen={isMaximized}
      className="h-full border-l bg-white"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-ai" />
          <span className="text-sm font-semibold">AI-ассистент</span>
          {chatZoom !== 100 && (
            <button
              onClick={() => applyZoom(100)}
              className="rounded-full bg-ai-bg px-2 py-0.5 text-[11px] font-semibold text-ai transition-colors hover:bg-ai/15"
              title="Масштаб текста (Ctrl+колесо). Нажмите, чтобы вернуть 100%"
            >
              {chatZoom}%
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMaximized((v) => !v)}
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            title={isMaximized ? "Свернуть в панель (Esc)" : "Развернуть на весь экран"}
          >
            {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={() => {
              setSuggestions(null);
              clearMessages();
            }}
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            title="Новый диалог"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setSuggestions(null);
              setShowConversationList(true);
            }}
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
      <div
        ref={messagesBoxRef}
        className={cn(
          "flex-1 overflow-auto py-3",
          // В развёрнутом режиме контент от края до края с полями:
          // ответы ассистента — таблицы и отчёты, им нужна ширина
          isMaximized ? "px-8" : "px-3"
        )}
        style={{ zoom: chatZoom / 100 }}
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Bot className="mb-3 h-10 w-10 text-ai/25" />
            <p className="text-sm font-medium text-neutral-500">
              AI-ассистент
            </p>
            <p className="mt-1 max-w-xs text-xs text-neutral-400">
              {llmEnabled
                ? "Задайте вопрос AI-модели или выберите действие"
                : "Поиск по бенчмаркам и базе знаний. Вопросы к модели — после включения «AI»."}
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
            {messages.map((msg, i) => {
              // Кнопка «Отправить в AI» и AI-чипы — только под последней
              // заглушкой: popAskAiExchange работает лишь с последним сообщением.
              const isLast = i === messages.length - 1;
              return (
                <ChatMessage
                  key={i}
                  message={msg}
                  wide={isMaximized}
                  askAiDisabled={isStreaming}
                  onAskAi={
                    isLast
                      ? () => {
                          const question = popAskAiExchange();
                          if (question) sendMessage(question, { llm: true });
                        }
                      : undefined
                  }
                  onQuickAction={isLast ? (p) => sendMessage(p, { llm: true }) : undefined}
                />
              );
            })}
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

      {/* Быстрые действия в пустом диалоге: набор чипов зависит от тумблера «AI» */}
      {messages.length === 0 && scenarioId && (
        <div className={cn(isMaximized && "px-5")}>
          <QuickActions
            mode={llmEnabled ? "ai" : "local"}
            onAction={(p) => sendMessage(p, { llm: llmEnabled })}
            onPrefill={(t) => {
              setInput(t);
              inputRef.current?.focus();
            }}
            disabled={isStreaming}
          />
        </div>
      )}

      {/* Подсказки посреди диалога: AI-чипы после включения тумблера,
          локальные чипы после каждого ответа при выключенном тумблере */}
      {suggestions && messages.length > 0 && scenarioId && (
        <div className={cn("border-t", isMaximized && "px-5")}>
          <QuickActions
            mode={suggestions}
            heading={suggestions === "ai" ? "AI включён. Что исследовать:" : "Что ещё посмотреть:"}
            onDismiss={() => setSuggestions(null)}
            onAction={(p) => {
              setSuggestions(null);
              sendMessage(p, { llm: suggestions === "ai" });
            }}
            onPrefill={(t) => {
              setSuggestions(null);
              setInput(t);
              inputRef.current?.focus();
            }}
            disabled={isStreaming}
          />
        </div>
      )}

      {/* Input */}
      <div className={cn("border-t py-2", isMaximized ? "px-8" : "px-3")}>
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
              placeholder={
                isStreaming
                  ? "Подождите ответа..."
                  : llmEnabled
                    ? "Спросите AI-модель..."
                    : "Найти в бенчмарках и базе знаний..."
              }
              rows={1}
              className="max-h-24 min-h-[36px] flex-1 resize-none rounded-md border border-line-strong px-3 py-2 text-sm focus:border-ai/50 focus:outline-none focus:ring-1 focus:ring-ai/25 disabled:bg-ink-50 disabled:text-ink-400 disabled:cursor-not-allowed"
            />
            <label
              className="flex h-9 shrink-0 select-none items-center gap-1.5 text-xs"
              title={
                llmEnabled
                  ? "Включено: вопросы идут в AI-модель (тратятся токены)"
                  : "Выключено: локальный поиск по бенчмаркам и базе знаний; вопросы к модели — кнопкой «Отправить в AI»"
              }
            >
              <Switch
                checked={llmEnabled}
                onCheckedChange={(v) => {
                  setLlmEnabled(v);
                  setSuggestions(v && messages.length > 0 ? "ai" : null);
                }}
                disabled={isStreaming}
                aria-label="Отправлять вопросы в AI-модель"
                className="data-[state=checked]:bg-ai"
              />
              <span className={cn("font-semibold", llmEnabled ? "text-ai" : "text-ink-400")}>AI</span>
            </label>
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ai text-white transition-colors hover:bg-ai-600 disabled:bg-ink-200 disabled:text-ink-400"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </ResizablePanel>
  );
}
