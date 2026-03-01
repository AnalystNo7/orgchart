"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Plus, ArrowUp, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { DepartmentMetrics } from "./DepartmentMetrics";
import { DepartmentEmployeeTable } from "./EmployeeTable";
import { EmployeeFormDialog } from "./DepartmentForm";
import { AddDepartmentDialog } from "@/components/org-chart/AddDepartmentDialog";
import { AddParentDialog } from "./AddParentDialog";
import { SHETIL_CONFIG } from "@/types";
import type { MetricsMode } from "@/types";
import { useOrgChartStore } from "@/lib/store";
import type { ShetilType, EmployeeCategory } from "@prisma/client";

interface Department {
  id: string;
  scenarioId: string;
  parentId: string | null;
  name: string;
  cfo: string | null;
  shetilType: ShetilType;
  headId: string | null;
  head: { id: string; fullName: string } | null;
  employees: Array<{
    id: string;
    fullName: string;
    position: string;
    category: EmployeeCategory;
    fte: number | string;
  }>;
  metrics: { pp: number; opp: number; aup: number; totalFte: number };
}

interface DepartmentPanelProps {
  departmentId: string;
}

export function DepartmentPanel({ departmentId }: DepartmentPanelProps) {
  const {
    setSelectedDepartmentId,
    currentScenarioId,
    triggerRefresh,
    departmentOverrides,
    setDepartmentOverride,
    metricsMode,
  } = useOrgChartStore();
  const [dept, setDept] = useState<Department | null>(null);
  const [name, setName] = useState("");
  const [cfo, setCfo] = useState("");
  const [shetilType, setShetilType] = useState<ShetilType>("REVENUE");
  const [headId, setHeadId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [showAddParent, setShowAddParent] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<
    Department["employees"][0] | null
  >(null);

  const currentOverride = departmentOverrides[departmentId] ?? null;

  const fetchDepartment = useCallback(async () => {
    const res = await fetch(`/api/departments/${departmentId}`);
    if (res.ok) {
      const data: Department = await res.json();
      setDept(data);
      setName(data.name);
      setCfo(data.cfo ?? "");
      setShetilType(data.shetilType);
      setHeadId(data.headId);
    }
  }, [departmentId]);

  useEffect(() => {
    fetchDepartment();
  }, [fetchDepartment]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/departments/${departmentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, cfo: cfo || null, shetilType, headId }),
    });
    await fetchDepartment();
    triggerRefresh();
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Удалить подразделение?")) return;
    const res = await fetch(`/api/departments/${departmentId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setSelectedDepartmentId(null);
      triggerRefresh();
    } else {
      const data = await res.json();
      alert(data.error);
    }
  }

  async function handleAddEmployee(data: {
    fullName: string;
    position: string;
    category: EmployeeCategory;
    fte: number;
  }) {
    await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        scenarioId: currentScenarioId,
        departmentId,
      }),
    });
    setShowAddEmployee(false);
    fetchDepartment();
    triggerRefresh();
  }

  async function handleEditEmployee(data: {
    fullName: string;
    position: string;
    category: EmployeeCategory;
    fte: number;
  }) {
    if (!editingEmployee) return;
    await fetch(`/api/employees/${editingEmployee.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditingEmployee(null);
    fetchDepartment();
    triggerRefresh();
  }

  function handleDeleteEmployee() {
    fetchDepartment();
    triggerRefresh();
  }

  async function handleAddChildDepartment(data: {
    name: string;
    shetilType: ShetilType;
  }) {
    await fetch("/api/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: currentScenarioId,
        parentId: departmentId,
        name: data.name,
        shetilType: data.shetilType,
      }),
    });
    setShowAddChild(false);
    triggerRefresh();
  }

  if (!dept) {
    return (
      <div className="flex w-80 items-center justify-center border-l bg-white">
        <p className="text-sm text-neutral-400">Загрузка...</p>
      </div>
    );
  }

  const shetilConfig = SHETIL_CONFIG[shetilType];

  const metricsModeLabel =
    metricsMode === "own"
      ? "Собственные"
      : metricsMode === "all_descendants"
        ? "Все"
        : "Уровни";

  return (
    <div className="flex w-96 flex-col border-l bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="truncate text-sm font-semibold">{dept.name}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setSelectedDepartmentId(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Name */}
          <div className="space-y-2">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {/* CFO */}
          <div className="space-y-2">
            <Label>ЦФО</Label>
            <Input
              value={cfo}
              onChange={(e) => setCfo(e.target.value)}
              placeholder="Центр финансовой ответственности"
            />
          </div>

          {/* Shetil type */}
          <div className="space-y-2">
            <Label>Тип (Шетил)</Label>
            <Select
              value={shetilType}
              onValueChange={(v) => setShetilType(v as ShetilType)}
            >
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded"
                    style={{ backgroundColor: shetilConfig.color }}
                  />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.entries(SHETIL_CONFIG) as [
                    ShetilType,
                    typeof shetilConfig,
                  ][]
                ).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded"
                        style={{ backgroundColor: cfg.color }}
                      />
                      {cfg.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Head */}
          <div className="space-y-2">
            <Label>Руководитель</Label>
            <Select
              value={headId ?? "none"}
              onValueChange={(v) => setHeadId(v === "none" ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Не назначен" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не назначен</SelectItem>
                {dept.employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Metrics */}
          <DepartmentMetrics
            pp={dept.metrics.pp}
            opp={dept.metrics.opp}
            aup={dept.metrics.aup}
            totalFte={dept.metrics.totalFte}
          />

          {/* Metrics mode override */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-neutral-700">
              Режим подсчёта
            </h3>
            <RadioGroup
              value={currentOverride ?? "global"}
              onValueChange={(v) =>
                setDepartmentOverride(
                  departmentId,
                  v === "global" ? null : (v as MetricsMode)
                )
              }
              className="space-y-1"
            >
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="global" id="override-global" />
                <Label
                  htmlFor="override-global"
                  className="cursor-pointer text-xs"
                >
                  Глобальный ({metricsModeLabel})
                </Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="own" id="override-own" />
                <Label htmlFor="override-own" className="cursor-pointer text-xs">
                  Собственные
                </Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="all_descendants" id="override-all" />
                <Label htmlFor="override-all" className="cursor-pointer text-xs">
                  Все подчиненные
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Separator />

          {/* Employees */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-neutral-700">
                Сотрудники
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddEmployee(true)}
              >
                <Plus className="mr-1 h-3 w-3" />
                Добавить
              </Button>
            </div>
            <DepartmentEmployeeTable
              employees={dept.employees}
              onEdit={setEditingEmployee}
              onDelete={handleDeleteEmployee}
            />
          </div>
        </div>
      </ScrollArea>

      {/* Footer actions */}
      <div className="flex flex-col gap-2 border-t p-3">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddChild(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Дочернее
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddParent(true)}
          >
            <ArrowUp className="mr-1 h-4 w-4" />
            Вышестоящее
          </Button>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            <Save className="mr-1 h-4 w-4" />
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
          <Button variant="destructive" size="icon" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Add employee dialog */}
      <EmployeeFormDialog
        open={showAddEmployee}
        onClose={() => setShowAddEmployee(false)}
        onSubmit={handleAddEmployee}
        title="Добавить сотрудника"
      />

      {/* Edit employee dialog */}
      {editingEmployee && (
        <EmployeeFormDialog
          open={!!editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onSubmit={handleEditEmployee}
          defaultValues={{
            fullName: editingEmployee.fullName,
            position: editingEmployee.position,
            category: editingEmployee.category,
            fte: Number(editingEmployee.fte),
          }}
          title="Редактировать сотрудника"
        />
      )}

      {/* Add child department dialog */}
      <AddDepartmentDialog
        open={showAddChild}
        onClose={() => setShowAddChild(false)}
        onSubmit={handleAddChildDepartment}
        title="Добавить дочернее подразделение"
      />

      {/* Add parent department dialog */}
      {currentScenarioId && (
        <AddParentDialog
          open={showAddParent}
          onClose={() => setShowAddParent(false)}
          departmentId={departmentId}
          currentParentId={dept.parentId}
          scenarioId={currentScenarioId}
          onComplete={() => {
            setShowAddParent(false);
            fetchDepartment();
            triggerRefresh();
          }}
        />
      )}
    </div>
  );
}
