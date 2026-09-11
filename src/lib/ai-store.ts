import { create } from "zustand";

export type StreamingPhase =
  | "connecting"
  | "llm_thinking"
  | "tool_executing"
  | "tool_completed"
  | "llm_analyzing"
  | "streaming"
  | "local_search"
  | "retry_wait"
  | "queue_wait"
  | "llm_reasoning"
  | null;

export interface CompletedStep {
  type: "tool_started" | "tool_completed" | "progress";
  tool: string;
  detail?: string;
  ts: number;
}

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
  timestamp: string;
  /**
   * Заглушка локального поиска: вопрос, который можно одной кнопкой
   * отправить в AI-модель («Отправить в AI»).
   */
  askAi?: string;
}

const LLM_ENABLED_KEY = "aiChatLlmEnabled";

/** Тумблер «AI» в чате запоминается в браузере; по умолчанию выключен. */
function readLlmEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(LLM_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface AiChatState {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;

  messages: AiMessage[];
  setMessages: (msgs: AiMessage[]) => void;
  addMessage: (msg: AiMessage) => void;
  appendToLastAssistant: (text: string) => void;
  clearMessages: () => void;

  isStreaming: boolean;
  setStreaming: (v: boolean) => void;

  streamingPhase: StreamingPhase;
  setStreamingPhase: (phase: StreamingPhase) => void;
  currentToolName: string | null;
  setCurrentToolName: (name: string | null) => void;
  streamingStartedAt: number | null;
  setStreamingStartedAt: (ts: number | null) => void;

  completedSteps: CompletedStep[];
  addCompletedStep: (step: CompletedStep) => void;
  clearCompletedSteps: () => void;

  lastHeartbeat: number | null;
  setLastHeartbeat: (ts: number | null) => void;

  timeoutWarning: string | null;
  setTimeoutWarning: (msg: string | null) => void;

  // Live run metadata from the server's "meta" SSE events: the client cannot
  // know the time budget or the current step on its own.
  budgetMs: number | null;
  setBudgetMs: (ms: number | null) => void;
  maxSteps: number | null;
  setMaxSteps: (n: number | null) => void;
  currentStep: number | null;
  setCurrentStep: (n: number | null) => void;
  stepStartedAt: number | null;
  setStepStartedAt: (ts: number | null) => void;

  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;

  conversations: ConversationSummary[];
  setConversations: (c: ConversationSummary[]) => void;

  showConversationList: boolean;
  setShowConversationList: (v: boolean) => void;
  /** Тумблер «AI»: все сообщения идут во внешнюю модель. */
  llmEnabled: boolean;
  setLlmEnabled: (v: boolean) => void;
  /** Пометить последний ответ ассистента предложением «Отправить в AI». */
  setAskAiOnLast: (question: string) => void;
  /**
   * Убрать заглушку и вопрос перед ней из ленты, вернув текст вопроса —
   * чтобы отправить его в модель одной кнопкой без дубля в чате.
   */
  popAskAiExchange: () => string | null;
}

export const useAiChatStore = create<AiChatState>((set, get) => ({
  llmEnabled: readLlmEnabled(),
  setLlmEnabled: (llmEnabled) => {
    try {
      localStorage.setItem(LLM_ENABLED_KEY, llmEnabled ? "1" : "0");
    } catch {
      // приватный режим — просто не запоминаем
    }
    set({ llmEnabled });
  },
  setAskAiOnLast: (question) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== "assistant") return {};
      msgs[msgs.length - 1] = { ...last, askAi: question };
      return { messages: msgs };
    }),
  popAskAiExchange: () => {
    const msgs = get().messages;
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== "assistant" || !last.askAi) return null;
    const prev = msgs[msgs.length - 2];
    const cut = prev && prev.role === "user" ? 2 : 1;
    set({ messages: msgs.slice(0, msgs.length - cut) });
    return last.askAi;
  },

  isOpen: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),

  messages: [],
  setMessages: (messages) => set({ messages }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendToLastAssistant: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: last.content + text };
      } else {
        msgs.push({
          role: "assistant",
          content: text,
          timestamp: new Date().toISOString(),
        });
      }
      return { messages: msgs };
    }),
  clearMessages: () => set({ messages: [], activeConversationId: null }),

  isStreaming: false,
  setStreaming: (isStreaming) => set({ isStreaming }),

  streamingPhase: null,
  setStreamingPhase: (streamingPhase) => set({ streamingPhase }),
  currentToolName: null,
  setCurrentToolName: (currentToolName) => set({ currentToolName }),
  streamingStartedAt: null,
  setStreamingStartedAt: (streamingStartedAt) => set({ streamingStartedAt }),

  completedSteps: [],
  addCompletedStep: (step) =>
    set((s) => ({ completedSteps: [...s.completedSteps, step] })),
  clearCompletedSteps: () => set({ completedSteps: [] }),

  lastHeartbeat: null,
  setLastHeartbeat: (lastHeartbeat) => set({ lastHeartbeat }),

  timeoutWarning: null,
  setTimeoutWarning: (timeoutWarning) => set({ timeoutWarning }),

  budgetMs: null,
  setBudgetMs: (budgetMs) => set({ budgetMs }),
  maxSteps: null,
  setMaxSteps: (maxSteps) => set({ maxSteps }),
  currentStep: null,
  setCurrentStep: (currentStep) => set({ currentStep }),
  stepStartedAt: null,
  setStepStartedAt: (stepStartedAt) => set({ stepStartedAt }),

  activeConversationId: null,
  setActiveConversationId: (activeConversationId) =>
    set({ activeConversationId }),

  conversations: [],
  setConversations: (conversations) => set({ conversations }),

  showConversationList: false,
  setShowConversationList: (showConversationList) =>
    set({ showConversationList }),
}));
