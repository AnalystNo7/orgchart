"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompareView } from "@/components/compare/CompareView";

interface Scenario {
  id: string;
  name: string;
  isBaseline: boolean;
}

function CompareContent() {
  const searchParams = useSearchParams();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [leftId, setLeftId] = useState(searchParams.get("left") ?? "");
  const [rightId, setRightId] = useState(searchParams.get("right") ?? "");

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((data: Scenario[]) => {
        setScenarios(data);
        if (!leftId && data.length > 0) {
          const baseline = data.find((s) => s.isBaseline);
          if (baseline) setLeftId(baseline.id);
        }
        if (!rightId && data.length > 1) {
          const nonBaseline = data.find((s) => !s.isBaseline);
          if (nonBaseline) setRightId(nonBaseline.id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b px-6 py-3">
        <span className="text-sm font-medium">Левый:</span>
        <Select value={leftId} onValueChange={setLeftId}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Выберите сценарий" />
          </SelectTrigger>
          <SelectContent>
            {scenarios.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.isBaseline ? "\u2605 " : ""}
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm font-medium">Правый:</span>
        <Select value={rightId} onValueChange={setRightId}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Выберите сценарий" />
          </SelectTrigger>
          <SelectContent>
            {scenarios.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.isBaseline ? "\u2605 " : ""}
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1">
        {leftId && rightId ? (
          <CompareView leftScenarioId={leftId} rightScenarioId={rightId} />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-400">
            Выберите два сценария для сравнения
          </div>
        )}
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-neutral-400">Загрузка...</div>}>
      <CompareContent />
    </Suspense>
  );
}
