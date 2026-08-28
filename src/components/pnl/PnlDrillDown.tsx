"use client";

import { useEffect, useState } from "react";
import { useOrgChartStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { X, AlertTriangle } from "lucide-react";

interface DrillDownData {
  departmentId: string;
  departmentName: string;
  shetilType: string;
  revenue: number;
  cost: number;
  pnl: number;
  details: {
    employees: Array<{
      employeeId: string;
      fullName: string;
      position: string;
      costRate: number;
      fte: number;
      workingHours: number;
      totalCost: number;
    }>;
    contracts: Array<{
      contractId: string;
      contractName: string;
      status: string;
      totalAmount: number;
      periodOverlapFraction: number;
      departmentFteFraction: number;
      allocatedRevenue: number;
    }>;
    childrenPnl: number;
    totalPnl: number;
  };
  warnings: Array<{ employeeId: string; fullName: string; message: string }> | null;
  calculatedAt: string;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(n);
}

export function PnlDrillDown() {
  const deptId = useOrgChartStore((s) => s.pnlDrillDownDeptId);
  const scenarioId = useOrgChartStore((s) => s.currentScenarioId);
  const pnlDisplayMode = useOrgChartStore((s) => s.pnlDisplayMode);
  const close = useOrgChartStore((s) => s.setPnlDrillDownDeptId);

  const [data, setData] = useState<DrillDownData | null>(null);
  const [loading, setLoading] = useState(false);

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (!deptId || !scenarioId) return;
    setLoading(true);
    fetch(
      `/api/pnl/${deptId}?scenarioId=${scenarioId}&mode=${pnlDisplayMode}&periodStart=${currentYear}-01-01&periodEnd=${currentYear}-12-31`
    )
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [deptId, scenarioId, pnlDisplayMode, currentYear]);

  if (!deptId) return null;

  const shetilColors: Record<string, string> = {
    REVENUE: "text-teal-600",
    RESOURCE: "text-sky-600",
    SERVICE: "text-amber-600",
    BACKOFFICE: "text-red-600",
  };

  return (
    <div className="w-[400px] border-l bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">
            {data?.departmentName ?? "Загрузка..."}
          </h3>
          {data && (
            <span
              className={`text-xs ${shetilColors[data.shetilType] ?? "text-neutral-500"}`}
            >
              {data.shetilType}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => close(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-120px)]">
        {loading && (
          <div className="p-4 text-sm text-neutral-400">Загрузка...</div>
        )}
        {!loading && !data && (
          <div className="p-4 text-sm text-neutral-400">
            Нет данных. Сначала выполните расчёт.
          </div>
        )}
        {!loading && data && (
          <div className="space-y-4 p-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md bg-green-50 p-2 text-center">
                <div className="text-xs text-green-600">Выручка</div>
                <div className="text-sm font-semibold text-green-700">
                  {formatCurrency(data.revenue)}
                </div>
              </div>
              <div className="rounded-md bg-red-50 p-2 text-center">
                <div className="text-xs text-red-600">Затраты</div>
                <div className="text-sm font-semibold text-red-700">
                  {formatCurrency(data.cost)}
                </div>
              </div>
              <div
                className={`rounded-md p-2 text-center ${
                  data.pnl >= 0 ? "bg-green-50" : "bg-red-50"
                }`}
              >
                <div
                  className={`text-xs ${
                    data.pnl >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  P&L (своё)
                </div>
                <div
                  className={`text-sm font-semibold ${
                    data.pnl >= 0 ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {formatCurrency(data.pnl)}
                </div>
              </div>
            </div>

            {data.details.childrenPnl !== 0 && (
              <div className="flex justify-between rounded-md bg-neutral-50 px-3 py-2 text-xs">
                <span>P&L дочерних:</span>
                <span className="font-semibold">
                  {formatCurrency(data.details.childrenPnl)}
                </span>
              </div>
            )}
            <div className="flex justify-between rounded-md bg-neutral-100 px-3 py-2 text-xs font-semibold">
              <span>Итого P&L:</span>
              <span
                className={
                  data.details.totalPnl >= 0 ? "text-green-700" : "text-red-700"
                }
              >
                {formatCurrency(data.details.totalPnl)}
              </span>
            </div>

            {/* Warnings */}
            {data.warnings && data.warnings.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Предупреждения ({data.warnings.length})
                  </h4>
                  <div className="space-y-1">
                    {data.warnings.map((w, i) => (
                      <div
                        key={i}
                        className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700"
                      >
                        <span className="font-medium">{w.fullName}:</span>{" "}
                        {w.message}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Employees (costs) */}
            <Separator />
            <div>
              <h4 className="mb-2 text-xs font-semibold text-neutral-600">
                Затраты по сотрудникам ({data.details.employees.length})
              </h4>
              {data.details.employees.length === 0 ? (
                <div className="text-xs text-neutral-400">Нет данных</div>
              ) : (
                <div className="space-y-1">
                  {data.details.employees.map((emp) => (
                    <div
                      key={emp.employeeId}
                      className="flex items-center justify-between rounded bg-neutral-50 px-2 py-1.5 text-[11px]"
                    >
                      <div>
                        <div className="font-medium">{emp.fullName}</div>
                        <div className="text-neutral-400">
                          {emp.position} · FTE {emp.fte} · {emp.costRate}₽/ч
                        </div>
                      </div>
                      <div className="font-semibold text-red-600">
                        {formatCurrency(emp.totalCost)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contracts (revenue) */}
            <Separator />
            <div>
              <h4 className="mb-2 text-xs font-semibold text-neutral-600">
                Контракты выручки ({data.details.contracts.length})
              </h4>
              {data.details.contracts.length === 0 ? (
                <div className="text-xs text-neutral-400">
                  Нет контрактов (не зарабатывающее подразделение)
                </div>
              ) : (
                <div className="space-y-1">
                  {data.details.contracts.map((c) => (
                    <div
                      key={c.contractId}
                      className="rounded bg-neutral-50 px-2 py-1.5 text-[11px]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{c.contractName}</span>
                        <span className="font-semibold text-green-600">
                          {formatCurrency(c.allocatedRevenue)}
                        </span>
                      </div>
                      <div className="text-neutral-400">
                        {c.status === "CONCLUDED" ? "Заключён" : "Планируемый"}{" "}
                        · Сумма {formatCurrency(c.totalAmount)} · Доля FTE{" "}
                        {(c.departmentFteFraction * 100).toFixed(1)}% · Период{" "}
                        {(c.periodOverlapFraction * 100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
