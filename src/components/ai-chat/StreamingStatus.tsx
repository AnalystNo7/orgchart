"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Plug,
  Brain,
  Wrench,
  BarChart3,
  Type,
  Square,
  CheckCircle2,
  AlertTriangle,
  Circle,
} from "lucide-react";
import type { StreamingPhase, CompletedStep } from "@/lib/ai-store";
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
    color: "text-ai",
  },
  tool_executing: {
    label: "Выполнение инструмента",
    icon: Wrench,
    color: "text-amber-600",
  },
  tool_completed: {
    label: "Инструмент завершён",
    icon: CheckCircle2,
    color: "text-green-600",
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
  local_search: {
    label: "Локальный поиск (без LLM)...",
    icon: BarChart3,
    color: "text-blue-600",
  },
  retry_wait: {
    label: "Провайдер занят — жду свободный слот...",
    icon: Plug,
    color: "text-amber-600",
  },
};

interface StreamingStatusProps {
  phase: StreamingPhase;
  currentToolName: string | null;
  startedAt: number | null;
  completedSteps: CompletedStep[];
  lastHeartbeat: number | null;
  timeoutWarning: string | null;
  budgetMs: number | null;
  maxSteps: number | null;
  currentStep: number | null;
  stepStartedAt: number | null;
  onCancel: () => void;
}

export function StreamingStatus({
  phase,
  currentToolName,
  startedAt,
  completedSteps,
  lastHeartbeat,
  timeoutWarning,
  budgetMs,
  maxSteps,
  currentStep,
  stepStartedAt,
  onCancel,
}: StreamingStatusProps) {
  const [elapsed, setElapsed] = useState(0);
  const [heartbeatAlive, setHeartbeatAlive] = useState(true);

  useEffect(() => {
    if (!startedAt) return;
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  // Heartbeat arrives every 5s; 15s of silence means the connection is gone
  // (10s produced false alarms on event-loop pauses).
  useEffect(() => {
    if (!lastHeartbeat) return;
    setHeartbeatAlive(true);
    const check = setInterval(() => {
      setHeartbeatAlive(Date.now() - lastHeartbeat < 15000);
    }, 2000);
    return () => clearInterval(check);
  }, [lastHeartbeat]);

  if (!phase) return null;

  const config = PHASE_CONFIG[phase];
  const Icon = config.icon;
  const showCancel = elapsed >= 5;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}м ${sec}с` : `${sec}с`;
  };

  // The 1s `elapsed` interval already re-renders us — derive the step timer
  // and the budget colour from the same tick instead of extra timers.
  const stepElapsed = stepStartedAt
    ? Math.max(0, Math.floor((Date.now() - stepStartedAt) / 1000))
    : null;
  const budgetSec = budgetMs ? Math.floor(budgetMs / 1000) : null;
  const budgetRatio = budgetSec ? elapsed / budgetSec : 0;
  const timerColor =
    budgetRatio > 0.95
      ? "text-red-500"
      : budgetRatio > 0.8
      ? "text-amber-500"
      : "text-neutral-400";

  // Deduplicate steps for display: show last 5 unique steps
  const displaySteps = completedSteps.slice(-5);

  return (
    <div className="space-y-2">
      {/* Connection lost */}
      {!heartbeatAlive && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            Соединение с сервером потеряно — ответ может не прийти. Повторите
            запрос.
          </span>
        </div>
      )}

      {/* Timeout warning */}
      {timeoutWarning && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{timeoutWarning}</span>
        </div>
      )}

      {/* Completed steps log */}
      {displaySteps.length > 0 && (
        <div className="space-y-1">
          {displaySteps.map((step, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs text-neutral-400"
            >
              <CheckCircle2 className="h-3 w-3 shrink-0 text-green-400" />
              <span>
                {step.type === "progress"
                  ? step.detail
                  : step.type === "tool_started"
                  ? `${toolLabel(step.tool)}`
                  : `${toolLabel(step.tool)}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Current status */}
      <div className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
        <div className="flex flex-1 items-center gap-2">
          <Loader2 className={`h-4 w-4 animate-spin ${config.color}`} />
          <Icon className={`h-4 w-4 ${config.color}`} />
          <div className="flex flex-col">
            <span className={`font-medium ${config.color}`}>
              {(phase === "tool_executing" || phase === "tool_completed") && currentToolName
                ? toolLabel(currentToolName)
                : config.label}
            </span>
            {(phase === "tool_executing" || phase === "tool_completed") && currentToolName && (
              <span className="text-xs text-neutral-400">
                {currentToolName}
              </span>
            )}
            {currentStep !== null && (
              <span className="text-xs text-neutral-400">
                Шаг {currentStep}
                {maxSteps ? ` из ≤${maxSteps}` : ""}
                {stepElapsed !== null && stepElapsed >= 5
                  ? ` · на шаге ${formatTime(stepElapsed)}`
                  : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Heartbeat indicator */}
          <Circle
            className={`h-2 w-2 ${
              heartbeatAlive
                ? "fill-green-400 text-green-400 animate-pulse"
                : "fill-red-400 text-red-400"
            }`}
          />
          <span className={`tabular-nums text-xs ${timerColor}`}>
            {formatTime(elapsed)}
            {budgetSec ? ` / ${formatTime(budgetSec)}` : ""}
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
    </div>
  );
}
