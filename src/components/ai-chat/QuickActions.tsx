"use client";

import { Sparkles, X } from "lucide-react";

interface QuickActionsProps {
  onAction: (prompt: string) => void;
  disabled?: boolean;
  /** Заголовок над чипами — для блока-подсказки посреди диалога. */
  heading?: string;
  /** Крестик «скрыть»; показывается только вместе с heading. */
  onDismiss?: () => void;
}

const ACTIONS = [
  { label: "Анализ структуры", prompt: "Проанализируй текущую оргструктуру. Выведи ключевые метрики (span of control, overhead ratio, FTE по категориям), сравни с бенчмарками ИТ-отрасли и укажи проблемы." },
  { label: "Найти проблемы", prompt: "Выяви проблемы в текущей оргструктуре: дублирование функций, слишком мелкие подразделения, избыточные уровни иерархии, несоответствие типов ШЕТИЛ." },
  { label: "Рекомендации", prompt: "Предложи рекомендации по оптимизации оргструктуры с обоснованием. Что можно объединить, сократить или реорганизовать?" },
  { label: "Расчёт P&L", prompt: "Рассчитай P&L по подразделениям за текущий год и проанализируй результаты. Какие подразделения прибыльны, какие убыточны?" },
  { label: "What-if", prompt: "Проведи what-if анализ: что произойдёт с метриками и P&L, если оптимизировать оргструктуру — объединить мелкие подразделения (менее 3 сотрудников) и снизить уровни иерархии? Создай what-if сценарий с конкретными изменениями." },
];

export function QuickActions({ onAction, disabled, heading, onDismiss }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-2">
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
      {ACTIONS.map((a) => (
        <button
          key={a.label}
          onClick={() => onAction(a.prompt)}
          title="Запрос уходит в AI-модель"
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-full border border-ai/25 bg-ai-bg px-2.5 py-1 text-xs font-medium text-ai transition-colors hover:bg-ai-bg disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3" />
          {a.label}
        </button>
      ))}
    </div>
  );
}
