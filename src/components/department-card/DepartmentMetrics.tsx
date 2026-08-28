"use client";

import { Sigma } from "lucide-react";

interface MetricsProps {
  pp: number;
  opp: number;
  aup: number;
  totalFte: number;
  isAggregated?: boolean;
}

export function DepartmentMetrics({
  pp,
  opp,
  aup,
  totalFte,
  isAggregated,
}: MetricsProps) {
  const total = pp + opp + aup;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-medium text-neutral-700">Метрики</h3>
        {isAggregated && (
          <span title="Агрегированные данные">
            <Sigma className="h-3.5 w-3.5 text-amber-500" />
          </span>
        )}
      </div>
      <div className="rounded-md border p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Всего сотрудников:</span>
          <span className={isAggregated ? "font-medium italic" : "font-medium"}>
            {total}
          </span>
        </div>
        <div className="mt-1 space-y-0.5 border-l-2 border-neutral-200 pl-3">
          <div className="flex justify-between">
            <span className="text-neutral-700">ПП:</span>
            <span className={isAggregated ? "italic" : ""}>{pp}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-700">ОПП:</span>
            <span className={isAggregated ? "italic" : ""}>{opp}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-700">АУП:</span>
            <span className={isAggregated ? "italic" : ""}>{aup}</span>
          </div>
        </div>
        <div className="mt-1 flex justify-between border-t pt-1">
          <span className="text-neutral-500">Суммарный FTE:</span>
          <span className={isAggregated ? "font-medium italic" : "font-medium"}>
            {totalFte.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}
