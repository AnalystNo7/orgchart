"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useOrgChartStore } from "@/lib/store";
import {
  Crosshair,
  Plus,
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  Loader2,
  Save,
  X,
  User,
  Building2,
  TrendingUp,
  Search,
  Check,
} from "lucide-react";

// --- Types ---

type GoalType = "BSC_FINANCIAL" | "BSC_CLIENT" | "BSC_PROCESS" | "BSC_LEARNING" | "OKR";
type GoalStatusType = "NOT_STARTED" | "IN_PROGRESS" | "ACHIEVED" | "AT_RISK" | "FAILED";

interface GoalKpiData {
  id?: string;
  name: string;
  unit: string;
  targetValue: number;
  currentValue: number;
  weight: number;
}

interface GoalData {
  id: string;
  name: string;
  description: string | null;
  type: GoalType;
  status: GoalStatusType;
  weight: number;
  progress: number;
  ownerId: string | null;
  owner: { id: string; fullName: string; position: string } | null;
  deadline: string | null;
  period: string | null;
  parentId: string | null;
  sortOrder: number;
  kpis: GoalKpiData[];
  departments: Array<{ department: { id: string; name: string } }>;
  _count: { children: number };
}

interface DeptOption {
  id: string;
  name: string;
}

interface EmployeeOption {
  id: string;
  fullName: string;
  position: string;
}

// --- Constants ---

const PERSPECTIVES: { type: GoalType; label: string; color: string; bgColor: string; icon: string }[] = [
  { type: "BSC_FINANCIAL", label: "Финансы", color: "text-green-700", bgColor: "bg-green-50 border-green-200", icon: "💰" },
  { type: "BSC_CLIENT", label: "Клиенты", color: "text-blue-700", bgColor: "bg-blue-50 border-blue-200", icon: "👥" },
  { type: "BSC_PROCESS", label: "Процессы", color: "text-orange-700", bgColor: "bg-orange-50 border-orange-200", icon: "⚙️" },
  { type: "BSC_LEARNING", label: "Обучение и рост", color: "text-purple-700", bgColor: "bg-purple-50 border-purple-200", icon: "📚" },
];

const TYPE_LABELS: Record<string, string> = {
  BSC_FINANCIAL: "Финансы",
  BSC_CLIENT: "Клиенты",
  BSC_PROCESS: "Процессы",
  BSC_LEARNING: "Обучение и рост",
  OKR: "OKR",
};

const TYPE_COLORS: Record<string, string> = {
  BSC_FINANCIAL: "bg-green-100 text-green-700",
  BSC_CLIENT: "bg-blue-100 text-blue-700",
  BSC_PROCESS: "bg-orange-100 text-orange-700",
  BSC_LEARNING: "bg-purple-100 text-purple-700",
  OKR: "bg-indigo-100 text-indigo-700",
};

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Не начата",
  IN_PROGRESS: "В процессе",
  ACHIEVED: "Достигнута",
  AT_RISK: "Под угрозой",
  FAILED: "Провалена",
};

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: "bg-neutral-100 text-neutral-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  ACHIEVED: "bg-green-100 text-green-700",
  AT_RISK: "bg-amber-100 text-amber-700",
  FAILED: "bg-red-100 text-red-700",
};

const PROGRESS_COLORS: Record<string, string> = {
  NOT_STARTED: "bg-neutral-300",
  IN_PROGRESS: "bg-blue-500",
  ACHIEVED: "bg-green-500",
  AT_RISK: "bg-amber-500",
  FAILED: "bg-red-500",
};

// --- Helpers ---

function buildRoots(goals: GoalData[]): GoalData[] {
  const ids = new Set(goals.map((g) => g.id));
  return goals.filter((g) => !g.parentId || !ids.has(g.parentId));
}

function getChildren(goals: GoalData[], parentId: string): GoalData[] {
  return goals.filter((g) => g.parentId === parentId);
}

function kpiSummary(kpis: GoalKpiData[]): string {
  if (!kpis.length) return "";
  const avgProgress = kpis.reduce((sum, k) => {
    const p = k.targetValue > 0 ? Math.min(k.currentValue / k.targetValue, 1) * 100 : 0;
    return sum + p * k.weight;
  }, 0) / kpis.reduce((sum, k) => sum + k.weight, 0);
  return `${kpis.length} KPI, ${Math.round(avgProgress)}%`;
}

// --- Owner Combobox ---

function OwnerCombobox({
  employees,
  value,
  onChange,
}: {
  employees: EmployeeOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = employees.find((e) => e.id === value);
  const filtered = search.trim()
    ? employees.filter((e) => {
        const q = search.toLowerCase();
        return e.fullName.toLowerCase().includes(q) || e.position.toLowerCase().includes(q);
      })
    : employees;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center w-full rounded border px-2 py-1.5 text-sm cursor-pointer hover:border-neutral-400"
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 0); }}
      >
        <Search className="h-3.5 w-3.5 text-neutral-400 mr-1.5 shrink-0" />
        <span className={`flex-1 truncate ${selected ? "text-neutral-900" : "text-neutral-400"}`}>
          {selected ? `${selected.fullName} (${selected.position})` : "Не назначен"}
        </span>
        {value && (
          <button
            type="button"
            className="ml-1 p-0.5 rounded hover:bg-neutral-100"
            onClick={(e) => { e.stopPropagation(); onChange(""); setSearch(""); }}
          >
            <X className="h-3 w-3 text-neutral-400" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg">
          <div className="p-1.5 border-b">
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border-0 bg-neutral-50 px-2 py-1 text-sm outline-none placeholder:text-neutral-400"
              placeholder="Поиск по ФИО или должности..."
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-neutral-400">Не найдено</div>
            ) : (
              filtered.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 ${e.id === value ? "bg-neutral-50" : ""}`}
                  onClick={() => { onChange(e.id); setOpen(false); setSearch(""); }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{e.fullName}</div>
                    <div className="text-xs text-neutral-500 truncate">{e.position}</div>
                  </div>
                  {e.id === value && <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Component ---

export default function StrategyPage() {
  const currentScenarioId = useOrgChartStore((s) => s.currentScenarioId);
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"bsc" | "okr">("bsc");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState<GoalType>("BSC_FINANCIAL");
  const [formStatus, setFormStatus] = useState<GoalStatusType>("NOT_STARTED");
  const [formWeight, setFormWeight] = useState(1.0);
  const [formProgress, setFormProgress] = useState(0);
  const [formOwnerId, setFormOwnerId] = useState("");
  const [formDeadline, setFormDeadline] = useState("");
  const [formPeriod, setFormPeriod] = useState("");
  const [formParentId, setFormParentId] = useState("");
  const [formDeptIds, setFormDeptIds] = useState<Set<string>>(new Set());
  const [formKpis, setFormKpis] = useState<GoalKpiData[]>([]);
  const [saving, setSaving] = useState(false);

  const loadGoals = useCallback(() => {
    if (!currentScenarioId) return;
    setLoading(true);
    fetch(`/api/goals?scenarioId=${currentScenarioId}`)
      .then((r) => r.json())
      .then((data) => setGoals(data.goals || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentScenarioId]);

  useEffect(() => { loadGoals(); }, [loadGoals]);

  useEffect(() => {
    if (!currentScenarioId) return;
    fetch(`/api/departments?scenarioId=${currentScenarioId}`)
      .then((r) => r.json())
      .then((data) => {
        const list = (data.departments || data || []).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }));
        setDepartments(list);
      })
      .catch(() => {});
  }, [currentScenarioId]);

  useEffect(() => {
    if (!currentScenarioId) return;
    fetch(`/api/employees?scenarioId=${currentScenarioId}&limit=1000`)
      .then((r) => r.json())
      .then((data) => {
        const list = (data.data || data.employees || []).map((e: { id: string; fullName: string; position: string }) => ({
          id: e.id, fullName: e.fullName, position: e.position,
        }));
        setEmployees(list);
      })
      .catch(() => {});
  }, [currentScenarioId]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleDept(deptId: string) {
    setFormDeptIds((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId); else next.add(deptId);
      return next;
    });
  }

  function addKpi() {
    setFormKpis((prev) => [...prev, { name: "", unit: "", targetValue: 0, currentValue: 0, weight: 1.0 }]);
  }

  function updateKpi(index: number, field: keyof GoalKpiData, value: string | number) {
    setFormKpis((prev) => prev.map((k, i) => i === index ? { ...k, [field]: value } : k));
  }

  function removeKpi(index: number) {
    setFormKpis((prev) => prev.filter((_, i) => i !== index));
  }

  function openCreateForm(type: GoalType, parentId?: string) {
    setEditId(null);
    setFormName("");
    setFormDescription("");
    setFormType(type);
    setFormStatus("NOT_STARTED");
    setFormWeight(1.0);
    setFormProgress(0);
    setFormOwnerId("");
    setFormDeadline("");
    setFormPeriod("");
    setFormParentId(parentId || "");
    setFormDeptIds(new Set());
    setFormKpis([]);
    setShowForm(true);
  }

  function openEditForm(g: GoalData) {
    setEditId(g.id);
    setFormName(g.name);
    setFormDescription(g.description || "");
    setFormType(g.type);
    setFormStatus(g.status);
    setFormWeight(g.weight);
    setFormProgress(g.progress);
    setFormOwnerId(g.ownerId || "");
    setFormDeadline(g.deadline ? g.deadline.slice(0, 10) : "");
    setFormPeriod(g.period || "");
    setFormParentId(g.parentId || "");
    setFormDeptIds(new Set(g.departments.map((d) => d.department.id)));
    setFormKpis(g.kpis.map((k) => ({ name: k.name, unit: k.unit, targetValue: k.targetValue, currentValue: k.currentValue, weight: k.weight })));
    setShowForm(true);
  }

  async function handleSave() {
    if (!formName.trim() || !currentScenarioId) return;
    setSaving(true);

    const body = {
      scenarioId: currentScenarioId,
      name: formName.trim(),
      description: formDescription.trim() || null,
      type: formType,
      status: formStatus,
      weight: formWeight,
      progress: formProgress,
      ownerId: formOwnerId || null,
      deadline: formDeadline || null,
      period: formPeriod.trim() || null,
      parentId: formParentId || null,
      departmentIds: Array.from(formDeptIds),
      kpis: formKpis.filter((k) => k.name.trim()),
    };

    try {
      if (editId) {
        await fetch(`/api/goals/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      setShowForm(false);
      loadGoals();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить цель и все дочерние?")) return;
    await fetch(`/api/goals/${id}`, { method: "DELETE" });
    loadGoals();
  }

  // --- Render helpers ---

  function renderGoalRow(g: GoalData, depth: number) {
    const children = getChildren(goals, g.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(g.id);
    const summary = kpiSummary(g.kpis);

    return (
      <div key={g.id}>
        <div
          className="flex items-center gap-2 border-b px-4 py-2.5 hover:bg-neutral-50"
          style={{ paddingLeft: `${16 + depth * 24}px` }}
        >
          <button
            onClick={() => toggleExpand(g.id)}
            className={`flex h-5 w-5 items-center justify-center rounded ${hasChildren ? "hover:bg-neutral-200" : ""}`}
            disabled={!hasChildren}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="h-4 w-4 text-neutral-500" /> : <ChevronRight className="h-4 w-4 text-neutral-500" />
            ) : (
              <span className="h-4 w-4" />
            )}
          </button>

          <span className="flex-1 text-sm font-medium">{g.name}</span>

          {/* Status */}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[g.status]}`}>
            {STATUS_LABELS[g.status]}
          </span>

          {/* Progress bar */}
          <div className="w-20 flex items-center gap-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
              <div
                className={`h-full rounded-full ${PROGRESS_COLORS[g.status]}`}
                style={{ width: `${Math.min(g.progress, 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-neutral-500 w-7 text-right">{Math.round(g.progress)}%</span>
          </div>

          {/* Owner */}
          <span className="w-44 truncate text-xs text-neutral-500 flex items-center gap-1" title={g.owner ? `${g.owner.fullName}, ${g.owner.position}` : ""}>
            {g.owner ? (
              <><User className="h-3 w-3 shrink-0" />{g.owner.fullName}, {g.owner.position}</>
            ) : "—"}
          </span>

          {/* Period */}
          <span className="w-16 text-xs text-neutral-400 text-center">{g.period || "—"}</span>

          {/* Departments */}
          <span className="w-8 text-center text-xs text-neutral-400" title={g.departments.map((d) => d.department.name).join(", ")}>
            {g.departments.length > 0 && (
              <span className="inline-flex items-center gap-0.5"><Building2 className="h-3 w-3" />{g.departments.length}</span>
            )}
          </span>

          {/* KPI summary */}
          <span className="w-20 text-center text-[10px] text-neutral-400">{summary}</span>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button onClick={() => openCreateForm(g.type, g.id)} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600" title="Добавить подцель">
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => openEditForm(g)} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600" title="Редактировать">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => handleDelete(g.id)} className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600" title="Удалить">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {isExpanded && children.map((c) => renderGoalRow(c, depth + 1))}
      </div>
    );
  }

  function renderPerspective(type: GoalType, label: string, bgColor: string, icon: string) {
    const perspGoals = goals.filter((g) => g.type === type);
    const roots = buildRoots(perspGoals);
    const avgProgress = perspGoals.length > 0
      ? Math.round(perspGoals.reduce((s, g) => s + g.progress, 0) / perspGoals.length)
      : 0;

    return (
      <div key={type} className={`rounded-lg border ${bgColor} overflow-hidden`}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <h3 className="text-sm font-semibold">{label}</h3>
            <span className="text-xs text-neutral-500">{perspGoals.length} целей</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-neutral-500" />
              <span className="text-xs font-medium">{avgProgress}%</span>
            </div>
            <button
              onClick={() => openCreateForm(type)}
              className="rounded p-1 hover:bg-white/60"
              title="Добавить цель"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {roots.length > 0 && (
          <div className="bg-white border-t">
            {roots.map((g) => renderGoalRow(g, 0))}
          </div>
        )}
      </div>
    );
  }

  if (!currentScenarioId) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-400">
        Выберите сценарий
      </div>
    );
  }

  const okrGoals = goals.filter((g) => g.type === "OKR");
  const okrRoots = buildRoots(okrGoals);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crosshair className="h-6 w-6 text-neutral-700" />
          <h1 className="text-xl font-bold">Стратегия</h1>
          <span className="text-sm text-neutral-400">{goals.length} целей</span>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-lg bg-neutral-100 p-1">
          <button
            onClick={() => setActiveTab("bsc")}
            className={`rounded-md px-3 py-1 text-sm font-medium transition ${activeTab === "bsc" ? "bg-white shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
            title='Balanced Scorecard "Сбалансированная система показателей"'
          >
            BSC
          </button>
          <button
            onClick={() => setActiveTab("okr")}
            className={`rounded-md px-3 py-1 text-sm font-medium transition ${activeTab === "okr" ? "bg-white shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
            title='Objectives & Key Results "Цели и ключевые результаты"'
          >
            OKR
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-lg border bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold">{editId ? "Редактировать цель" : "Новая цель"}</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Название *</label>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" placeholder="Название цели" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Тип</label>
              <select value={formType} onChange={(e) => setFormType(e.target.value as GoalType)} className="w-full rounded border px-2 py-1.5 text-sm">
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Статус</label>
              <select value={formStatus} onChange={(e) => setFormStatus(e.target.value as GoalStatusType)} className="w-full rounded border px-2 py-1.5 text-sm">
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Владелец</label>
              <OwnerCombobox
                employees={employees}
                value={formOwnerId}
                onChange={setFormOwnerId}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Период</label>
              <input value={formPeriod} onChange={(e) => setFormPeriod(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" placeholder="Q1 2026" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Дедлайн</label>
              <input type="date" value={formDeadline} onChange={(e) => setFormDeadline(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Прогресс (%)</label>
              <input type="number" min={0} max={100} value={formProgress} onChange={(e) => setFormProgress(Number(e.target.value))} className="w-full rounded border px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Вес</label>
              <input type="number" min={0} step={0.1} value={formWeight} onChange={(e) => setFormWeight(Number(e.target.value))} className="w-full rounded border px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Родительская цель</label>
              <select value={formParentId} onChange={(e) => setFormParentId(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm">
                <option value="">Корневая</option>
                {goals.filter((g) => g.id !== editId && g.type === formType).map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-neutral-500">Описание</label>
              <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" rows={2} placeholder="Описание цели" />
            </div>
          </div>

          {/* Departments multi-select */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Подразделения</label>
            <div className="flex flex-wrap gap-1.5 rounded border p-2 max-h-24 overflow-auto">
              {departments.map((d) => (
                <label key={d.id} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs cursor-pointer transition ${formDeptIds.has(d.id) ? "bg-neutral-800 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
                  <input type="checkbox" checked={formDeptIds.has(d.id)} onChange={() => toggleDept(d.id)} className="hidden" />
                  {d.name}
                </label>
              ))}
              {departments.length === 0 && <span className="text-xs text-neutral-400">Нет подразделений</span>}
            </div>
          </div>

          {/* KPIs */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-neutral-500">KPI</label>
              <button onClick={addKpi} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                <Plus className="h-3 w-3" />Добавить KPI
              </button>
            </div>
            {formKpis.length > 0 && (
              <div className="space-y-2">
                {formKpis.map((k, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={k.name} onChange={(e) => updateKpi(i, "name", e.target.value)} className="flex-1 rounded border px-2 py-1 text-xs" placeholder="Название KPI" />
                    <input value={k.unit} onChange={(e) => updateKpi(i, "unit", e.target.value)} className="w-16 rounded border px-2 py-1 text-xs" placeholder="Ед." />
                    <input type="number" value={k.targetValue} onChange={(e) => updateKpi(i, "targetValue", Number(e.target.value))} className="w-20 rounded border px-2 py-1 text-xs" placeholder="План" />
                    <input type="number" value={k.currentValue} onChange={(e) => updateKpi(i, "currentValue", Number(e.target.value))} className="w-20 rounded border px-2 py-1 text-xs" placeholder="Факт" />
                    <button onClick={() => removeKpi(i)} className="rounded p-1 text-neutral-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!formName.trim() || saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:bg-neutral-300"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editId ? "Сохранить" : "Создать"}
            </button>
            <button onClick={() => setShowForm(false)} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-neutral-50">
              <X className="h-4 w-4" />
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      ) : activeTab === "bsc" ? (
        /* BSC Perspectives */
        <div className="space-y-4">
          {goals.filter((g) => g.type !== "OKR").length === 0 && !showForm ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-400">
              Нет целей BSC. Добавьте цель в одну из перспектив.
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-4">
            {PERSPECTIVES.map((p) => renderPerspective(p.type, p.label, p.bgColor, p.icon))}
          </div>
        </div>
      ) : (
        /* OKR */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_COLORS.OKR}`}>OKR</span>
              <span className="text-neutral-400 font-normal">{okrGoals.length} целей</span>
            </h2>
            <button
              onClick={() => openCreateForm("OKR")}
              className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              <Plus className="h-4 w-4" />Добавить OKR
            </button>
          </div>

          {okrRoots.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-400">
              Нет OKR-целей. Нажмите «Добавить OKR» для создания.
            </div>
          ) : (
            <div className="rounded-lg border bg-white overflow-hidden">
              <div className="flex items-center gap-2 border-b bg-neutral-50 px-4 py-2 text-xs font-medium uppercase text-neutral-500">
                <span className="flex-1 pl-7">Цель</span>
                <span className="w-20 text-center">Статус</span>
                <span className="w-20 text-center">Прогресс</span>
                <span className="w-44">Владелец</span>
                <span className="w-16 text-center">Период</span>
                <span className="w-8" />
                <span className="w-20 text-center">KPI</span>
                <span className="w-24" />
              </div>
              {okrRoots.map((g) => renderGoalRow(g, 0))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
