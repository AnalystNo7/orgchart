"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, FileSpreadsheet, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/employees/data-table";
import { getColumns, type EmployeeRow } from "@/components/employees/columns";
import { EmployeeForm } from "@/components/employees/EmployeeForm";
import { ExcelImport, type ImportRow } from "@/components/employees/ExcelImport";
import { useOrgChartStore } from "@/lib/store";
import type { EmployeeCategory } from "@prisma/client";

interface APIResponse {
  data: EmployeeRow[];
  total: number;
  page: number;
  totalPages: number;
  categoryTotals: { pp: number; opp: number; aup: number };
}

export default function EmployeesPage() {
  const { currentScenarioId } = useOrgChartStore();
  const [response, setResponse] = useState<APIResponse | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRow | null>(null);

  const fetchEmployees = useCallback(async () => {
    if (!currentScenarioId) return;
    const params = new URLSearchParams({
      scenarioId: currentScenarioId,
      page: String(page),
      limit: "20",
    });
    if (search) params.set("search", search);
    if (categoryFilter) params.set("category", categoryFilter);

    const res = await fetch(`/api/employees?${params}`);
    if (res.ok) {
      setResponse(await res.json());
    }
  }, [currentScenarioId, page, search, categoryFilter]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Debounce search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function handleAdd(data: {
    fullName: string;
    position: string;
    category: EmployeeCategory;
    fte: number;
    departmentId: string;
  }) {
    await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, scenarioId: currentScenarioId }),
    });
    setShowAdd(false);
    fetchEmployees();
  }

  async function handleEdit(data: {
    fullName: string;
    position: string;
    category: EmployeeCategory;
    fte: number;
    departmentId: string;
  }) {
    if (!editingEmployee) return;
    await fetch(`/api/employees/${editingEmployee.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditingEmployee(null);
    fetchEmployees();
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить сотрудника?")) return;
    await fetch(`/api/employees/${id}`, { method: "DELETE" });
    fetchEmployees();
  }

  async function handleImport(rows: ImportRow[]) {
    if (!currentScenarioId) return;
    for (const row of rows) {
      const cat = row.category === "ОПП" ? "OPP" : row.category === "АУП" ? "AUP" : "PP";
      await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: currentScenarioId,
          departmentId: "", // TODO: match by name
          fullName: row.fullName,
          position: row.position,
          category: cat,
          fte: row.fte,
        }),
      });
    }
    setShowImport(false);
    fetchEmployees();
  }

  const columns = useMemo(
    () =>
      getColumns({
        onEdit: setEditingEmployee,
        onDelete: handleDelete,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  if (!currentScenarioId) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-400">
        Выберите сценарий
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Справочник сотрудников</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Импорт Excel
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Добавить
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Поиск по ФИО..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Все категории" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            <SelectItem value="PP">ПП</SelectItem>
            <SelectItem value="OPP">ОПП</SelectItem>
            <SelectItem value="AUP">АУП</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {response && (
        <>
          <DataTable
            columns={columns}
            data={response.data}
            page={response.page}
            totalPages={response.totalPages}
            total={response.total}
            onPageChange={setPage}
          />
          <div className="text-sm text-neutral-500">
            Итого: {response.total} сотрудников | ПП: {response.categoryTotals.pp} | ОПП:{" "}
            {response.categoryTotals.opp} | АУП: {response.categoryTotals.aup}
          </div>
        </>
      )}

      {/* Add dialog */}
      <EmployeeForm
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={handleAdd}
        title="Добавить сотрудника"
        scenarioId={currentScenarioId}
      />

      {/* Edit dialog */}
      {editingEmployee && (
        <EmployeeForm
          open={!!editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onSubmit={handleEdit}
          defaultValues={{
            fullName: editingEmployee.fullName,
            position: editingEmployee.position,
            category: editingEmployee.category,
            fte: Number(editingEmployee.fte),
            departmentId: editingEmployee.department.id,
          }}
          title="Редактировать сотрудника"
          scenarioId={currentScenarioId}
        />
      )}

      {/* Excel import */}
      <ExcelImport
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
      />
    </div>
  );
}
