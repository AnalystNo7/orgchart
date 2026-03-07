"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Download, Upload, Search, MoreHorizontal } from "lucide-react";
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

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [columnNames, setColumnNames] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(CONTRACT_STORAGE_KEY) || "{}");
    } catch { return {}; }
  });

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

  async function handleAdd(data: {
    name: string;
    type: "REVENUE" | "EXPENSE";
    status: "CONCLUDED" | "PLANNED";
    amount: number | null;
    expectedAmount: number | null;
    periodStart: string;
    periodEnd: string;
    description: string;
  }) {
    await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        description: data.description || null,
      }),
    });
    setShowAdd(false);
    fetchContracts();
  }

  async function handleEdit(data: {
    name: string;
    type: "REVENUE" | "EXPENSE";
    status: "CONCLUDED" | "PLANNED";
    amount: number | null;
    expectedAmount: number | null;
    periodStart: string;
    periodEnd: string;
    description: string;
  }) {
    if (!editingContract) return;
    await fetch(`/api/contracts/${editingContract.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        description: data.description || null,
      }),
    });
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
                <TableHead>
                  <EditableHeader value={getColName("description")} onSave={(v) => renameColumn("description", v)} />
                </TableHead>
                <TableHead className="w-[80px]">
                  <EditableHeader value={getColName("employees")} onSave={(v) => renameColumn("employees", v)} />
                </TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    Нет данных
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((contract) => (
                  <TableRow key={contract.id}>
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
                    <TableCell>
                      {contract.description ? (
                        <TruncatedCell text={contract.description} maxWidth="max-w-[200px]" />
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {contract._count.employees}
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
                ))
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
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
          defaultValues={{
            name: editingContract.name,
            type: editingContract.type,
            status: editingContract.status,
            amount: editingContract.amount != null ? Number(editingContract.amount) : null,
            expectedAmount: editingContract.expectedAmount != null ? Number(editingContract.expectedAmount) : null,
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
