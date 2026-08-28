"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
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

export function EmployeeContractsModal({
  open,
  onClose,
  employeeId,
  employeeName,
}: EmployeeContractsModalProps) {
  const [contracts, setContracts] = useState<EmployeeContractRow[]>([]);
  const [availableContracts, setAvailableContracts] = useState<Contract[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
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
  const [editRevenueStatus, setEditRevenueStatus] = useState<RevenueProvisionStatus>("PROVIDED");
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
    if (selectedContractId) {
      const contract = availableContracts.find((c) => c.id === selectedContractId);
      if (contract) {
        setRevenueStatus(contract.status === "CONCLUDED" ? "PROVIDED" : "PLANNED");
        setAddPeriodStart(toDateInput(contract.periodStart));
        setAddPeriodEnd(toDateInput(contract.periodEnd));
      }
    }
  }, [selectedContractId, availableContracts]);

  async function handleAdd() {
    if (!selectedContractId) return;

    const res = await fetch("/api/employee-contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        contractId: selectedContractId,
        revenueStatus,
        fte: parseFloat(addFte),
        periodStart: addPeriodStart,
        periodEnd: addPeriodEnd,
      }),
    });

    if (res.ok) {
      setShowAddForm(false);
      setSelectedContractId("");
      setAddFte("1.0");
      fetchContracts();
    } else {
      const err = await res.json();
      alert(err.error || "Ошибка");
    }
  }

  function startRowEdit(ec: EmployeeContractRow) {
    setEditingRowId(ec.id);
    setEditRevenueStatus(ec.revenueStatus);
    setEditFte(String(Number(ec.fte)));
    setEditPeriodStart(toDateInput(ec.periodStart));
    setEditPeriodEnd(toDateInput(ec.periodEnd));
  }

  async function saveRowEdit(id: string) {
    const res = await fetch(`/api/employee-contracts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revenueStatus: editRevenueStatus,
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
    if (!confirm("Убрать привязку к договору?")) return;
    await fetch(`/api/employee-contracts/${id}`, { method: "DELETE" });
    fetchContracts();
  }

  // Filter available contracts - exclude already assigned
  const assignedIds = new Set(contracts.map((c) => c.contractId));
  const filteredAvailable = availableContracts.filter((c) => !assignedIds.has(c.id));

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
            <Button size="sm" onClick={() => setShowAddForm(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Добавить
            </Button>
          </div>
        </DialogHeader>

        {/* Existing contracts */}
        <div className="overflow-x-auto rounded-md border">
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <EditableHeader value={getColName("contractName")} onSave={(v) => renameColumn("contractName", v)} />
                  </TableHead>
                  <TableHead className="w-[130px]">
                    <EditableHeader value={getColName("revenueStatus")} onSave={(v) => renameColumn("revenueStatus", v)} />
                  </TableHead>
                  <TableHead className="w-[80px]">
                    <EditableHeader value={getColName("fte")} onSave={(v) => renameColumn("fte", v)} />
                  </TableHead>
                  <TableHead className="w-[180px]">
                    <EditableHeader value={getColName("period")} onSave={(v) => renameColumn("period", v)} />
                  </TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-16 text-center text-neutral-400">
                      Нет привязанных договоров
                    </TableCell>
                  </TableRow>
                ) : (
                  contracts.map((ec) => (
                    <TableRow key={ec.id}>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block max-w-[250px] truncate">
                              {ec.contract.name}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">{ec.contract.name}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {editingRowId === ec.id ? (
                          <Select
                            value={editRevenueStatus}
                            onValueChange={(v) => setEditRevenueStatus(v as RevenueProvisionStatus)}
                          >
                            <SelectTrigger className="h-8 w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PROVIDED">Обеспечен</SelectItem>
                              <SelectItem value="PLANNED">Запланирован</SelectItem>
                              <SelectItem value="NOT_PROVIDED">Не обеспечен</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant="secondary"
                            className={`cursor-pointer ${provisionColors[ec.revenueStatus]}`}
                            onClick={() => startRowEdit(ec)}
                          >
                            {REVENUE_PROVISION_LABELS[ec.revenueStatus]}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingRowId === ec.id ? (
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="1"
                            value={editFte}
                            onChange={(e) => setEditFte(e.target.value)}
                            className="h-8 w-20"
                          />
                        ) : (
                          <span
                            className="cursor-pointer text-right hover:text-blue-600"
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
                  ))
                )}
              </TableBody>
            </Table>
          </TooltipProvider>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="space-y-3 rounded-md border p-4">
            <h4 className="text-sm font-medium">Привязать договор</h4>

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

            <div className="grid grid-cols-2 gap-4">
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

              <div className="space-y-2">
                <Label>FTE по договору</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={addFte}
                  onChange={(e) => setAddFte(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Период обеспечения: начало</Label>
                <Input
                  type="date"
                  value={addPeriodStart}
                  onChange={(e) => setAddPeriodStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Период обеспечения: конец</Label>
                <Input
                  type="date"
                  value={addPeriodEnd}
                  onChange={(e) => setAddPeriodEnd(e.target.value)}
                />
              </div>
            </div>

            {selectedContractId && (
              <p className="text-xs text-neutral-500">
                Период договора: {formatDate(
                  availableContracts.find((c) => c.id === selectedContractId)?.periodStart ?? ""
                )} – {formatDate(
                  availableContracts.find((c) => c.id === selectedContractId)?.periodEnd ?? ""
                )}. Период обеспечения не должен выходить за эти рамки.
              </p>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={!selectedContractId}>
                Привязать
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>
                Отмена
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
