"use client";

import { Database, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type QuickActionsMode = "local" | "ai";

interface QuickActionsProps {
  /** local — тумблер «AI» выключен: чипы для локального поиска; ai — чипы-промпты для модели. */
  mode: QuickActionsMode;
  onAction: (prompt: string) => void;
  /** Подстановка текста в поле ввода без отправки (чип «Найти в базе знаний…»). */
  onPrefill?: (text: string) => void;
  disabled?: boolean;
  /** Заголовок над чипами — для блока-подсказки посреди диалога. */
  heading?: string;
  /** Крестик «скрыть»; показывается только вместе с heading. */
  onDismiss?: () => void;
  /** Переопределение отступов — например, внутри пузыря сообщения. */
  className?: string;
}

type ChipAction = { label: string; prompt: string } | { label: string; prefill: string };

/**
 * Локальные чипы: тексты подобраны под ключевые слова detectIntent
 * в src/lib/ai/local-query.ts — «бенчмарк» + «ит-» (отрасль IT-интеграторы),
 * категория по «структур» / «финанс» / «hr», диагностика по «не в норме».
 * Детектор фильтрует по категории, не по метрике, поэтому чипы — по категориям.
 */
const LOCAL_ACTIONS: ChipAction[] = [
  { label: "Бенчмарки для ИТ-интеграторов", prompt: "бенчмарки для ИТ-интеграторов" },
  { label: "Что у нас не в норме", prompt: "что у нас не в норме" },
  { label: "Оргструктура: нормы ИТ", prompt: "бенчмарки оргструктуры ИТ-интеграторов" },
  { label: "Финансы: нормы ИТ", prompt: "финансовые бенчмарки ИТ-интеграторов" },
  { label: "HR: нормы ИТ", prompt: "HR-бенчмарки ИТ-интеграторов" },
];

const AI_ACTIONS: ChipAction[] = [
  { label: "Анализ структуры", prompt: "Проанализируй текущую оргструктуру. Выведи ключевые метрики (span of control, overhead ratio, FTE по категориям), сравни с бенчмарками ИТ-отрасли и укажи проблемы." },
  { label: "Найти проблемы", prompt: "Выяви проблемы в текущей оргструктуре: дублирование функций, слишком мелкие подразделения, избыточные уровни иерархии, несоответствие типов ШЕТИЛ." },
  { label: "Рекомендации", prompt: "Предложи рекомендации по оптимизации оргструктуры с обоснованием. Что можно объединить, сократить или реорганизовать?" },
  { label: "Расчёт P&L", prompt: "Рассчитай P&L по подразделениям за текущий год и проанализируй результаты. Какие подразделения прибыльны, какие убыточны?" },
  { label: "What-if", prompt: "Проведи what-if анализ: что произойдёт с метриками и P&L, если оптимизировать оргструктуру — объединить мелкие подразделения (менее 3 сотрудников) и снизить уровни иерархии? Создай what-if сценарий с конкретными изменениями." },
];

export function QuickActions({ mode, onAction, onPrefill, disabled, heading, onDismiss, className }: QuickActionsProps) {
  const isAi = mode === "ai";
  const actions = isAi ? AI_ACTIONS : LOCAL_ACTIONS;
  const Icon = isAi ? Sparkles : Database;
  const localChipClass =
    "inline-flex items-center gap-1 rounded-full border border-line-strong bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-100 disabled:opacity-50";

  return (
    <div className={cn("flex flex-wrap gap-1.5 px-3 py-2", className)}>
      {heading && (
        <div className="mb-0.5 flex w-full items-center justify-between">
          <span className="text-xs text-ink-500">{heading}</span>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Скрыть подсказки"
              className="rounded p-0.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={() => ("prefill" in a ? onPrefill?.(a.prefill) : onAction(a.prompt))}
          title={isAi ? "Запрос уходит в AI-модель" : "Локальный поиск, без AI-модели"}
          disabled={disabled}
          className={
            isAi
              ? "inline-flex items-center gap-1 rounded-full border border-ai/25 bg-ai-bg px-2.5 py-1 text-xs font-medium text-ai transition-colors hover:bg-ai-bg disabled:opacity-50"
              : localChipClass
          }
        >
          <Icon className="h-3 w-3" />
          {a.label}
        </button>
      ))}
    </div>
  );
}
