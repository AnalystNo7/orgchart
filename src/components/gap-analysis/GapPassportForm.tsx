"use client";

import { useState } from "react";
import type { GapCategory, GapPriority } from "@prisma/client";

interface GapPassportFormProps {
  scenarioId: string;
  asIsScenarioId: string;
  toBeScenarioId: string;
  onCreated: () => void;
  onCancel: () => void;
}

export function GapPassportForm({
  scenarioId,
  asIsScenarioId,
  toBeScenarioId,
  onCreated,
  onCancel,
}: GapPassportFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<GapCategory>("STRUCTURE");
  const [priority, setPriority] = useState<GapPriority>("MEDIUM");
  const [impact, setImpact] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId,
          asIsScenarioId,
          toBeScenarioId,
          category,
          title: title.trim(),
          description: description.trim(),
          priority,
          impact: impact.trim() || null,
        }),
      });
      if (res.ok) {
        onCreated();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border bg-white p-4">
      <h3 className="text-sm font-semibold">Новый паспорт разрыва</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Категория</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as GapCategory)}
            className="w-full rounded border px-2 py-1.5 text-sm"
          >
            <option value="STRUCTURE">Структура</option>
            <option value="PROCESS">Процессы</option>
            <option value="RESOURCE">Ресурсы</option>
            <option value="COMPETENCY">Компетенции</option>
            <option value="TECHNOLOGY">Технологии</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Приоритет</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as GapPriority)}
            className="w-full rounded border px-2 py-1.5 text-sm"
          >
            <option value="CRITICAL">Критический</option>
            <option value="HIGH">Высокий</option>
            <option value="MEDIUM">Средний</option>
            <option value="LOW">Низкий</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Название</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded border px-2 py-1.5 text-sm"
          placeholder="Краткое описание разрыва"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Описание</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded border px-2 py-1.5 text-sm"
          rows={3}
          placeholder="Полное описание: что есть vs что должно быть"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Влияние (необязательно)</label>
        <input
          value={impact}
          onChange={(e) => setImpact(e.target.value)}
          className="w-full rounded border px-2 py-1.5 text-sm"
          placeholder="На какие цели/KPI влияет"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={loading || !title.trim() || !description.trim()}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-neutral-300"
        >
          {loading ? "Создание..." : "Создать"}
        </button>
      </div>
    </form>
  );
}
