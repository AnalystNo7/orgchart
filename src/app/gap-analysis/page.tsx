"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrgChartStore } from "@/lib/store";
import { useAiChatStore } from "@/lib/ai-store";
import { GapPassportCard, type GapPassportData } from "@/components/gap-analysis/GapPassportCard";
import { GapPassportForm } from "@/components/gap-analysis/GapPassportForm";
import { Plus, Bot, GitCompare } from "lucide-react";
import type { GapStatus } from "@prisma/client";

interface ScenarioOption {
  id: string;
  name: string;
}

export default function GapAnalysisPage() {
  const currentScenarioId = useOrgChartStore((s) => s.currentScenarioId);
  const openAi = useAiChatStore((s) => s.open);
  const sendToAi = useAiChatStore((s) => s.addMessage);

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

  // Compare scenarios
  async function runComparison() {
    if (!asIsId || !toBeId) return;
    try {
      const res = await fetch(
        `/api/departments/compare?leftId=${asIsId}&rightId=${toBeId}`
      );
      if (res.ok) {
        const data = await res.json();
        setDiffSummary(data.summary);
      }
    } catch {
      // ignore
    }
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

  function askAiForGaps() {
    if (!asIsId || !toBeId) return;
    const asIsName = scenarios.find((s) => s.id === asIsId)?.name || asIsId;
    const toBeName = scenarios.find((s) => s.id === toBeId)?.name || toBeId;

    openAi();
    sendToAi({
      role: "user",
      content: `Проведи gap-анализ между сценариями «${asIsName}» (as-is, ID: ${asIsId}) и «${toBeName}» (to-be, ID: ${toBeId}). Сравни оргструктуры, выяви разрывы и создай паспорта разрывов для каждого значимого отличия.`,
      timestamp: new Date().toISOString(),
    });
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
        <div className="flex gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
          >
            <Plus className="h-4 w-4" />
            Добавить разрыв
          </button>
          <button
            onClick={askAiForGaps}
            disabled={!asIsId || !toBeId}
            className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:bg-neutral-300"
          >
            <Bot className="h-4 w-4" />
            AI: найти разрывы
          </button>
        </div>
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
            disabled={!asIsId || !toBeId}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-neutral-300"
          >
            <GitCompare className="h-4 w-4" />
            Сравнить
          </button>
        </div>

        {diffSummary && (
          <div className="mt-3 flex gap-4 text-sm">
            <span className="text-green-600">+{diffSummary.added} добавлено</span>
            <span className="text-red-600">-{diffSummary.removed} удалено</span>
            <span className="text-amber-600">~{diffSummary.modified} изменено</span>
            <span className="text-blue-600">{diffSummary.moved} перемещено</span>
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
            Нет паспортов разрывов. Используйте AI для автоматического выявления или добавьте вручную.
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
