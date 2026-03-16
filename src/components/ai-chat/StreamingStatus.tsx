"use client";

import { useEffect, useState } from "react";
import { Loader2, Plug, Brain, Wrench, BarChart3, Type, Square } from "lucide-react";
import type { StreamingPhase } from "@/lib/ai-store";
import { toolLabel } from "./tool-labels";

const PHASE_CONFIG: Record<
  NonNullable<StreamingPhase>,
  { label: string; icon: typeof Loader2; color: string }
> = {
  connecting: {
    label: "Подключение к AI...",
    icon: Plug,
    color: "text-neutral-500",
  },
  llm_thinking: {
    label: "AI обрабатывает запрос...",
    icon: Brain,
    color: "text-purple-600",
  },
  tool_executing: {
    label: "Выполнение инструмента",
    icon: Wrench,
    color: "text-amber-600",
  },
  llm_analyzing: {
    label: "AI анализирует результаты...",
    icon: BarChart3,
    color: "text-indigo-600",
  },
  streaming: {
    label: "Генерация ответа...",
    icon: Type,
    color: "text-green-600",
  },
};

interface StreamingStatusProps {
  phase: StreamingPhase;
  currentToolName: string | null;
  startedAt: number | null;
  onCancel: () => void;
}

export function StreamingStatus({
  phase,
  currentToolName,
  startedAt,
  onCancel,
}: StreamingStatusProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  if (!phase) return null;

  const config = PHASE_CONFIG[phase];
  const Icon = config.icon;
  const showCancel = elapsed >= 5;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}м ${sec}с` : `${sec}с`;
  };

  return (
    <div className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
      <div className="flex flex-1 items-center gap-2">
        <Loader2 className={`h-4 w-4 animate-spin ${config.color}`} />
        <Icon className={`h-4 w-4 ${config.color}`} />
        <div className="flex flex-col">
          <span className={`font-medium ${config.color}`}>
            {phase === "tool_executing" && currentToolName
              ? toolLabel(currentToolName)
              : config.label}
          </span>
          {phase === "tool_executing" && currentToolName && (
            <span className="text-xs text-neutral-400">
              {currentToolName}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums text-xs text-neutral-400">
          {formatTime(elapsed)}
        </span>
        {showCancel && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
            title="Отменить запрос"
          >
            <Square className="h-3 w-3" />
            <span>Отмена</span>
          </button>
        )}
      </div>
    </div>
  );
}
