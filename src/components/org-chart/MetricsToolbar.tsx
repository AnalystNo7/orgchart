"use client";

import { useOrgChartStore } from "@/lib/store";
import type { MetricsMode } from "@/types";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChevronsDownUp, ChevronsUpDown, Undo2, Redo2 } from "lucide-react";

interface MetricsToolbarProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function MetricsToolbar({
  onExpandAll,
  onCollapseAll,
}: MetricsToolbarProps) {
  const {
    metricsMode,
    setMetricsMode,
    selectedLevels,
    toggleLevel,
    canUndo,
    canRedo,
    undoRedoLoading,
    undo,
    redo,
  } = useOrgChartStore();

  return (
    <div className="flex items-center gap-6 border-b bg-neutral-50 px-4 py-2">
      {/* Undo / Redo */}
      <div className="flex items-center gap-1 border-r pr-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={undo}
          disabled={!canUndo || undoRedoLoading}
          title="Отменить (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={redo}
          disabled={!canRedo || undoRedoLoading}
          title="Повторить (Ctrl+Y)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      <span className="text-sm font-medium text-neutral-700">
        Режим подсчёта:
      </span>
      <RadioGroup
        value={metricsMode}
        onValueChange={(v) => setMetricsMode(v as MetricsMode)}
        className="flex gap-4"
      >
        <div className="flex items-center gap-1.5">
          <RadioGroupItem value="own" id="mode-own" />
          <Label htmlFor="mode-own" className="cursor-pointer text-sm">
            Собственные
          </Label>
        </div>
        <div className="flex items-center gap-1.5">
          <RadioGroupItem value="selected_levels" id="mode-selected" />
          <Label htmlFor="mode-selected" className="cursor-pointer text-sm">
            Выбранные уровни
          </Label>
        </div>
        <div className="flex items-center gap-1.5">
          <RadioGroupItem value="all_descendants" id="mode-all" />
          <Label htmlFor="mode-all" className="cursor-pointer text-sm">
            Все подчиненные
          </Label>
        </div>
      </RadioGroup>

      {metricsMode === "selected_levels" && (
        <div className="flex items-center gap-3 border-l pl-4">
          {[1, 2, 3, 4].map((level) => (
            <div key={level} className="flex items-center gap-1">
              <Checkbox
                id={`level-${level}`}
                checked={selectedLevels.includes(level)}
                onCheckedChange={() => toggleLevel(level)}
              />
              <Label
                htmlFor={`level-${level}`}
                className="cursor-pointer text-xs"
              >
                L-{level}
              </Label>
            </div>
          ))}
        </div>
      )}

      <div className="ml-auto flex items-center gap-1 border-l pl-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onExpandAll}
          title="Развернуть всё"
        >
          <ChevronsUpDown className="mr-1 h-4 w-4" />
          Развернуть
        </Button>
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
