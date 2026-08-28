"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Thresholds {
  deepRed: number;
  red: number;
  yellow: number;
  green: number;
  deepGreen: number;
}

interface PnlLegendProps {
  thresholds: Thresholds;
  setThresholds: (t: Thresholds) => void;
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

const stops = [
  { color: "#991b1b", label: "deepRed" },
  { color: "#dc2626", label: "red" },
  { color: "#f59e0b", label: "yellow" },
  { color: "#22c55e", label: "green" },
  { color: "#15803d", label: "deepGreen" },
] as const;

const THRESHOLD_LABELS: Record<string, string> = {
  deepRed: "Тёмно-красный ≤",
  red: "Красный ≤",
  yellow: "Жёлтый ≤",
  green: "Зелёный ≤",
  deepGreen: "Тёмно-зелёный ≥",
};

export function PnlLegend({ thresholds, setThresholds }: PnlLegendProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Thresholds>(thresholds);

  const values = [
    thresholds.deepRed,
    thresholds.red,
    thresholds.yellow,
    thresholds.green,
    thresholds.deepGreen,
  ];

  function openDialog() {
    setDraft({ ...thresholds });
    setDialogOpen(true);
  }

  function applyThresholds() {
    setThresholds(draft);
    setDialogOpen(false);
  }

  return (
    <>
      <div
        className="absolute bottom-4 left-20 z-10 cursor-pointer rounded-lg border bg-white/90 px-3 py-2 shadow-sm backdrop-blur transition-colors hover:bg-white"
        onDoubleClick={openDialog}
        title="Двойной клик для редактирования порогов"
      >
        <div className="mb-1 text-[10px] font-medium text-neutral-500">
          Шкала P&L
        </div>
        <div className="flex items-center gap-0">
          {stops.map((stop, i) => (
            <div key={stop.label} className="flex flex-col items-center">
              <div
                className="h-3 w-12"
                style={{
                  backgroundColor: stop.color,
                  borderRadius:
                    i === 0
                      ? "4px 0 0 4px"
                      : i === stops.length - 1
                      ? "0 4px 4px 0"
                      : undefined,
                }}
              />
              <span className="mt-0.5 text-[9px] text-neutral-500">
                {formatNumber(values[i])}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Пороги цветовой шкалы</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(THRESHOLD_LABELS) as Array<keyof Thresholds>).map(
              (key) => (
                <div key={key}>
                  <Label className="text-xs">{THRESHOLD_LABELS[key]}</Label>
                  <MoneyInput
                    className="h-8 text-xs"
                    value={draft[key]}
                    onChange={(v) =>
                      setDraft({ ...draft, [key]: v ?? 0 })
                    }
                  />
                </div>
              )
            )}
          </div>
          <Button size="sm" onClick={applyThresholds} className="mt-2">
            Применить
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
