"use client";

import { useEffect, useMemo, useState } from "react";
import { useOrgChartStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { X, AlertTriangle } from "lucide-react";

interface DepartmentLite {
  id: string;
  parentId: string | null;
  name: string;
}

interface TransferFlow {
  contractId: string;
  contractName: string;
  counterpartyDepartmentId: string;
  counterpartyDepartmentName: string;
  amount: number;
}

interface TransferBreakdown {
  externalRevenue: number;
  internalRevenue: number;
  ownCost: number;
  internalCost: number;
  sells: TransferFlow[];
  purchases: TransferFlow[];
}

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
  transferBreakdown: TransferBreakdown | null;
  warnings: Array<{ employeeId: string; fullName: string; message: string }> | null;
  calculatedAt: string;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(n);
}

// Hourly cost-rate: always 2 decimals, ru-RU thousands separator.
// E.g. 4480.483481154397 -> "4 480,48" (which is then rendered as "4 480,48 ₽/ч").
function formatCostRate(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function PnlDrillDown() {
  const deptId = useOrgChartStore((s) => s.pnlDrillDownDeptId);
  const scenarioId = useOrgChartStore((s) => s.currentScenarioId);
  const pnlDisplayMode = useOrgChartStore((s) => s.pnlDisplayMode);
  const pnlAllocationMode = useOrgChartStore((s) => s.pnlAllocationMode);
  const close = useOrgChartStore((s) => s.setPnlDrillDownDeptId);

  const [data, setData] = useState<DrillDownData | null>(null);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<DepartmentLite[]>([]);

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (!deptId || !scenarioId) return;
    setLoading(true);
    fetch(
      `/api/pnl/${deptId}?scenarioId=${scenarioId}&mode=${pnlDisplayMode}&periodStart=${currentYear}-01-01&periodEnd=${currentYear}-12-31&allocationMode=${pnlAllocationMode}`
    )
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [deptId, scenarioId, pnlDisplayMode, pnlAllocationMode, currentYear]);

  // Load departments list to resolve full parent chain for tooltips.
  // /api/departments already returns parentId — we just need id/parentId/name.
  useEffect(() => {
    if (!scenarioId) return;
    fetch(`/api/departments?scenarioId=${scenarioId}`)
      .then((r) => r.json())
      .then((raw: unknown) => {
        const list = Array.isArray(raw)
          ? (raw as Array<{ id: string; parentId: string | null; name: string }>)
          : ((raw as { departments?: unknown })?.departments as
              | Array<{ id: string; parentId: string | null; name: string }>
              | undefined) ?? [];
        setDepartments(
          list.map((d) => ({
            id: d.id,
            parentId: d.parentId ?? null,
            name: d.name,
          }))
        );
      })
      .catch(() => setDepartments([]));
  }, [scenarioId]);

  // Build full-path map: deptId → [rootName, ..., leafName]
  const deptPathMap = useMemo(() => {
    const byId = new Map(departments.map((d) => [d.id, d]));
    const cache = new Map<string, string[]>();
    function getPath(id: string): string[] {
      const cached = cache.get(id);
      if (cached) return cached;
      const d = byId.get(id);
      if (!d) {
        cache.set(id, []);
        return [];
      }
      const path = d.parentId ? [...getPath(d.parentId), d.name] : [d.name];
      cache.set(id, path);
      return path;
    }
    const result = new Map<string, string[]>();
    for (const d of departments) result.set(d.id, getPath(d.id));
    return result;
  }, [departments]);

  function pathString(id: string | null | undefined): string | null {
    if (!id) return null;
    const p = deptPathMap.get(id);
    if (!p || p.length === 0) return null;
    return p.join(" / ");
  }

  if (!deptId) return null;

  const shetilColors: Record<string, string> = {
    REVENUE: "text-teal-600",
    RESOURCE: "text-sky-600",
    SERVICE: "text-amber-600",
    BACKOFFICE: "text-red-600",
  };

  const currentPath = pathString(deptId);

  return (
    <div className="flex h-full w-[400px] flex-col border-l bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        {currentPath ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
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
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{currentPath}</TooltipContent>
          </Tooltip>
        ) : (
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
        )}
        <Button variant="ghost" size="sm" onClick={() => close(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
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

            {/* Transfer-price breakdown (only in allocationMode=transfer) */}
            {data.transferBreakdown && (
              <>
                <Separator />
                <div>
                  <h4 className="mb-2 text-xs font-semibold text-neutral-600">
                    Трансфертная цена — разбивка
                  </h4>
                  <div className="space-y-1 rounded-md border bg-white p-2 text-[11px]">
                    <div className="mb-1 text-[10px] font-medium uppercase text-neutral-400">
                      Выручка
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Внешняя (договоры)</span>
                      <span className="tabular-nums">
                        {formatCurrency(data.transferBreakdown.externalRevenue)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Внутренняя (TP-продажи)</span>
                      <span className="tabular-nums">
                        {formatCurrency(data.transferBreakdown.internalRevenue)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t pt-1 font-semibold">
                      <span>Итого выручка</span>
                      <span className="tabular-nums">
                        {formatCurrency(
                          data.transferBreakdown.externalRevenue +
                            data.transferBreakdown.internalRevenue
                        )}
                      </span>
                    </div>
                    <div className="mt-2 text-[10px] font-medium uppercase text-neutral-400">
                      Затраты
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Свои (сотрудники)</span>
                      <span className="tabular-nums">
                        {formatCurrency(data.transferBreakdown.ownCost)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Внутренние (TP-покупки)</span>
                      <span className="tabular-nums">
                        {formatCurrency(data.transferBreakdown.internalCost)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t pt-1 font-semibold">
                      <span>Итого затраты</span>
                      <span className="tabular-nums">
                        {formatCurrency(
                          data.transferBreakdown.ownCost +
                            data.transferBreakdown.internalCost
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* TP sells (for non-REVENUE departments) */}
                {data.transferBreakdown.sells.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold text-neutral-600">
                      TP-продажи ({data.transferBreakdown.sells.length})
                    </h4>
                    <div className="space-y-1">
                      {data.transferBreakdown.sells.map((f, i) => {
                        const path = pathString(f.counterpartyDepartmentId);
                        const card = (
                          <div
                            className="cursor-help rounded bg-emerald-50 px-2 py-1.5 text-[11px]"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{f.contractName}</span>
                              <span className="font-semibold text-emerald-700 tabular-nums">
                                {formatCurrency(f.amount)}
                              </span>
                            </div>
                            <div className="text-neutral-500">
                              Покупатель: {f.counterpartyDepartmentName}
                            </div>
                          </div>
                        );
                        const key = `${f.contractId}-${f.counterpartyDepartmentId}-${i}`;
                        return path ? (
                          <Tooltip key={key}>
                            <TooltipTrigger asChild>{card}</TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              {path}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <div key={key}>{card}</div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TP purchases (for REVENUE departments) */}
                {data.transferBreakdown.purchases.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold text-neutral-600">
                      TP-покупки ({data.transferBreakdown.purchases.length})
                    </h4>
                    <div className="space-y-1">
                      {data.transferBreakdown.purchases.map((f, i) => {
                        const path = pathString(f.counterpartyDepartmentId);
                        const card = (
                          <div
                            className="cursor-help rounded bg-rose-50 px-2 py-1.5 text-[11px]"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{f.contractName}</span>
                              <span className="font-semibold text-rose-700 tabular-nums">
                                {formatCurrency(f.amount)}
                              </span>
                            </div>
                            <div className="text-neutral-500">
                              Продавец: {f.counterpartyDepartmentName}
                            </div>
                          </div>
                        );
                        const key = `${f.contractId}-${f.counterpartyDepartmentId}-${i}`;
                        return path ? (
                          <Tooltip key={key}>
                            <TooltipTrigger asChild>{card}</TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              {path}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <div key={key}>{card}</div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

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
                          {emp.position} · FTE {emp.fte} · {formatCostRate(emp.costRate)} ₽/ч
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
