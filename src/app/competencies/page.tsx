"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrgChartStore } from "@/lib/store";
import {
  GraduationCap,
  Plus,
  Trash2,
  Save,
  Loader2,
  X,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { EmployeeCompetencyCard } from "@/components/competencies/EmployeeCompetencyCard";

interface CompetencyItem {
  id: string;
  name: string;
  category: "HARD" | "SOFT" | "LEADERSHIP";
  description: string | null;
}

interface EmployeeItem {
  id: string;
  fullName: string;
  position: string;
  departmentId: string;
}

interface DeptItem {
  id: string;
  name: string;
  parentId: string | null;
}

interface EmpCompRecord {
  employeeId: string;
  competencyId: string;
  currentLevel: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  HARD: "Hard Skills",
  SOFT: "Soft Skills",
  LEADERSHIP: "Лидерство",
};

const CATEGORY_COLORS: Record<string, string> = {
  HARD: "bg-blue-100 text-blue-700",
  SOFT: "bg-green-100 text-green-700",
  LEADERSHIP: "bg-purple-100 text-purple-700",
};

const LEVEL_COLORS: Record<number, string> = {
  0: "bg-neutral-100 text-neutral-300",
  1: "bg-red-100 text-red-700",
  2: "bg-orange-100 text-orange-700",
  3: "bg-yellow-100 text-yellow-700",
  4: "bg-lime-100 text-lime-700",
  5: "bg-green-100 text-green-700",
};

export default function CompetenciesPage() {
  const currentScenarioId = useOrgChartStore((s) => s.currentScenarioId);
  const [competencies, setCompetencies] = useState<CompetencyItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [departments, setDepartments] = useState<DeptItem[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Filters
  const [filterDept, setFilterDept] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [includeChildren, setIncludeChildren] = useState(true);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  // Add competency form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("HARD");
  const [formDesc, setFormDesc] = useState("");

  const loadData = useCallback(async () => {
    if (!currentScenarioId) return;
    setLoading(true);

    const [compRes, empRes, deptRes, ecRes] = await Promise.all([
      fetch("/api/competencies").then((r) => r.json()),
      fetch(`/api/employees?scenarioId=${currentScenarioId}&limit=500`).then((r) => r.json()),
      fetch(`/api/departments?scenarioId=${currentScenarioId}`).then((r) => r.json()),
      fetch(`/api/employee-competencies?scenarioId=${currentScenarioId}`).then((r) => r.json()),
    ]);

    setCompetencies(compRes.competencies || []);
    const emps = (empRes.data || empRes.employees || []).map((e: EmployeeItem) => ({
      id: e.id,
      fullName: e.fullName,
      position: e.position,
      departmentId: e.departmentId,
    }));
    setEmployees(emps);
    setDepartments((deptRes.departments || deptRes || []).map((d: DeptItem) => ({ id: d.id, name: d.name, parentId: d.parentId || null })));

    // Build matrix: employeeId → competencyId → level
    const m: Record<string, Record<string, number>> = {};
    for (const rec of (ecRes.records || []) as EmpCompRecord[]) {
      if (!m[rec.employeeId]) m[rec.employeeId] = {};
      m[rec.employeeId][rec.competencyId] = rec.currentLevel;
    }
    setMatrix(m);
    setHasChanges(false);
    setLoading(false);
  }, [currentScenarioId]);

  useEffect(() => { loadData(); }, [loadData]);

  function setLevel(employeeId: string, competencyId: string, level: number) {
    setMatrix((prev) => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], [competencyId]: level },
    }));
    setHasChanges(true);
  }

  function cycleLevel(employeeId: string, competencyId: string) {
    const current = matrix[employeeId]?.[competencyId] || 0;
    const next = current >= 5 ? 0 : current + 1;
    setLevel(employeeId, competencyId, next);
  }

  async function handleSave() {
    setSaving(true);
    const updates: Array<{ employeeId: string; competencyId: string; currentLevel: number }> = [];
    for (const [empId, compMap] of Object.entries(matrix)) {
      for (const [compId, level] of Object.entries(compMap)) {
        if (level > 0) {
          updates.push({ employeeId: empId, competencyId: compId, currentLevel: level });
        }
      }
    }
    await fetch("/api/employee-competencies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    setSaving(false);
    setHasChanges(false);
  }

  async function handleAddCompetency() {
    if (!formName.trim()) return;
    await fetch("/api/competencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: formName, category: formCategory, description: formDesc || null }),
    });
    setFormName(""); setFormDesc(""); setShowForm(false);
    loadData();
  }

  async function handleDeleteCompetency(id: string) {
    if (!confirm("Удалить компетенцию?")) return;
    await fetch(`/api/competencies/${id}`, { method: "DELETE" });
    loadData();
  }

  function getDeptName(id: string): string {
    return departments.find((d) => d.id === id)?.name || "";
  }

  // Get all child department IDs recursively
  function getChildDeptIds(parentId: string): string[] {
    const children = departments.filter((d) => d.parentId === parentId);
    const ids: string[] = [parentId];
    for (const child of children) {
      ids.push(...getChildDeptIds(child.id));
    }
    return ids;
  }

  // Filtered data
  const filteredComps = competencies.filter((c) => !filterCategory || c.category === filterCategory);
  const allowedDeptIds = filterDept
    ? (includeChildren ? new Set(getChildDeptIds(filterDept)) : new Set([filterDept]))
    : null;
  const filteredEmps = allowedDeptIds
    ? employees.filter((e) => allowedDeptIds.has(e.departmentId))
    : employees;

  if (!currentScenarioId) {
    return <div className="flex h-full items-center justify-center text-neutral-400">Выберите сценарий</div>;
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-6 w-6 text-neutral-700" />
          <h1 className="text-xl font-bold">Компетенции</h1>
          <span className="text-sm text-neutral-400">
            {competencies.length} компетенций × {filteredEmps.length} сотрудников
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/competencies/gaps" className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50">
            <AlertTriangle className="h-4 w-4" /> Gap-анализ
          </Link>
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-neutral-50">
            <Plus className="h-4 w-4" /> Компетенция
          </button>
          <button onClick={handleSave} disabled={!hasChanges || saving} className="inline-flex items-center gap-1 rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:bg-neutral-300">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Сохранить
          </button>
        </div>
      </div>

      {/* Add competency form */}
      {showForm && (
        <div className="rounded-lg border bg-white p-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-neutral-500 mb-1">Название *</label>
            <input value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" placeholder="Название компетенции" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Категория</label>
            <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="rounded border px-2 py-1.5 text-sm">
              <option value="HARD">Hard Skills</option>
              <option value="SOFT">Soft Skills</option>
              <option value="LEADERSHIP">Лидерство</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-neutral-500 mb-1">Описание</label>
            <input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
          </div>
          <button onClick={handleAddCompetency} disabled={!formName.trim()} className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:bg-neutral-300">
            <Plus className="h-4 w-4" />
          </button>
          <button onClick={() => setShowForm(false)} className="rounded border px-3 py-1.5 text-sm hover:bg-neutral-50">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Debug info */}
      <div className="text-xs text-neutral-400">
        Загружено: {employees.length} сотрудников, {competencies.length} компетенций, {departments.length} подразделений
        {employees.length === 0 && currentScenarioId && <span className="text-red-500 ml-2">Сотрудники не загружены! scenarioId: {currentScenarioId}</span>}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Подразделение</label>
          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="rounded border px-2 py-1.5 text-sm">
            <option value="">Все</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        {filterDept && (
          <div className="flex items-end pb-0.5">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={includeChildren}
                onChange={(e) => setIncludeChildren(e.target.checked)}
                className="rounded border-neutral-300"
              />
              <span className="text-neutral-600">Включая дочерние</span>
            </label>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Категория</label>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded border px-2 py-1.5 text-sm">
            <option value="">Все</option>
            <option value="HARD">Hard Skills</option>
            <option value="SOFT">Soft Skills</option>
            <option value="LEADERSHIP">Лидерство</option>
          </select>
        </div>
        <div className="ml-4 flex items-end gap-1 pb-0.5">
          {[1, 2, 3, 4, 5].map((l) => (
            <span key={l} className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${LEVEL_COLORS[l]}`}>{l}</span>
          ))}
          <span className="text-[10px] text-neutral-400 ml-1">← клик для переключения</span>
        </div>
      </div>

      {/* Matrix */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-neutral-400" /></div>
      ) : filteredEmps.length === 0 && filteredComps.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-400">
          {competencies.length === 0
            ? "Нет компетенций. Нажмите «+ Компетенция» для создания."
            : "Нет сотрудников в выбранном подразделении."}
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-neutral-50">
                <th className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left font-medium min-w-[180px]">
                  Сотрудник
                </th>
                <th className="sticky left-0 z-10 bg-neutral-50 px-2 py-2 text-left font-medium text-neutral-400 min-w-[100px]" style={{ left: "180px" }}>
                  Подразделение
                </th>
                {filteredComps.map((c) => (
                  <th key={c.id} className="px-1 py-2 text-center font-medium min-w-[50px]" title={`${c.name} (${CATEGORY_LABELS[c.category]})`}>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`rounded px-1 py-0.5 text-[8px] ${CATEGORY_COLORS[c.category]}`}>
                        {c.category[0]}
                      </span>
                      <span className="truncate max-w-[60px] text-[10px]">{c.name}</span>
                      <button onClick={() => handleDeleteCompetency(c.id)} className="text-neutral-300 hover:text-red-500">
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEmps.map((emp) => (
                <tr key={emp.id} className="border-b hover:bg-neutral-50/50">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium">
                    <button
                      onClick={() => setSelectedEmployeeId(emp.id)}
                      className="text-left hover:text-blue-600 hover:underline"
                    >
                      {emp.fullName}
                    </button>
                  </td>
                  <td className="sticky bg-white px-2 py-1.5 text-neutral-400 truncate" style={{ left: "180px" }}>
                    {getDeptName(emp.departmentId)}
                  </td>
                  {filteredComps.map((c) => {
                    const level = matrix[emp.id]?.[c.id] || 0;
                    return (
                      <td key={c.id} className="px-1 py-1 text-center">
                        <button
                          onClick={() => cycleLevel(emp.id, c.id)}
                          className={`inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold ${LEVEL_COLORS[level]}`}
                          title={`${emp.fullName}: ${c.name} = ${level}/5`}
                        >
                          {level || "—"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Employee competency card modal */}
      {selectedEmployeeId && (
        <EmployeeCompetencyCard
          employeeId={selectedEmployeeId}
          open={!!selectedEmployeeId}
          onClose={() => setSelectedEmployeeId(null)}
          onSaved={() => loadData()}
        />
      )}
    </div>
  );
}
