"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { SHETIL_CONFIG } from "@/types";
import type { ShetilType } from "@prisma/client";

interface BulkActionsBarProps {
  scenarioId: string;
  selectedIds: string[];
  onApplied: () => void;
  onClear: () => void;
}

const SHETIL_TYPES = Object.keys(SHETIL_CONFIG) as ShetilType[];

/**
 * Плавающая панель массовых действий над выделенными блоками канваса.
 * Сейчас — только смена типа ШЕТИЛ; новые действия добавляются кнопками рядом.
 */
export function BulkActionsBar({
  scenarioId,
  selectedIds,
  onApplied,
  onClear,
}: BulkActionsBarProps) {
  const [applying, setApplying] = useState<ShetilType | null>(null);

  async function applyType(shetilType: ShetilType) {
    setApplying(shetilType);
    const res = await fetch("/api/departments/bulk-type", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId, departmentIds: selectedIds, shetilType }),
    });
    setApplying(null);
    if (!res.ok) {
      alert("Не удалось сменить тип у выбранных подразделений");
      return;
    }
    onApplied();
  }

  return (
    <div className="pointer-events-auto absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-[var(--r-lg)] border border-line bg-white px-4 py-2.5 shadow-pop">
      <span className="whitespace-nowrap text-[13px] font-semibold text-ink-800">
        Выбрано: {selectedIds.length}
      </span>
      <span className="h-5 w-px bg-line" />
      <span className="whitespace-nowrap text-[12.5px] text-ink-500">Сменить тип:</span>
      <div className="flex items-center gap-1.5">
        {SHETIL_TYPES.map((type) => (
          <button
            key={type}
            disabled={applying !== null}
            onClick={() => applyType(type)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400 hover:bg-ink-50 disabled:opacity-50"
            title={`Назначить тип «${SHETIL_CONFIG[type].label}»`}
          >
            {applying === type ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SHETIL_CONFIG[type].color }}
              />
            )}
            {SHETIL_CONFIG[type].label}
          </button>
        ))}
      </div>
      <span className="h-5 w-px bg-line" />
      <button
        onClick={onClear}
        className="rounded-[var(--r-xs)] p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
        title="Снять выделение"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
