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
}

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
            {s.isBaseline ? "\u2605 " : ""}
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
