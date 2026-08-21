"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  LLM_PROVIDERS,
  LLM_PROVIDER_LABELS,
  type LlmProvider,
} from "@/lib/validations/llm-setting";

/** Payload sent to POST /api/admin/llm and PATCH /api/admin/llm/[id]. */
export interface LlmSettingPayload {
  name: string;
  provider: LlmProvider;
  baseUrl: string | null;
  /** omitted when editing with an untouched key */
  apiKey?: string;
  model: string;
  temperature: number | null;
  maxOutputTokens: number | null;
  timeoutSec: number;
  toolResultMaxBytes: number | null;
}

interface FormValues {
  name: string;
  provider: LlmProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: string;
  limitEnabled: boolean;
  maxOutputTokens: string;
  timeoutSec: string;
  toolResultMaxBytes: string;
}

interface LlmSettingFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: LlmSettingPayload) => Promise<string | null>; // returns error text or null
  title: string;
  /** set when editing an existing preset */
  presetId?: string;
  /** mask like ••••56fa shown in the key placeholder when editing */
  keyMask?: string;
  defaultValues?: Partial<Omit<LlmSettingPayload, "apiKey">>;
}

const EMPTY: FormValues = {
  name: "",
  provider: "openai_compatible",
  baseUrl: "",
  apiKey: "",
  model: "",
  temperature: "",
  limitEnabled: false,
  maxOutputTokens: "16384",
  timeoutSec: "300",
  toolResultMaxBytes: "60000",
};

function toFormValues(d?: LlmSettingFormProps["defaultValues"]): FormValues {
  if (!d) return EMPTY;
  return {
    name: d.name ?? "",
    provider: d.provider ?? "openai_compatible",
    baseUrl: d.baseUrl ?? "",
    apiKey: "",
    model: d.model ?? "",
    temperature: d.temperature != null ? String(d.temperature) : "",
    limitEnabled: d.maxOutputTokens != null,
    maxOutputTokens: d.maxOutputTokens != null ? String(d.maxOutputTokens) : "16384",
    timeoutSec: d.timeoutSec != null ? String(d.timeoutSec) : "300",
    toolResultMaxBytes:
      d.toolResultMaxBytes != null ? String(d.toolResultMaxBytes) : "60000",
  };
}

/** "0,3" (ru locale) → 0.3; "" → NaN */
function parseNum(s: string): number {
  return Number(s.trim().replace(",", "."));
}

function toPayload(v: FormValues): LlmSettingPayload {
  return {
    name: v.name.trim(),
    provider: v.provider,
    baseUrl: v.baseUrl.trim() || null,
    ...(v.apiKey ? { apiKey: v.apiKey } : {}),
    model: v.model.trim(),
    temperature: v.temperature.trim() === "" ? null : parseNum(v.temperature),
    maxOutputTokens: v.limitEnabled ? Math.round(parseNum(v.maxOutputTokens)) : null,
    timeoutSec: Math.round(parseNum(v.timeoutSec)) || 300,
    toolResultMaxBytes:
      v.toolResultMaxBytes.trim() === ""
        ? null
        : Math.round(parseNum(v.toolResultMaxBytes)),
  };
}

export function LlmSettingForm({
  open,
  onClose,
  onSubmit,
  title,
  presetId,
  keyMask,
  defaultValues,
}: LlmSettingFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: toFormValues(defaultValues),
  });

  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    | { ok: true; latencyMs: number }
    | { ok: false; error: string }
    | null
  >(null);

  const provider = watch("provider");
  const limitEnabled = watch("limitEnabled");

  // Reset ONLY on the closed→open transition. Parent re-renders while the
  // dialog is open (e.g. next-auth session refetch on window focus) must not
  // wipe what the user has typed.
  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) {
      reset(toFormValues(defaultValues));
      setError("");
      setTestResult(null);
      setShowKey(false);
    }
    prevOpen.current = open;
  }, [open, defaultValues, reset]);

  async function submit(values: FormValues) {
    setError("");
    setSaving(true);
    try {
      const err = await onSubmit(toPayload(values));
      if (err) setError(err);
    } catch {
      setError("Не удалось сохранить настройку");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection(values: FormValues) {
    setTestResult(null);
    setError("");
    setTesting(true);
    try {
      const payload = { ...toPayload(values), presetId };
      const res = await fetch("/api/admin/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestResult({ ok: false, error: data.error || "Ошибка проверки" });
      } else if (data.ok) {
        setTestResult({ ok: true, latencyMs: data.latencyMs });
      } else {
        setTestResult({ ok: false, error: data.error || "Подключение не удалось" });
      }
    } catch {
      setTestResult({ ok: false, error: "Не удалось выполнить проверку" });
    } finally {
      setTesting(false);
    }
  }

  function fieldError(msg?: string) {
    return msg ? <p className="text-sm text-red-500">{msg}</p> : null;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* noValidate: native constraint validation would silently swallow the
            submit event on any violation; validation is done via RHF rules with
            visible per-field messages instead. */}
        <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="llm-name">Название</Label>
            <Input
              id="llm-name"
              {...register("name", { required: "Название обязательно" })}
              placeholder="Например: MiniMax через Gonka"
            />
            {fieldError(errors.name?.message)}
          </div>

          <div className="space-y-2">
            <Label>Тип провайдера</Label>
            <Select
              value={provider}
              onValueChange={(v) => setValue("provider", v as LlmProvider)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LLM_PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {LLM_PROVIDER_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="llm-baseurl">Адрес API (base URL)</Label>
            <Input
              id="llm-baseurl"
              {...register("baseUrl", {
                validate: (v) =>
                  provider !== "openai_compatible" ||
                  !!v.trim() ||
                  "Для OpenAI-совместимого провайдера base URL обязателен",
              })}
              placeholder={
                provider === "openai_compatible"
                  ? "https://api.proxy.gonka.gg/v1"
                  : "Необязательно — переопределяет стандартный адрес"
              }
            />
            {fieldError(errors.baseUrl?.message)}
          </div>

          <div className="space-y-2">
            <Label htmlFor="llm-key">API-ключ</Label>
            <div className="relative">
              <Input
                id="llm-key"
                type={showKey ? "text" : "password"}
                {...register("apiKey", {
                  validate: (v) =>
                    !!presetId ||
                    provider !== "openai_compatible" ||
                    !!v ||
                    "API-ключ обязателен",
                })}
                placeholder={
                  presetId && keyMask
                    ? `Сохранён (${keyMask}) — оставьте пустым, чтобы не менять`
                    : provider === "openai_compatible"
                      ? "Ключ провайдера"
                      : "Пусто — используется ключ из .env"
                }
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldError(errors.apiKey?.message)}
          </div>

          <div className="space-y-2">
            <Label htmlFor="llm-model">Модель</Label>
            <Input
              id="llm-model"
              {...register("model", { required: "Модель обязательна" })}
              placeholder="Например: MiniMaxAI/MiniMax-M2.7"
            />
            {fieldError(errors.model?.message)}
          </div>

          <div className="space-y-2">
            <Label htmlFor="llm-temp">Температура (необязательно, по умолчанию 0.3)</Label>
            <Input
              id="llm-temp"
              type="number"
              step="0.1"
              min="0"
              max="2"
              {...register("temperature", {
                validate: (v) => {
                  if (v.trim() === "") return true;
                  const n = parseNum(v);
                  return (
                    (!isNaN(n) && n >= 0 && n <= 2) ||
                    "Температура — число от 0 до 2"
                  );
                },
              })}
              placeholder="0.3"
            />
            {fieldError(errors.temperature?.message)}
          </div>

          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={limitEnabled}
                onChange={(e) => setValue("limitEnabled", e.target.checked)}
                className="rounded border-neutral-300"
              />
              Ограничить размер ответа
            </label>
            {limitEnabled && (
              <>
                <Input
                  type="number"
                  min="256"
                  max="128000"
                  {...register("maxOutputTokens", {
                    validate: (v) => {
                      if (!limitEnabled) return true;
                      const n = parseNum(v);
                      return (
                        (!isNaN(n) && n >= 256 && n <= 128000) ||
                        "Лимит ответа — целое число от 256 до 128000"
                      );
                    },
                  })}
                  placeholder="16384"
                />
                {fieldError(errors.maxOutputTokens?.message)}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="llm-timeout">
              Таймаут запроса, сек (по умолчанию 300, диапазон 30–3600)
            </Label>
            <Input
              id="llm-timeout"
              type="number"
              min="30"
              max="3600"
              {...register("timeoutSec", {
                validate: (v) => {
                  const n = parseNum(v);
                  return (
                    (!isNaN(n) && n >= 30 && n <= 3600) ||
                    "Таймаут — число от 30 до 3600 секунд"
                  );
                },
              })}
            />
            {fieldError(errors.timeoutSec?.message)}
          </div>

          <div className="space-y-2">
            <Label htmlFor="llm-toolbytes">
              Макс. размер результата инструмента, байт (по умолчанию 60000)
            </Label>
            <Input
              id="llm-toolbytes"
              type="number"
              min="4000"
              max="1000000"
              {...register("toolResultMaxBytes", {
                validate: (v) => {
                  if (v.trim() === "") return true;
                  const n = parseNum(v);
                  return (
                    (!isNaN(n) && n >= 4000 && n <= 1000000) ||
                    "Лимит результата — число от 4000 до 1000000 байт"
                  );
                },
              })}
              placeholder="60000"
            />
            <p className="text-xs text-neutral-500">
              Лимит провайдера на один блок данных во входящем сообщении
              (Gonka/MiniMax — 65536). Большие результаты AI-инструментов
              отдаются постранично с подсказкой модели.
            </p>
            {fieldError(errors.toolResultMaxBytes?.message)}
          </div>

          {testResult && (
            <p
              className={`text-sm ${testResult.ok ? "text-green-600" : "text-red-500"}`}
            >
              {testResult.ok
                ? `Подключение успешно (${testResult.latencyMs} мс)`
                : testResult.error}
            </p>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={testing}
              onClick={handleSubmit(testConnection)}
            >
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {testing ? "Проверка…" : "Проверить подключение"}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
