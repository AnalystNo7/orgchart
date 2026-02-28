"use client";

import { useOrgChartStore } from "@/lib/store";
import type { MetricsMode } from "@/types";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function MetricsToolbar() {
  const { metricsMode, setMetricsMode, selectedLevels, toggleLevel } =
    useOrgChartStore();

  return (
    <div className="flex items-center gap-6 border-b bg-neutral-50 px-4 py-2">
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
    </div>
  );
}
