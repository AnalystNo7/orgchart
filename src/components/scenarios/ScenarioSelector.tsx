"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrgChartStore } from "@/lib/store";

interface Scenario {
  id: string;
  name: string;
  isBaseline: boolean;
  status: string;
  createdFrom: { id: string; name: string } | null;
}

const statusDotColor: Record<string, string> = {
  DRAFT: "bg-yellow-400",
  ACTIVE: "bg-green-400",
  ARCHIVED: "bg-neutral-400",
};

export function ScenarioSelector() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const { currentScenarioId, setCurrentScenarioId } = useOrgChartStore();

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((data: Scenario[]) => {
        setScenarios(data);
        if (!currentScenarioId && data.length > 0) {
          const baseline = data.find((s) => s.isBaseline);
          setCurrentScenarioId(baseline?.id ?? data[0].id);
        }
      })
      .catch(() => {});
  }, [currentScenarioId, setCurrentScenarioId]);

  if (scenarios.length === 0) return null;

  return (
    <Select value={currentScenarioId ?? undefined} onValueChange={setCurrentScenarioId}>
      <SelectTrigger className="w-[240px]">
        <SelectValue placeholder="Выберите сценарий" />
      </SelectTrigger>
      <SelectContent>
        {scenarios.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${statusDotColor[s.status] ?? "bg-neutral-300"}`} />
              <div className="flex flex-col items-start">
                <span>
                  {s.isBaseline ? "\u2605 " : ""}
                  {s.name}
                </span>
                {/* Pre-existing derived scenarios lack the reference in the
                    name; new clones carry it, so skip to avoid duplication. */}
                {s.createdFrom && !s.name.includes("(из:") && (
                  <span className="text-xs text-neutral-400">
                    из: {s.createdFrom.name}
                  </span>
                )}
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
