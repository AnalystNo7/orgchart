"use client";

interface MetricsProps {
  pp: number;
  opp: number;
  aup: number;
  totalFte: number;
}

export function DepartmentMetrics({ pp, opp, aup, totalFte }: MetricsProps) {
  const total = pp + opp + aup;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-neutral-700">Метрики</h3>
      <div className="rounded-md border p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Всего сотрудников:</span>
          <span className="font-medium">{total}</span>
        </div>
        <div className="mt-1 space-y-0.5 border-l-2 border-neutral-200 pl-3">
          <div className="flex justify-between">
            <span className="text-green-600">ПП:</span>
            <span>{pp}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-blue-600">ОПП:</span>
            <span>{opp}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-red-600">АУП:</span>
            <span>{aup}</span>
          </div>
        </div>
        <div className="mt-1 flex justify-between border-t pt-1">
          <span className="text-neutral-500">Суммарный FTE:</span>
          <span className="font-medium">{totalFte.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}
