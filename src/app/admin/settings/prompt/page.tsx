"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw, Save } from "lucide-react";

interface PromptDto {
  content: string;
  isCustom: boolean;
  defaultContent: string;
  technicalContent: string;
  updatedAt: string | null;
}

export default function AdminPromptPage() {
  const [data, setData] = useState<PromptDto | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/prompt");
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error || `Ошибка сервера (HTTP ${res.status})`);
      return;
    }
    setData(body);
    setText(body.content);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = data !== null && text !== data.content;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/prompt", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    const body = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(body?.error || `Ошибка сервера (HTTP ${res.status})`);
      return;
    }
    setSavedAt(Date.now());
    await load();
  }

  async function handleReset() {
    if (
      !confirm(
        "Сбросить системный промпт к стандартному? Ваши правки будут удалены."
      )
    )
      return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/prompt", { method: "DELETE" });
    const body = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(body?.error || `Ошибка сервера (HTTP ${res.status})`);
      return;
    }
    setSavedAt(Date.now());
    await load();
  }

  if (!data && !error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-neutral-500">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Системный промт</h2>
            {data?.isCustom && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                Изменён
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Методическая часть инструкции для модели — роль, ориентиры,
            правила ответа. Применяется к следующему AI-запросу без редеплоя.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            rows={22}
            className="w-full resize-y rounded-md border border-line-strong bg-white px-3 py-2 font-mono text-xs leading-relaxed focus:border-ai focus:outline-none focus:ring-[3px] focus:ring-ai/20"
          />

          <p className="text-xs text-neutral-500">
            Плейсхолдер {"{{scenario_name}}"} — имя текущего сценария,
            подставляется автоматически при генерации. Технические инструкции
            (маркировка источников, порядок работы с инструментами) добавляются
            к промпту автоматически и здесь не редактируются.
          </p>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={!dirty || saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={saving || (!data.isCustom && !dirty)}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Сбросить к стандартному
            </Button>
            {savedAt && !dirty && !error && (
              <span className="text-sm text-green-600">Сохранено</span>
            )}
          </div>

          <details className="rounded-lg border bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
              Технический промт (только чтение)
            </summary>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap border-t px-4 py-3 font-mono text-xs leading-relaxed text-neutral-600">
              {data.technicalContent}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
