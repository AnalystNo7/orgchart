"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useOrgChartStore,
  type PnlDisplayMode,
  type PnlAllocationMode,
} from "@/lib/store";
import {
  RefreshCw,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ALLOCATION_ORDER: readonly PnlAllocationMode[] = ["fte", "transfer", "earning"] as const;

const ALLOCATION_LABELS: Record<PnlAllocationMode, string> = {
  fte: "По FTE",
  transfer: "Трансфертная цена",
  earning: "Только зарабатывающие",
};

const ALLOCATION_HINTS: Record<PnlAllocationMode, string> = {
  fte: "Выручка договора делится между подразделениями пропорционально FTE их сотрудников, закреплённых в EmployeeContract.",
  transfer:
    "Ресурсные/сервисные подразделения «продают» FTE по тарифу: Tariff.rate × FTE × часы × overlap. Сумма договора не используется.",
  earning:
    "Выручка начисляется только зарабатывающим (REVENUE) подразделениям. Ресурсные и сервисные получают только затраты — baseline-режим.",
};

interface PnlFilterPanelProps {
  periodStart: string;
  periodEnd: string;
  setPeriodStart: (v: string) => void;
  setPeriodEnd: (v: string) => void;
  loading: boolean;
  calculatedAt: string | null;
  onRecalculate: () => void;
  thresholds: {
    deepRed: number;
    red: number;
    yellow: number;
    green: number;
    deepGreen: number;
  };
  setThresholds: (t: {
    deepRed: number;
    red: number;
    yellow: number;
    green: number;
    deepGreen: number;
  }) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onExpandToLevel: (level: number) => void;
}

export function PnlFilterPanel({
  periodStart,
  periodEnd,
  setPeriodStart,
  setPeriodEnd,
  loading,
  calculatedAt,
  onRecalculate,
  onExpandAll,
  onCollapseAll,
  onExpandToLevel,
}: PnlFilterPanelProps) {
  const pnlDisplayMode = useOrgChartStore((s) => s.pnlDisplayMode);
  const setPnlDisplayMode = useOrgChartStore((s) => s.setPnlDisplayMode);
  const allocationMode = useOrgChartStore((s) => s.pnlAllocationMode);
  const setAllocationMode = useOrgChartStore((s) => s.setPnlAllocationMode);

  const planActive = pnlDisplayMode === "plan" || pnlDisplayMode === "combined";
  const forecastActive = pnlDisplayMode === "forecast" || pnlDisplayMode === "combined";

  function togglePlan() {
    if (planActive && forecastActive) {
      setPnlDisplayMode("forecast");
    } else if (planActive) {
      // Can't deactivate the only active button
      return;
    } else {
      setPnlDisplayMode(forecastActive ? "combined" : "plan");
    }
  }

  function toggleForecast() {
    if (forecastActive && planActive) {
      setPnlDisplayMode("plan");
    } else if (forecastActive) {
      // Can't deactivate the only active button
      return;
    } else {
      setPnlDisplayMode(planActive ? "combined" : "forecast");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-neutral-50 px-4 py-2">
      {/* Mode toggle buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant={planActive ? "default" : "outline"}
          size="sm"
          onClick={togglePlan}
        >
          План
        </Button>
        <Button
          variant={forecastActive ? "default" : "outline"}
          size="sm"
          onClick={toggleForecast}
        >
          Прогноз
        </Button>
      </div>

      {/* Allocation mode buttons */}
      <TooltipProvider>
        <div className="flex items-center gap-1 border-l pl-3">
          {ALLOCATION_ORDER.map((m) => (
            <Tooltip key={m}>
              <TooltipTrigger asChild>
                <Button
                  variant={allocationMode === m ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAllocationMode(m)}
                >
                  {ALLOCATION_LABELS[m]}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {ALLOCATION_HINTS[m]}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      {/* Period pickers */}
      <div className="flex items-center gap-2">
        <Label className="text-xs">с</Label>
        <Input
          type="date"
          className="h-8 w-36 text-xs"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
        />
        <Label className="text-xs">по</Label>
        <Input
          type="date"
          className="h-8 w-36 text-xs"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
        />
      </div>

      {/* Recalculate */}
      <Button
        size="sm"
        variant="outline"
        onClick={onRecalculate}
        disabled={loading}
      >
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Расчёт..." : "Пересчитать"}
      </Button>

      {/* Calculated at */}
      {calculatedAt && (
        <span className="text-[10px] text-neutral-400">
          Рассчитано: {new Date(calculatedAt).toLocaleString("ru-RU")}
        </span>
      )}

      {/* Level / Collapse controls */}
      <div className="ml-auto flex items-center gap-1 border-l pl-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" title="Показать до уровня">
              <ChevronsUpDown className="mr-1 h-4 w-4" />
              Уровень
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onExpandToLevel(1)}>
              L1 — Только блоки
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExpandToLevel(2)}>
              L2 — Подразделения
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExpandToLevel(3)}>
              L3 — Дочерние подразделения
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExpandAll}>
              Все уровни
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCollapseAll}
          title="Свернуть всё"
        >
          <ChevronsDownUp className="mr-1 h-4 w-4" />
          Свернуть
        </Button>
      </div>
    </div>
  );
}
