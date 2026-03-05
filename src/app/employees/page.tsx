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
import { ExcelImport, type ImportResult } from "@/components/employees/ExcelImport";
import { ExcelExport } from "@/components/employees/ExcelExport";
import { useOrgChartStore } from "@/lib/store";
import type { EmployeeCategory } from "@prisma/client";

interface APIResponse {
  data: EmployeeRow[];
  total: number;
  page: number;
  totalPages: number;
  maxDepth: number;
  levelNames: string[];
  columnNames: Record<string, string> | null;
  categoryTotals: { pp: number; opp: number; aup: number };
}

interface FilterOptions {
  cfo: string[];
  levels: string[][];
}

export default function EmployeesPage() {
  const { currentScenarioId, triggerRefresh } = useOrgChartStore();
  const [response, setResponse] = useState<APIResponse | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [hierarchyFilters, setHierarchyFilters] = useState<Record<string, string>>({});
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [hierarchyMode, setHierarchyMode] = useState<"detailed" | "compact">(
    "detailed"
  );
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRow | null>(
    null
  );

  // Fetch filter options when scenario changes
  useEffect(() => {
    if (!currentScenarioId) return;
    setHierarchyFilters({});
    setCategoryFilter("");
    fetch(`/api/employees/filters?scenarioId=${currentScenarioId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setFilterOptions(data));
  }, [currentScenarioId]);

  const fetchEmployees = useCallback(async () => {
    if (!currentScenarioId) return;
    const params = new URLSearchParams({
      scenarioId: currentScenarioId,
      page: String(page),
      limit: "20",
    });
    if (search) params.set("search", search);
    if (categoryFilter) params.set("category", categoryFilter);
    Object.entries(hierarchyFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    const res = await fetch(`/api/employees?${params}`);
    if (res.ok) {
      setResponse(await res.json());
    }
  }, [currentScenarioId, page, search, categoryFilter, hierarchyFilters]);

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
    cfo?: string;
  }) {
    const { cfo, ...employeeData } = data;
    await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...employeeData, scenarioId: currentScenarioId }),
    });

    if (cfo && data.departmentId) {
      await fetch(`/api/departments/${data.departmentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cfo }),
      });
    }

    setShowAdd(false);
    fetchEmployees();
  }

  async function handleEdit(data: {
    fullName: string;
    position: string;
    category: EmployeeCategory;
    fte: number;
    departmentId: string;
    cfo?: string;
  }) {
    if (!editingEmployee) return;
    const { cfo, ...employeeData } = data;
    await fetch(`/api/employees/${editingEmployee.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(employeeData),
    });

    if (cfo && data.departmentId) {
      await fetch(`/api/departments/${data.departmentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cfo }),
      });
    }

    setEditingEmployee(null);
    fetchEmployees();
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить сотрудника?")) return;
    await fetch(`/api/employees/${id}`, { method: "DELETE" });
    fetchEmployees();
  }

  function handleImportComplete(result: ImportResult) {
    fetchEmployees();
    if (result.modeledOrgStructure) {
      triggerRefresh();
    }
  }

  const handleColumnRename = useCallback(
    async (columnId: string, newName: string) => {
      if (!currentScenarioId) return;

      setResponse((prev) => {
        if (!prev) return prev;
        const existingNames = prev.columnNames ?? {};
        const updatedNames = { ...existingNames, [columnId]: newName };

        fetch(`/api/scenarios/${currentScenarioId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columnNames: updatedNames }),
        });

        return { ...prev, columnNames: updatedNames };
      });
    },
    [currentScenarioId]
  );

  const columns = useMemo(
    () =>
      getColumns({
        actions: {
          onEdit: setEditingEmployee,
          onDelete: handleDelete,
        },
        hierarchyMode,
        maxDepth: response?.maxDepth ?? 0,
        levelNames: response?.levelNames ?? [],
        columnNames: response?.columnNames ?? null,
        onColumnRename: handleColumnRename,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hierarchyMode, response?.maxDepth, response?.levelNames, response?.columnNames, handleColumnRename]
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
          <ExcelExport
            scenarioId={currentScenarioId}
            search={search}
            categoryFilter={categoryFilter}
            columnNames={response?.columnNames ?? null}
            maxDepth={response?.maxDepth ?? 0}
          />
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
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Поиск по ФИО..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* CFO filter */}
        {filterOptions && filterOptions.cfo.length > 0 && (
          <Select
            value={hierarchyFilters.cfo || "all"}
            onValueChange={(v) => {
              setHierarchyFilters((prev) => ({ ...prev, cfo: v === "all" ? "" : v }));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Все ЦФО" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все ЦФО</SelectItem>
              {filterOptions.cfo.map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Hierarchy level filters (skip level 0 = ГД) */}
        {filterOptions?.levels.map((values, i) => (
          i > 0 && values.length > 0 && (
            <Select
              key={i}
              value={hierarchyFilters[`hierarchy_${i}`] || "all"}
              onValueChange={(v) => {
                setHierarchyFilters((prev) => ({ ...prev, [`hierarchy_${i}`]: v === "all" ? "" : v }));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={response?.levelNames?.[i] ?? `Уровень ${i + 1}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{response?.levelNames?.[i] ?? `Уровень ${i + 1}`}: все</SelectItem>
                {values.map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        ))}

        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v === "all" ? "" : v);
            setPage(1);
          }}
        >
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

        {/* Hierarchy view toggle */}
        <div className="flex gap-1">
          <Button
            variant={hierarchyMode === "detailed" ? "default" : "outline"}
            size="sm"
            onClick={() => setHierarchyMode("detailed")}
          >
            Развернуто
          </Button>
          <Button
            variant={hierarchyMode === "compact" ? "default" : "outline"}
            size="sm"
            onClick={() => setHierarchyMode("compact")}
          >
            Компактно
          </Button>
        </div>
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
            initialColumnVisibility={{ hierarchy_0: false }}
          />
          <div className="text-sm text-neutral-500">
            Итого: {response.total} сотрудников | ПП:{" "}
            {response.categoryTotals.pp} | ОПП: {response.categoryTotals.opp} |
            АУП: {response.categoryTotals.aup}
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
            cfo: editingEmployee.department.cfo ?? undefined,
          }}
          title="Редактировать сотрудника"
          scenarioId={currentScenarioId}
        />
      )}

      {/* Excel import */}
      <ExcelImport
        open={showImport}
        onClose={() => setShowImport(false)}
        scenarioId={currentScenarioId}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
}
