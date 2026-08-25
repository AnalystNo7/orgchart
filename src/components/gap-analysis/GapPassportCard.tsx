"use client";

import { Bot, ChevronDown } from "lucide-react";
import type { GapCategory, GapPriority, GapStatus } from "@prisma/client";

export interface GapPassportData {
  id: string;
  category: GapCategory;
  title: string;
  description: string;
  priority: GapPriority;
  impact: string | null;
  status: GapStatus;
  aiGenerated: boolean;
  aiRationale: string | null;
  estimatedEffort: string | null;
  affectedDepartmentIds: string[];
}

const CATEGORY_COLORS: Record<GapCategory, { bg: string; text: string; label: string }> = {
  STRUCTURE: { bg: "bg-blue-50", text: "text-blue-700", label: "Структура" },
  PROCESS: { bg: "bg-green-50", text: "text-green-700", label: "Процессы" },
  RESOURCE: { bg: "bg-orange-50", text: "text-orange-700", label: "Ресурсы" },
  COMPETENCY: { bg: "bg-warn-bg", text: "text-[#B7780A]", label: "Компетенции" },
  TECHNOLOGY: { bg: "bg-ink-100", text: "text-ink-600", label: "Технологии" },
};

const PRIORITY_COLORS: Record<GapPriority, { bg: string; text: string; label: string }> = {
  CRITICAL: { bg: "bg-red-100", text: "text-red-700", label: "Критический" },
  HIGH: { bg: "bg-orange-100", text: "text-orange-700", label: "Высокий" },
  MEDIUM: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Средний" },
  LOW: { bg: "bg-gray-100", text: "text-gray-700", label: "Низкий" },
};

const STATUS_LABELS: Record<GapStatus, string> = {
  IDENTIFIED: "Выявлен",
  IN_PROGRESS: "В работе",
  RESOLVED: "Устранён",
  DEFERRED: "Отложен",
};

interface GapPassportCardProps {
  gap: GapPassportData;
  onStatusChange: (id: string, status: GapStatus) => void;
  onDelete: (id: string) => void;
}

export function GapPassportCard({ gap, onStatusChange, onDelete }: GapPassportCardProps) {
  const cat = CATEGORY_COLORS[gap.category];
  const pri = PRIORITY_COLORS[gap.priority];

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cat.bg} ${cat.text}`}>
            {cat.label}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pri.bg} ${pri.text}`}>
            {pri.label}
          </span>
          {gap.aiGenerated && (
            <span className="inline-flex items-center gap-1 rounded-full bg-ai-bg px-2 py-0.5 text-xs font-medium text-ai">
              <Bot className="h-3 w-3" />
              AI
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <select
              value={gap.status}
              onChange={(e) => onStatusChange(gap.id, e.target.value as GapStatus)}
              className="appearance-none rounded border border-neutral-200 bg-white py-1 pl-2 pr-6 text-xs"
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-400" />
          </div>
          <button
            onClick={() => onDelete(gap.id)}
            className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500"
          >
            <span className="text-xs">×</span>
          </button>
        </div>
      </div>

      <h3 className="mt-2 text-sm font-semibold">{gap.title}</h3>
      <p className="mt-1 text-sm text-neutral-600">{gap.description}</p>

      {gap.impact && (
        <p className="mt-2 text-xs text-neutral-500">
          <span className="font-medium">Влияние:</span> {gap.impact}
        </p>
      )}

      {gap.aiRationale && (
        <p className="mt-1 text-xs text-ai">
          <span className="font-medium">Обоснование AI:</span> {gap.aiRationale}
        </p>
      )}

      {gap.estimatedEffort && (
        <p className="mt-1 text-xs text-neutral-500">
          <span className="font-medium">Трудозатраты:</span> {gap.estimatedEffort}
        </p>
      )}
    </div>
  );
}
