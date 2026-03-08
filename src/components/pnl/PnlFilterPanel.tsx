"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrgChartStore, type PnlDisplayMode } from "@/lib/store";
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

const MODE_LABELS: Record<PnlDisplayMode, string> = {
  plan: "План",
  forecast: "Факт (заключённые)",
  combined: "План + Факт",
};

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

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-neutral-50 px-4 py-2">
      {/* Mode selector */}
      <div className="flex items-center gap-1">
        {(Object.keys(MODE_LABELS) as PnlDisplayMode[]).map((mode) => (
          <Button
            key={mode}
            variant={pnlDisplayMode === mode ? "default" : "outline"}
            size="sm"
            onClick={() => setPnlDisplayMode(mode)}
          >
            {MODE_LABELS[mode]}
          </Button>
        ))}
      </div>

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
