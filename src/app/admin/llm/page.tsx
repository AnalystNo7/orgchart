"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Power } from "lucide-react";
import {
  LlmSettingForm,
  type LlmSettingPayload,
} from "@/components/admin/LlmSettingForm";
import {
  LLM_PROVIDER_LABELS,
  type LlmProvider,
} from "@/lib/validations/llm-setting";

interface LlmSettingRow {
  id: string;
  name: string;
  provider: LlmProvider;
  baseUrl: string | null;
  model: string;
  temperature: number | null;
  maxOutputTokens: number | null;
  timeoutSec: number;
  isActive: boolean;
  keyMask: string;
  createdAt: string;
  updatedAt: string;
}

function summaryLine(s: LlmSettingRow): string {
  const parts = [s.model];
  if (s.baseUrl) parts.push(s.baseUrl);
  parts.push(`ключ ${s.keyMask}`);
  if (s.maxOutputTokens != null) parts.push(`лимит ${s.maxOutputTokens}`);
  if (s.temperature != null) parts.push(`t=${s.temperature}`);
  parts.push(`таймаут ${s.timeoutSec} с`);
  return parts.join(" · ");
}

export default function AdminLlmPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [settings, setSettings] = useState<LlmSettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LlmSettingRow | null>(null);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/admin/llm");
    if (res.ok) {
      setSettings(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user?.isAdmin) {
      router.push("/");
      return;
    }
    fetchSettings();
  }, [session, status, router, fetchSettings]);

  async function handleSubmit(payload: LlmSettingPayload): Promise<string | null> {
    const res = editing
      ? await fetch(`/api/admin/llm/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/admin/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      const data = await res.json();
      return data.error || "Ошибка при сохранении";
    }

    setFormOpen(false);
    setEditing(null);
    fetchSettings();
    return null;
  }

  async function handleActivate(id: string) {
    const res = await fetch(`/api/admin/llm/${id}/activate`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Ошибка активации");
      return;
    }
    fetchSettings();
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить настройку LLM?")) return;
    const res = await fetch(`/api/admin/llm/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Ошибка при удалении");
      return;
    }
    fetchSettings();
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-neutral-500">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Настройки LLM</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Именованные подключения к модели для AI-функций. Активная настройка
            используется при генерации; переключение — без редеплоя. Совместимо
            с OpenAI-подобным API (OpenAI, DeepSeek, локальные vLLM/Ollama,
            прокси и т.п.).
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Добавить настройку
        </Button>
      </div>

      <div className="rounded-lg border bg-white">
        {settings.length === 0 ? (
          <p className="p-6 text-sm text-neutral-500">
            Настроек пока нет — AI-функции работают от переменных окружения.
          </p>
        ) : (
          <ul className="divide-y">
            {settings.map((s) => (
              <li key={s.id} className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{s.name}</span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {LLM_PROVIDER_LABELS[s.provider] ?? s.provider}
                  </span>
                  {s.isActive && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Активная
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-500">{summaryLine(s)}</p>
                <div className="flex items-center gap-2">
                  {!s.isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleActivate(s.id)}
                    >
                      <Power className="mr-1.5 h-3.5 w-3.5" />
                      Сделать активной
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(s);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Редактировать
                  </Button>
                  {!s.isActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => handleDelete(s.id)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Удалить
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-neutral-500">
        Ключи хранятся в базе данных и показываются только маской. Если ни одна
        настройка не активна, используются переменные окружения (AI_PROVIDER,
        AI_MODEL и ключи провайдеров из .env). Активная настройка применяется ко
        всем AI-функциям сразу, без перезапуска. Для чат-ассистента модель должна
        поддерживать вызов инструментов (tool calling).
      </p>

      <LlmSettingForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        title={editing ? `Настройка: ${editing.name}` : "Новая настройка LLM"}
        presetId={editing?.id}
        keyMask={editing?.keyMask}
        defaultValues={
          editing
            ? {
                name: editing.name,
                provider: editing.provider,
                baseUrl: editing.baseUrl,
                model: editing.model,
                temperature: editing.temperature,
                maxOutputTokens: editing.maxOutputTokens,
                timeoutSec: editing.timeoutSec,
              }
            : undefined
        }
      />
    </div>
  );
}
