import { create } from "zustand";

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
  timestamp: string;
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

  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;

  conversations: ConversationSummary[];
  setConversations: (c: ConversationSummary[]) => void;

  showConversationList: boolean;
  setShowConversationList: (v: boolean) => void;
}

export const useAiChatStore = create<AiChatState>((set) => ({
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

  activeConversationId: null,
  setActiveConversationId: (activeConversationId) =>
    set({ activeConversationId }),

  conversations: [],
  setConversations: (conversations) => set({ conversations }),

  showConversationList: false,
  setShowConversationList: (showConversationList) =>
    set({ showConversationList }),
}));
