"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Trash2, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EditableHeader } from "./EditableHeader";
import { REVENUE_PROVISION_LABELS } from "@/types";
import type { ContractStatus, RevenueProvisionStatus } from "@prisma/client";

const EC_COLUMN_DEFAULTS: Record<string, string> = {
  contractName: "Наименование договора",
  revenueStatus: "Доходный договор",
  fte: "FTE",
  period: "Период обеспечения",
};

const EC_STORAGE_KEY = "employee-contract-column-names";

interface Contract {
  id: string;
  name: string;
  type: string;
  status: ContractStatus;
  periodStart: string;
  periodEnd: string;
}

interface EmployeeContractRow {
  id: string;
  employeeId: string;
  contractId: string;
  revenueStatus: RevenueProvisionStatus;
  fte: number | string;
  periodStart: string;
  periodEnd: string;
  contract: Contract;
}

interface GroupedContract {
  contractId: string;
  contract: Contract;
  revenueStatus: RevenueProvisionStatus;
  periods: EmployeeContractRow[];
}

interface EmployeeContractsModalProps {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ru-RU");
}

function toDateInput(dateStr: string) {
  return new Date(dateStr).toISOString().split("T")[0];
}

const provisionColors: Record<RevenueProvisionStatus, string> = {
  PROVIDED: "bg-green-100 text-green-800",
  PLANNED: "bg-yellow-100 text-yellow-800",
  NOT_PROVIDED: "bg-red-100 text-red-800",
};

function groupByContract(contracts: EmployeeContractRow[]): GroupedContract[] {
  const map = new Map<string, GroupedContract>();
  for (const ec of contracts) {
    if (!map.has(ec.contractId)) {
      map.set(ec.contractId, {
        contractId: ec.contractId,
        contract: ec.contract,
        revenueStatus: ec.revenueStatus,
        periods: [],
      });
    }
    map.get(ec.contractId)!.periods.push(ec);
  }
  // Sort periods by date
  for (const group of map.values()) {
    group.periods.sort(
      (a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
    );
  }
  return Array.from(map.values());
}

export function EmployeeContractsModal({
  open,
  onClose,
  employeeId,
  employeeName,
}: EmployeeContractsModalProps) {
  const [contracts, setContracts] = useState<EmployeeContractRow[]>([]);
  const [availableContracts, setAvailableContracts] = useState<Contract[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addPeriodForContractId, setAddPeriodForContractId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [columnNames, setColumnNames] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(EC_STORAGE_KEY) || "{}");
    } catch { return {}; }
  });

  function getColName(id: string) {
    return columnNames[id] ?? EC_COLUMN_DEFAULTS[id] ?? id;
  }

  function renameColumn(id: string, name: string) {
    setColumnNames((prev) => {
      const next = { ...prev, [id]: name };
      localStorage.setItem(EC_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editFte, setEditFte] = useState("");
  const [editPeriodStart, setEditPeriodStart] = useState("");
  const [editPeriodEnd, setEditPeriodEnd] = useState("");

  // Add form state
  const [selectedContractId, setSelectedContractId] = useState("");
  const [revenueStatus, setRevenueStatus] = useState<RevenueProvisionStatus>("PROVIDED");
  const [addFte, setAddFte] = useState("1.0");
  const [addPeriodStart, setAddPeriodStart] = useState("");
  const [addPeriodEnd, setAddPeriodEnd] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchContracts = useCallback(async () => {
    const res = await fetch(`/api/employee-contracts?employeeId=${employeeId}`);
    if (res.ok) setContracts(await res.json());
  }, [employeeId]);

  const fetchAvailable = useCallback(async () => {
    const params = new URLSearchParams({ type: "REVENUE" });
    if (search) params.set("search", search);
    const res = await fetch(`/api/contracts?${params}`);
    if (res.ok) setAvailableContracts(await res.json());
  }, [search]);

  useEffect(() => {
    if (open) {
      fetchContracts();
      fetchAvailable();
    }
  }, [open, fetchContracts, fetchAvailable]);

  // Auto-set revenue status based on contract status
  useEffect(() => {
    const cid = addPeriodForContractId || selectedContractId;
    if (cid) {
      const contract = availableContracts.find((c) => c.id === cid);
      if (contract) {
        if (!addPeriodForContractId) {
          setRevenueStatus(contract.status === "CONCLUDED" ? "PROVIDED" : "PLANNED");
        }
        setAddPeriodStart(toDateInput(contract.periodStart));
        setAddPeriodEnd(toDateInput(contract.periodEnd));
      }
    }
  }, [selectedContractId, addPeriodForContractId, availableContracts]);

  function resetAddForm() {
    setShowAddForm(false);
    setAddPeriodForContractId(null);
    setSelectedContractId("");
    setAddFte("1.0");
    setAddPeriodStart("");
    setAddPeriodEnd("");
  }

  function startAddPeriod(group: GroupedContract) {
    setAddPeriodForContractId(group.contractId);
    setRevenueStatus(group.revenueStatus);
    setAddFte("1.0");
    // Set start date to day after last period ends
    const lastPeriod = group.periods[group.periods.length - 1];
    if (lastPeriod) {
      const nextDay = new Date(lastPeriod.periodEnd);
      nextDay.setDate(nextDay.getDate() + 1);
      setAddPeriodStart(nextDay.toISOString().split("T")[0]);
      setAddPeriodEnd(toDateInput(group.contract.periodEnd));
    }
    setShowAddForm(true);
  }

  async function handleAdd() {
    const contractId = addPeriodForContractId || selectedContractId;
    if (!contractId) return;

    const res = await fetch("/api/employee-contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        contractId,
        revenueStatus,
        fte: parseFloat(addFte),
        periodStart: addPeriodStart,
        periodEnd: addPeriodEnd,
      }),
    });

    if (res.ok) {
      resetAddForm();
      fetchContracts();
    } else {
      const err = await res.json();
      alert(err.error || "Ошибка");
    }
  }

  function startRowEdit(ec: EmployeeContractRow) {
    setEditingRowId(ec.id);
    setEditFte(String(Number(ec.fte)));
    setEditPeriodStart(toDateInput(ec.periodStart));
    setEditPeriodEnd(toDateInput(ec.periodEnd));
  }

  async function saveRowEdit(id: string) {
    const res = await fetch(`/api/employee-contracts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fte: parseFloat(editFte),
        periodStart: editPeriodStart,
        periodEnd: editPeriodEnd,
      }),
    });
    if (res.ok) {
      setEditingRowId(null);
      fetchContracts();
    } else {
      const err = await res.json();
      alert(err.error || "Ошибка");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить этот период?")) return;
    await fetch(`/api/employee-contracts/${id}`, { method: "DELETE" });
    fetchContracts();
  }

  const grouped = groupByContract(contracts);
  const assignedIds = new Set(contracts.map((c) => c.contractId));
  const filteredAvailable = availableContracts.filter((c) => !assignedIds.has(c.id));

  const activeContract = addPeriodForContractId
    ? availableContracts.find((c) => c.id === addPeriodForContractId)
    : selectedContractId
    ? availableContracts.find((c) => c.id === selectedContractId)
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Договоры сотрудника: {employeeName}</DialogTitle>
          <div className="flex items-center gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                placeholder="Поиск договоров..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Button size="sm" onClick={() => { resetAddForm(); setShowAddForm(true); }}>
              <Plus className="mr-1 h-4 w-4" />
              Добавить договор
            </Button>
          </div>
        </DialogHeader>

        {/* Grouped contracts */}
        <div className="space-y-3">
          <TooltipProvider>
            {grouped.length === 0 ? (
              <div className="rounded-md border p-6 text-center text-neutral-400">
                Нет привязанных договоров
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.contractId} className="rounded-md border">
                  {/* Contract header */}
                  <div className="flex items-center justify-between bg-neutral-50 px-4 py-2 border-b">
                    <div className="flex items-center gap-3">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-medium text-sm truncate max-w-[300px]">
                            {group.contract.name}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">{group.contract.name}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Badge
                        variant="secondary"
                        className={provisionColors[group.revenueStatus]}
                      >
                        {REVENUE_PROVISION_LABELS[group.revenueStatus]}
                      </Badge>
                      <span className="text-xs text-neutral-400">
                        {formatDate(group.contract.periodStart)} – {formatDate(group.contract.periodEnd)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => startAddPeriod(group)}
                    >
                      <CalendarPlus className="mr-1 h-3 w-3" />
                      Добавить период
                    </Button>
                  </div>

                  {/* Periods table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">
                          <EditableHeader value={getColName("fte")} onSave={(v) => renameColumn("fte", v)} />
                        </TableHead>
                        <TableHead>
                          <EditableHeader value={getColName("period")} onSave={(v) => renameColumn("period", v)} />
                        </TableHead>
                        <TableHead className="w-[90px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.periods.map((ec) => (
                        <TableRow key={ec.id}>
                          <TableCell>
                            {editingRowId === ec.id ? (
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max="1"
                                value={editFte}
                                onChange={(e) => setEditFte(e.target.value)}
                                className="h-8 w-20"
                              />
                            ) : (
                              <span
                                className="cursor-pointer hover:text-blue-600"
                                onClick={() => startRowEdit(ec)}
                              >
                                {Number(ec.fte).toFixed(1)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingRowId === ec.id ? (
                              <div className="flex gap-1">
                                <Input
                                  type="date"
                                  value={editPeriodStart}
                                  onChange={(e) => setEditPeriodStart(e.target.value)}
                                  className="h-8 w-[130px]"
                                />
                                <span className="self-center text-neutral-400">–</span>
                                <Input
                                  type="date"
                                  value={editPeriodEnd}
                                  onChange={(e) => setEditPeriodEnd(e.target.value)}
                                  className="h-8 w-[130px]"
                                />
                              </div>
                            ) : (
                              <span
                                className="cursor-pointer whitespace-nowrap text-sm hover:text-blue-600"
                                onClick={() => startRowEdit(ec)}
                              >
                                {formatDate(ec.periodStart)} – {formatDate(ec.periodEnd)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingRowId === ec.id ? (
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" onClick={() => saveRowEdit(ec.id)}>
                                  OK
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingRowId(null)}>
                                  ✕
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                onClick={() => handleDelete(ec.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))
            )}
          </TooltipProvider>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="space-y-3 rounded-md border p-4">
            <h4 className="text-sm font-medium">
              {addPeriodForContractId ? "Добавить период" : "Привязать договор"}
            </h4>

            {!addPeriodForContractId && (
              <div className="space-y-2">
                <Label>Наименование договора</Label>
                <Select
                  value={selectedContractId || "none"}
                  onValueChange={(v) => setSelectedContractId(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите договор" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Выберите договор</SelectItem>
                    {filteredAvailable.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!addPeriodForContractId && (
              <div className="space-y-2">
                <Label>Доходный договор</Label>
                <Select
                  value={revenueStatus}
                  onValueChange={(v) => setRevenueStatus(v as RevenueProvisionStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PROVIDED">Обеспечен</SelectItem>
                    <SelectItem value="PLANNED">Запланирован</SelectItem>
                    <SelectItem value="NOT_PROVIDED">Не обеспечен</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>FTE</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={addFte}
                  onChange={(e) => setAddFte(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Начало периода</Label>
                <Input
                  type="date"
                  value={addPeriodStart}
                  onChange={(e) => setAddPeriodStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Конец периода</Label>
                <Input
                  type="date"
                  value={addPeriodEnd}
                  onChange={(e) => setAddPeriodEnd(e.target.value)}
                />
              </div>
            </div>

            {activeContract && (
              <p className="text-xs text-neutral-500">
                Период договора: {formatDate(activeContract.periodStart)} – {formatDate(activeContract.periodEnd)}.
                Период обеспечения не должен выходить за эти рамки.
              </p>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={!addPeriodForContractId && !selectedContractId}
              >
                {addPeriodForContractId ? "Добавить период" : "Привязать"}
              </Button>
              <Button size="sm" variant="outline" onClick={resetAddForm}>
                Отмена
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
