"use client";

import { Sparkles } from "lucide-react";

interface QuickActionsProps {
  onAction: (prompt: string) => void;
  disabled?: boolean;
}

const ACTIONS = [
  { label: "Анализ структуры", prompt: "Проанализируй текущую оргструктуру. Выведи ключевые метрики (span of control, overhead ratio, FTE по категориям), сравни с бенчмарками ИТ-отрасли и укажи проблемы." },
  { label: "Найти проблемы", prompt: "Выяви проблемы в текущей оргструктуре: дублирование функций, слишком мелкие подразделения, избыточные уровни иерархии, несоответствие типов ШЕТИЛ." },
  { label: "Рекомендации", prompt: "Предложи рекомендации по оптимизации оргструктуры с обоснованием. Что можно объединить, сократить или реорганизовать?" },
  { label: "Расчёт P&L", prompt: "Рассчитай P&L по подразделениям за текущий год и проанализируй результаты. Какие подразделения прибыльны, какие убыточны?" },
];

export function QuickActions({ onAction, disabled }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-2">
      {ACTIONS.map((a) => (
        <button
          key={a.label}
          onClick={() => onAction(a.prompt)}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3" />
          {a.label}
        </button>
      ))}
    </div>
  );
}
