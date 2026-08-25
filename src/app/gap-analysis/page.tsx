"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useOrgChartStore } from "@/lib/store";
import { useAiChatStore } from "@/lib/ai-store";
import { GapPassportCard, type GapPassportData } from "@/components/gap-analysis/GapPassportCard";
import { GapPassportForm } from "@/components/gap-analysis/GapPassportForm";
import { Plus, Loader2, Sparkles, Search, Square } from "lucide-react";
import type { GapStatus } from "@prisma/client";

interface ScenarioOption {
  id: string;
  name: string;
}

export default function GapAnalysisPage() {
  const currentScenarioId = useOrgChartStore((s) => s.currentScenarioId);
  const { open: openAiChat } = useAiChatStore();

  const [scenarios, setScenarios] = useState<ScenarioOption[]>([]);
  const [asIsId, setAsIsId] = useState("");
  const [toBeId, setToBeId] = useState("");
  const [gaps, setGaps] = useState<GapPassportData[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [diffSummary, setDiffSummary] = useState<{
    added: number;
    removed: number;
    modified: number;
    moved: number;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [compared, setCompared] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load scenarios
  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((data) => {
        const items = (data.scenarios || data || []).map((s: { id: string; name: string }) => ({
          id: s.id,
          name: s.name,
        }));
        setScenarios(items);
      })
      .catch(() => {});
  }, []);

  // Load gaps when scenario selected
  const loadGaps = useCallback(() => {
    if (!currentScenarioId) return;
    fetch(`/api/gaps?scenarioId=${currentScenarioId}`)
      .then((r) => r.json())
      .then(setGaps)
      .catch(() => {});
  }, [currentScenarioId]);

  useEffect(() => {
    loadGaps();
  }, [loadGaps]);

  // Reset compared state when scenarios change
  useEffect(() => {
    setCompared(false);
    setDiffSummary(null);
  }, [asIsId, toBeId]);

  // Compare scenarios — open AI chat and send comparison request
  function runComparison() {
    if (!asIsId || !toBeId) return;

    const asIsName = scenarios.find((s) => s.id === asIsId)?.name || asIsId;
    const toBeName = scenarios.find((s) => s.id === toBeId)?.name || toBeId;

    // Open AI chat and send comparison message
    openAiChat();

    // Small delay to ensure chat panel is mounted
    setTimeout(() => {
      const { addMessage, messages, setStreaming, appendToLastAssistant, activeConversationId, setActiveConversationId } = useAiChatStore.getState();
      const scenarioId = useOrgChartStore.getState().currentScenarioId;

      const text = `Сравни два сценария оргструктуры и покажи ключевые различия:\n- As-is: «${asIsName}» (ID: ${asIsId})\n- To-be: «${toBeName}» (ID: ${toBeId})\n\nИспользуй инструмент compare_scenarios для сравнения. Покажи сводку различий: что добавлено, удалено, изменено, перемещено. Укажи на потенциальные проблемы и зоны для gap-анализа.`;

      const userMsg = {
        role: "user" as const,
        content: text,
        timestamp: new Date().toISOString(),
      };
      addMessage(userMsg);
      setStreaming(true);

      const allMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId,
          conversationId: activeConversationId,
          messages: allMessages,
        }),
      })
        .then(async (res) => {
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

          // eslint-disable-next-line no-constant-condition
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
        })
        .catch((err) => {
          addMessage({
            role: "assistant",
            content: `Ошибка соединения: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`,
            timestamp: new Date().toISOString(),
          });
        })
        .finally(() => {
          setStreaming(false);
          setCompared(true);
        });
    }, 100);
  }

  // Generate gap passports via auto-generate endpoint
  async function generateGapPassports() {
    if (!asIsId || !toBeId || !currentScenarioId) return;
    setGenerateError(null);
    setGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/gaps/auto-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: currentScenarioId,
          asIsScenarioId: asIsId,
          toBeScenarioId: toBeId,
        }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        setGenerateError(data.error || "Ошибка генерации");
        return;
      }

      if (data.summary) {
        setDiffSummary(data.summary);
      }

      if (data.message && data.gaps?.length === 0) {
        setGenerateError(data.message);
      }

      loadGaps();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setGenerateError("Генерация остановлена пользователем");
      } else {
        setGenerateError("Ошибка сети при генерации паспортов");
      }
    } finally {
      setGenerating(false);
      abortControllerRef.current = null;
    }
  }

  function stopGeneration() {
    abortControllerRef.current?.abort();
  }

  async function handleStatusChange(id: string, status: GapStatus) {
    try {
      await fetch(`/api/gaps/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      loadGaps();
    } catch {
      // ignore
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/gaps/${id}`, { method: "DELETE" });
      loadGaps();
    } catch {
      // ignore
    }
  }

  if (!currentScenarioId) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-400">
        Выберите сценарий
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Gap-анализ</h1>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
        >
          <Plus className="h-4 w-4" />
          Добавить вручную
        </button>
      </div>

      {/* Scenario selection */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Сравнение сценариев</h2>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              As-is (как есть)
            </label>
            <select
              value={asIsId}
              onChange={(e) => setAsIsId(e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-sm"
              disabled={generating}
            >
              <option value="">Выберите сценарий...</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              To-be (целевое)
            </label>
            <select
              value={toBeId}
              onChange={(e) => setToBeId(e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-sm"
              disabled={generating}
            >
              <option value="">Выберите сценарий...</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={runComparison}
            disabled={!asIsId || !toBeId || generating}
            className="inline-flex items-center gap-1.5 rounded-md border border-ai/40 bg-white px-4 py-1.5 text-sm font-medium text-ai hover:bg-ai-bg disabled:border-line-strong disabled:bg-ink-50 disabled:text-ink-400"
          >
            <Search className="h-4 w-4" />
            Сравнить
          </button>
        </div>

        {/* Generate + Stop buttons */}
        <div className="mt-3 flex items-center gap-3">
          {!generating ? (
            <button
              onClick={generateGapPassports}
              disabled={!asIsId || !toBeId || generating}
              className="inline-flex items-center gap-1.5 rounded-md bg-ai px-4 py-1.5 text-sm font-medium text-white hover:bg-ai-600 disabled:bg-ink-300"
            >
              <Sparkles className="h-4 w-4" />
              Создать паспорта разрывов
            </button>
          ) : (
            <>
              <button
                disabled
                className="inline-flex items-center gap-1.5 rounded-md bg-ai px-4 py-1.5 text-sm font-medium text-white"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                AI генерирует паспорта...
              </button>
              <button
                onClick={stopGeneration}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Square className="h-3.5 w-3.5" />
                Остановить
              </button>
            </>
          )}
        </div>

        {diffSummary && (
          <div className="mt-3 flex gap-4 text-sm">
            <span className="text-green-600">+{diffSummary.added} добавлено</span>
            <span className="text-red-600">-{diffSummary.removed} удалено</span>
            <span className="text-amber-600">~{diffSummary.modified} изменено</span>
            <span className="text-blue-600">{diffSummary.moved} перемещено</span>
          </div>
        )}

        {generateError && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {generateError}
          </div>
        )}
      </div>

      {/* New gap form */}
      {showForm && asIsId && toBeId && (
        <GapPassportForm
          scenarioId={currentScenarioId}
          asIsScenarioId={asIsId}
          toBeScenarioId={toBeId}
          onCreated={() => {
            setShowForm(false);
            loadGaps();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {showForm && (!asIsId || !toBeId) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          Выберите оба сценария (as-is и to-be) для создания паспорта разрыва
        </div>
      )}

      {/* Gaps list */}
      <div>
        <h2 className="mb-3 text-sm font-semibold">
          Паспорта разрывов ({gaps.length})
        </h2>
        {gaps.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-400">
            {generating
              ? "AI анализирует различия между сценариями..."
              : "Нет паспортов разрывов. Выберите два сценария, нажмите «Сравнить» для анализа в AI-чате, затем «Создать паспорта разрывов» для автоматического выявления."}
          </div>
        ) : (
          <div className="space-y-3">
            {gaps.map((gap) => (
              <GapPassportCard
                key={gap.id}
                gap={gap}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
