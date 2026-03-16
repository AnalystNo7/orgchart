"use client";

import { useEffect } from "react";
import { MessageSquare, Trash2, ArrowLeft } from "lucide-react";
import { useAiChatStore } from "@/lib/ai-store";
import { useOrgChartStore } from "@/lib/store";

export function ConversationList() {
  const scenarioId = useOrgChartStore((s) => s.currentScenarioId);
  const {
    conversations,
    setConversations,
    setShowConversationList,
    setActiveConversationId,
    setMessages,
  } = useAiChatStore();

  useEffect(() => {
    if (!scenarioId) return;
    fetch(`/api/ai/conversations?scenarioId=${scenarioId}`)
      .then((r) => r.json())
      .then(setConversations)
      .catch(() => {});
  }, [scenarioId, setConversations]);

  async function loadConversation(id: string) {
    try {
      const res = await fetch(`/api/ai/conversations/${id}`);
      const conv = await res.json();
      setActiveConversationId(id);
      setMessages(conv.messages || []);
      setShowConversationList(false);
    } catch {
      // ignore
    }
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
      setConversations(conversations.filter((c) => c.id !== id));
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <button
          onClick={() => setShowConversationList(false)}
          className="rounded p-1 hover:bg-neutral-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">История диалогов</span>
      </div>
      <div className="flex-1 overflow-auto">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-neutral-400">
            Нет диалогов
          </div>
        ) : (
          <div className="space-y-0.5 p-1">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => loadConversation(c.id)}
                className="group flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-neutral-100"
              >
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {c.title}
                  </div>
                  <div className="text-xs text-neutral-400">
                    {new Date(c.updatedAt).toLocaleDateString("ru-RU")}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteConversation(c.id, e)}
                  className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
