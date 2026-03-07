"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrgChartStore, type PnlDisplayMode } from "@/lib/store";
import { RefreshCw, Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  thresholds,
  setThresholds,
}: PnlFilterPanelProps) {
  const pnlDisplayMode = useOrgChartStore((s) => s.pnlDisplayMode);
  const setPnlDisplayMode = useOrgChartStore((s) => s.setPnlDisplayMode);
  const [thresholdDraft, setThresholdDraft] = useState(thresholds);

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

      {/* Threshold settings */}
      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost" title="Настройки порогов">
            <Settings className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Пороги цветовой шкалы</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["deepRed", "Тёмно-красный ≤"],
                ["red", "Красный ≤"],
                ["yellow", "Жёлтый ≤"],
                ["green", "Зелёный ≤"],
                ["deepGreen", "Тёмно-зелёный ≥"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  value={thresholdDraft[key]}
                  onChange={(e) =>
                    setThresholdDraft({
                      ...thresholdDraft,
                      [key]: Number(e.target.value),
                    })
                  }
                />
              </div>
            ))}
          </div>
          <Button
            size="sm"
            onClick={() => setThresholds(thresholdDraft)}
            className="mt-2"
          >
            Применить
          </Button>
        </DialogContent>
      </Dialog>

      {/* Calculated at */}
      {calculatedAt && (
        <span className="text-[10px] text-neutral-400">
          Рассчитано: {new Date(calculatedAt).toLocaleString("ru-RU")}
        </span>
      )}
    </div>
  );
}
