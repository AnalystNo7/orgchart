"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Download,
  Upload,
  Search,
  MoreHorizontal,
  Eye,
  EyeOff,
  AlertTriangle,
} from "lucide-react";
import { EditableHeader } from "@/components/employees/EditableHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ContractForm } from "@/components/contracts/ContractForm";
import { useOrgChartStore } from "@/lib/store";
import {
  CONTRACT_TYPE_LABELS,
  CONTRACT_STATUS_LABELS,
} from "@/types";
import type { ContractType, ContractStatus } from "@prisma/client";
import * as XLSX from "xlsx";

interface Contract {
  id: string;
  name: string;
  type: ContractType;
  status: ContractStatus;
  amount: number | string | null;
  expectedAmount: number | string | null;
  amountAutoCalc: boolean;
  periodStart: string;
  periodEnd: string;
  description: string | null;
  _count: { employees: number };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ru-RU");
}

function TruncatedCell({ text, maxWidth = "max-w-[200px]" }: { text: string; maxWidth?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`block ${maxWidth} truncate`}>{text}</span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs">{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}

const CONTRACT_COLUMN_DEFAULTS: Record<string, string> = {
  name: "Наименование",
  type: "Вид",
  status: "Признак",
  amount: "Сумма",
  period: "Период",
  description: "Описание",
  employees: "Сотр.",
};

const CONTRACT_STORAGE_KEY = "contract-column-names";

// localStorage key for per-scenario exclusions.
// Shape: { [scenarioId]: string[] }  — list of excluded contract ids.
// A fallback "__global" key is used when no scenario is selected.
const EXCLUDED_STORAGE_KEY = "excludedContractIdsPerScenario";
const EXCLUDED_GLOBAL_FALLBACK = "__global";

function readExcludedMap(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(EXCLUDED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeExcludedMap(map: Record<string, string[]>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(EXCLUDED_STORAGE_KEY, JSON.stringify(map));
}

// Returns the raw amount used for totals (respects CONCLUDED/PLANNED fallback).
function getContractAmount(c: Contract): number {
  if (c.status === "CONCLUDED" && c.amount != null) return Number(c.amount);
  if (c.status === "PLANNED" && c.expectedAmount != null)
    return Number(c.expectedAmount);
  return 0;
}

interface SumBreakdown {
  concluded: number;
  planned: number;
  total: number;
}

interface TotalsSummary {
  revenue: SumBreakdown;
  expense: SumBreakdown;
  delta: number;
  includedCount: number;
  excludedCount: number;
  excludedAmount: number; // absolute sum of excluded (revenue+expense) for the plaque
}

function emptyBreakdown(): SumBreakdown {
  return { concluded: 0, planned: 0, total: 0 };
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    Math.round(n)
  );
}

export default function ContractsPage() {
  const currentScenarioId = useOrgChartStore((s) => s.currentScenarioId);

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [editingDescId, setEditingDescId] = useState<string | null>(null);
  const [editingDescValue, setEditingDescValue] = useState("");
  const [columnNames, setColumnNames] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(CONTRACT_STORAGE_KEY) || "{}");
    } catch { return {}; }
  });

  // Per-scenario exclusions (localStorage-persistent).
  const scenarioKey = currentScenarioId ?? EXCLUDED_GLOBAL_FALLBACK;
  const [excludedMap, setExcludedMap] = useState<Record<string, string[]>>(
    () => readExcludedMap()
  );
  const excludedSet = useMemo(
    () => new Set(excludedMap[scenarioKey] ?? []),
    [excludedMap, scenarioKey]
  );

  function toggleExcluded(contractId: string) {
    setExcludedMap((prev) => {
      const current = new Set(prev[scenarioKey] ?? []);
      if (current.has(contractId)) current.delete(contractId);
      else current.add(contractId);
      const next = { ...prev, [scenarioKey]: Array.from(current) };
      writeExcludedMap(next);
      return next;
    });
  }

  function setExcludedForScenario(ids: string[]) {
    setExcludedMap((prev) => {
      const next = { ...prev, [scenarioKey]: ids };
      writeExcludedMap(next);
      return next;
    });
  }

  function resetExclusions() {
    setExcludedForScenario([]);
  }

  // Master toggle: if every visible row is excluded → include all; otherwise exclude all.
  function toggleAllVisible(visibleIds: string[]) {
    const allExcluded = visibleIds.every((id) => excludedSet.has(id));
    if (allExcluded) {
      // Unexclude all visible
      const next = new Set(excludedSet);
      for (const id of visibleIds) next.delete(id);
      setExcludedForScenario(Array.from(next));
    } else {
      // Exclude all visible
      const next = new Set(excludedSet);
      for (const id of visibleIds) next.add(id);
      setExcludedForScenario(Array.from(next));
    }
  }

  function getColName(id: string) {
    return columnNames[id] ?? CONTRACT_COLUMN_DEFAULTS[id] ?? id;
  }

  function renameColumn(id: string, name: string) {
    setColumnNames((prev) => {
      const next = { ...prev, [id]: name };
      localStorage.setItem(CONTRACT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchContracts = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const res = await fetch(`/api/contracts?${params}`);
    if (res.ok) setContracts(await res.json());
  }, [search]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  // Sum breakdown over currently visible contracts (backend already filters
  // by search). Excluded contracts don't contribute to totals but stay in
  // the visible list (crossed out).
  const totals: TotalsSummary = useMemo(() => {
    const res: TotalsSummary = {
      revenue: emptyBreakdown(),
      expense: emptyBreakdown(),
      delta: 0,
      includedCount: 0,
      excludedCount: 0,
      excludedAmount: 0,
    };
    for (const c of contracts) {
      const amt = getContractAmount(c);
      const isExcluded = excludedSet.has(c.id);
      if (isExcluded) {
        res.excludedCount += 1;
        res.excludedAmount += amt;
        continue;
      }
      res.includedCount += 1;
      const bucket = c.type === "REVENUE" ? res.revenue : res.expense;
      if (c.status === "CONCLUDED") bucket.concluded += amt;
      else if (c.status === "PLANNED") bucket.planned += amt;
      bucket.total += amt;
    }
    res.delta = res.revenue.total - res.expense.total;
    return res;
  }, [contracts, excludedSet]);

  // Are all currently visible contracts excluded?
  const allVisibleExcluded = useMemo(() => {
    if (contracts.length === 0) return false;
    return contracts.every((c) => excludedSet.has(c.id));
  }, [contracts, excludedSet]);

  async function saveDescription(id: string) {
    await fetch(`/api/contracts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: editingDescValue || null }),
    });
    setEditingDescId(null);
    fetchContracts();
  }

  async function handleAdd(data: {
    name: string;
    type: "REVENUE" | "EXPENSE";
    status: "CONCLUDED" | "PLANNED";
    amount: number | null;
    expectedAmount: number | null;
    amountAutoCalc: boolean;
    periodStart: string;
    periodEnd: string;
    description: string;
  }) {
    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        description: data.description || null,
      }),
    });
    if (!res.ok) {
      alert("Ошибка при создании договора");
      return;
    }
    setShowAdd(false);
    fetchContracts();
  }

  async function handleEdit(data: {
    name: string;
    type: "REVENUE" | "EXPENSE";
    status: "CONCLUDED" | "PLANNED";
    amount: number | null;
    expectedAmount: number | null;
    amountAutoCalc: boolean;
    periodStart: string;
    periodEnd: string;
    description: string;
  }) {
    if (!editingContract) return;
    const res = await fetch(`/api/contracts/${editingContract.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        description: data.description || null,
      }),
    });
    if (!res.ok) {
      alert("Ошибка при сохранении договора");
      return;
    }
    setEditingContract(null);
    fetchContracts();
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить договор?")) return;
    await fetch(`/api/contracts/${id}`, { method: "DELETE" });
    fetchContracts();
  }

  function handleExport() {
    const wsData = contracts.map((c) => ({
      "Наименование": c.name,
      "Вид": CONTRACT_TYPE_LABELS[c.type],
      "Признак": CONTRACT_STATUS_LABELS[c.status],
      "Сумма": c.amount ? Number(c.amount) : "",
      "Ожидаемая сумма": c.expectedAmount ? Number(c.expectedAmount) : "",
      "Дата начала": formatDate(c.periodStart),
      "Дата окончания": formatDate(c.periodEnd),
      "Описание": c.description ?? "",
      "Исключено из суммы": excludedSet.has(c.id) ? "Да" : "Нет",
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Договоры");
    XLSX.writeFile(wb, "contracts.xlsx");
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

    for (const row of rows) {
      const name = String(row["Наименование"] ?? "").trim();
      if (!name) continue;

      const typeLabel = String(row["Вид"] ?? "").trim();
      const type = typeLabel === "Расходный" ? "EXPENSE" : "REVENUE";

      const statusLabel = String(row["Признак"] ?? "").trim();
      const status = statusLabel === "Планируемый" ? "PLANNED" : "CONCLUDED";

      const amount = row["Сумма"] ? Number(row["Сумма"]) : null;
      const expectedAmount = row["Ожидаемая сумма"] ? Number(row["Ожидаемая сумма"]) : null;

      const periodStart = String(row["Дата начала"] ?? "");
      const periodEnd = String(row["Дата окончания"] ?? "");
      const description = String(row["Описание"] ?? "") || null;

      if (!periodStart || !periodEnd) continue;

      await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, type, status, amount, expectedAmount,
          periodStart, periodEnd, description,
        }),
      });
    }

    fetchContracts();
    e.target.value = "";
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Договоры</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Экспорт
          </Button>
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              <Upload className="mr-2 h-4 w-4" />
              Импорт
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImport}
              />
            </label>
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Добавить
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          placeholder="Поиск по наименованию..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <TooltipProvider>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[44px] text-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() =>
                          toggleAllVisible(contracts.map((c) => c.id))
                        }
                        className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-neutral-100"
                        aria-label="Переключить все видимые"
                      >
                        {allVisibleExcluded ? (
                          <EyeOff className="h-4 w-4 text-neutral-400" />
                        ) : (
                          <Eye className="h-4 w-4 text-neutral-600" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {allVisibleExcluded
                          ? "Вернуть все видимые в сумму"
                          : "Исключить все видимые из суммы"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead>
                  <EditableHeader value={getColName("name")} onSave={(v) => renameColumn("name", v)} />
                </TableHead>
                <TableHead className="w-[110px]">
                  <EditableHeader value={getColName("type")} onSave={(v) => renameColumn("type", v)} />
                </TableHead>
                <TableHead className="w-[130px]">
                  <EditableHeader value={getColName("status")} onSave={(v) => renameColumn("status", v)} />
                </TableHead>
                <TableHead className="w-[140px]">
                  <EditableHeader value={getColName("amount")} onSave={(v) => renameColumn("amount", v)} />
                </TableHead>
                <TableHead className="w-[140px]">
                  <EditableHeader value={getColName("period")} onSave={(v) => renameColumn("period", v)} />
                </TableHead>
                <TableHead className="w-[80px]">
                  <EditableHeader value={getColName("employees")} onSave={(v) => renameColumn("employees", v)} />
                </TableHead>
                <TableHead>
                  <EditableHeader value={getColName("description")} onSave={(v) => renameColumn("description", v)} />
                </TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    Нет данных
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((contract) => {
                  const isExcluded = excludedSet.has(contract.id);
                  const rowClass = isExcluded
                    ? "opacity-50 [&>td]:line-through"
                    : "";
                  return (
                    <TableRow key={contract.id} className={rowClass}>
                      <TableCell className="text-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => toggleExcluded(contract.id)}
                              className="inline-flex h-6 w-6 items-center justify-center rounded no-underline hover:bg-neutral-100"
                              aria-label={
                                isExcluded
                                  ? "Вернуть в сумму"
                                  : "Исключить из суммы"
                              }
                            >
                              {isExcluded ? (
                                <EyeOff className="h-4 w-4 text-neutral-400" />
                              ) : (
                                <Eye className="h-4 w-4 text-neutral-600" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              {isExcluded
                                ? "Вернуть в сумму"
                                : "Исключить из суммы"}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <TruncatedCell text={contract.name} maxWidth="max-w-[250px]" />
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={
                          contract.type === "REVENUE"
                            ? "bg-green-100 text-green-800"
                            : "bg-orange-100 text-orange-800"
                        }>
                          {CONTRACT_TYPE_LABELS[contract.type]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {CONTRACT_STATUS_LABELS[contract.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {contract.status === "CONCLUDED" && contract.amount
                          ? Number(contract.amount).toLocaleString("ru-RU") + " ₽"
                          : contract.status === "PLANNED" && contract.expectedAmount
                          ? Number(contract.expectedAmount).toLocaleString("ru-RU") + " ₽"
                          : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(contract.periodStart)} – {formatDate(contract.periodEnd)}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {contract._count.employees}
                      </TableCell>
                      <TableCell>
                        {editingDescId === contract.id ? (
                          <Input
                            value={editingDescValue}
                            onChange={(e) => setEditingDescValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveDescription(contract.id);
                              if (e.key === "Escape") setEditingDescId(null);
                            }}
                            onBlur={() => saveDescription(contract.id)}
                            className="h-8"
                            autoFocus
                          />
                        ) : (
                          <span
                            className="block max-w-[200px] cursor-pointer truncate hover:text-blue-600"
                            onClick={() => {
                              setEditingDescId(contract.id);
                              setEditingDescValue(contract.description ?? "");
                            }}
                          >
                            {contract.description ? (
                              <TruncatedCell text={contract.description} maxWidth="max-w-[200px]" />
                            ) : (
                              <span className="text-neutral-300">—</span>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                setEditingContract({
                                  ...contract,
                                  periodStart: new Date(contract.periodStart).toISOString().split("T")[0],
                                  periodEnd: new Date(contract.periodEnd).toISOString().split("T")[0],
                                })
                              }
                            >
                              Редактировать
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDelete(contract.id)}
                            >
                              Удалить
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>

      {/* Sticky summary footer */}
      <div className="sticky bottom-0 z-10 -mx-6 border-t bg-white/95 px-6 py-3 backdrop-blur shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.08)]">
        {totals.excludedCount > 0 && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1">
              Исключено {totals.excludedCount}{" "}
              {totals.excludedCount === 1 ? "договор" : "договоров"} на сумму{" "}
              <span className="font-semibold tabular-nums">
                {fmtMoney(totals.excludedAmount)} ₽
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-amber-900 hover:bg-amber-100"
              onClick={resetExclusions}
            >
              Вернуть все
            </Button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <SummaryBlock
            label="Выручка"
            colorClass="text-green-700"
            breakdown={totals.revenue}
          />
          <SummaryBlock
            label="Расходы"
            colorClass="text-orange-700"
            breakdown={totals.expense}
          />
          <div className="rounded-md border bg-neutral-50 px-3 py-2">
            <div className="text-[10px] font-medium uppercase text-neutral-500">
              Дельта (Выручка − Расходы)
            </div>
            <div
              className={`mt-0.5 text-base font-bold tabular-nums ${
                totals.delta >= 0 ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {fmtMoney(totals.delta)} ₽
            </div>
            <div className="text-[10px] text-neutral-400">
              Учтено {totals.includedCount}
              {totals.excludedCount > 0
                ? ` из ${totals.includedCount + totals.excludedCount}`
                : ""}{" "}
              {totals.includedCount === 1 ? "договор" : "договоров"}
            </div>
          </div>
        </div>
      </div>

      <ContractForm
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={handleAdd}
        title="Добавить договор"
      />

      {editingContract && (
        <ContractForm
          open={!!editingContract}
          onClose={() => setEditingContract(null)}
          onSubmit={handleEdit}
          contractId={editingContract.id}
          defaultValues={{
            name: editingContract.name,
            type: editingContract.type,
            status: editingContract.status,
            amount: editingContract.amount != null ? Number(editingContract.amount) : null,
            expectedAmount: editingContract.expectedAmount != null ? Number(editingContract.expectedAmount) : null,
            amountAutoCalc: editingContract.amountAutoCalc,
            periodStart: editingContract.periodStart,
            periodEnd: editingContract.periodEnd,
            description: editingContract.description ?? "",
          }}
          title="Редактировать договор"
        />
      )}
    </div>
  );
}

function SummaryBlock({
  label,
  colorClass,
  breakdown,
}: {
  label: string;
  colorClass: string;
  breakdown: SumBreakdown;
}) {
  return (
    <div className="rounded-md border bg-neutral-50 px-3 py-2">
      <div className="text-[10px] font-medium uppercase text-neutral-500">
        {label}
      </div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${colorClass}`}>
        {fmtMoney(breakdown.total)} ₽
      </div>
      <div className="text-[10px] text-neutral-400">
        Заключено {fmtMoney(breakdown.concluded)} · Планируется{" "}
        {fmtMoney(breakdown.planned)}
      </div>
    </div>
  );
}
