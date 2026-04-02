"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useOrgChartStore } from "@/lib/store";
import {
  Network,
  Plus,
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  Loader2,
  Save,
  X,
  Grid3X3,
} from "lucide-react";
import Link from "next/link";

interface ProcessData {
  id: string;
  name: string;
  description: string | null;
  level: "MACRO" | "PROCESS" | "SUBPROCESS";
  status: "ACTIVE" | "PLANNED" | "DEPRECATED";
  ownerDeptId: string | null;
  parentId: string | null;
  sortOrder: number;
  kpis: Array<{ id: string; name: string; targetValue: string | null; currentValue: string | null; unit: string | null }>;
  participants: Array<{ id: string; departmentId: string; role: string }>;
  _count: { children: number };
}

interface DeptOption {
  id: string;
  name: string;
}

const LEVEL_LABELS: Record<string, string> = {
  MACRO: "Макропроцесс",
  PROCESS: "Процесс",
  SUBPROCESS: "Подпроцесс",
};

const LEVEL_COLORS: Record<string, string> = {
  MACRO: "bg-purple-100 text-purple-700",
  PROCESS: "bg-blue-100 text-blue-700",
  SUBPROCESS: "bg-neutral-100 text-neutral-600",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Активный",
  PLANNED: "Планируемый",
  DEPRECATED: "Устаревший",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  PLANNED: "bg-amber-100 text-amber-700",
  DEPRECATED: "bg-red-100 text-red-700",
};

function buildTree(processes: ProcessData[]): ProcessData[] {
  const map = new Map(processes.map((p) => [p.id, p]));
  return processes.filter((p) => !p.parentId || !map.has(p.parentId));
}

function getChildren(processes: ProcessData[], parentId: string): ProcessData[] {
  return processes.filter((p) => p.parentId === parentId);
}

export default function ProcessesPage() {
  const router = useRouter();
  const currentScenarioId = useOrgChartStore((s) => s.currentScenarioId);
  const [processes, setProcesses] = useState<ProcessData[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formLevel, setFormLevel] = useState<string>("MACRO");
  const [formStatus, setFormStatus] = useState<string>("ACTIVE");
  const [formOwner, setFormOwner] = useState("");
  const [formParentId, setFormParentId] = useState("");
  const [saving, setSaving] = useState(false);

  const loadProcesses = useCallback(() => {
    if (!currentScenarioId) return;
    setLoading(true);
    fetch(`/api/processes?scenarioId=${currentScenarioId}`)
      .then((r) => r.json())
      .then((data) => setProcesses(data.processes || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentScenarioId]);

  useEffect(() => {
    loadProcesses();
  }, [loadProcesses]);

  useEffect(() => {
    if (!currentScenarioId) return;
    fetch(`/api/departments?scenarioId=${currentScenarioId}`)
      .then((r) => r.json())
      .then((data) => {
        const depts = (data.departments || data || []).map((d: { id: string; name: string }) => ({
          id: d.id,
          name: d.name,
        }));
        setDepartments(depts);
      })
      .catch(() => {});
  }, [currentScenarioId]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreateForm(parentId?: string) {
    setEditId(null);
    setFormName("");
    setFormDescription("");
    setFormLevel(parentId ? "PROCESS" : "MACRO");
    setFormStatus("ACTIVE");
    setFormOwner("");
    setFormParentId(parentId || "");
    setShowForm(true);
  }

  function openEditForm(p: ProcessData) {
    setEditId(p.id);
    setFormName(p.name);
    setFormDescription(p.description || "");
    setFormLevel(p.level);
    setFormStatus(p.status);
    setFormOwner(p.ownerDeptId || "");
    setFormParentId(p.parentId || "");
    setShowForm(true);
  }

  async function handleSave() {
    if (!formName.trim() || !currentScenarioId) return;
    setSaving(true);

    const body = {
      scenarioId: currentScenarioId,
      name: formName.trim(),
      description: formDescription.trim() || null,
      level: formLevel,
      status: formStatus,
      ownerDeptId: formOwner || null,
      parentId: formParentId || null,
    };

    try {
      if (editId) {
        await fetch(`/api/processes/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/processes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      setShowForm(false);
      loadProcesses();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить процесс?")) return;
    await fetch(`/api/processes/${id}`, { method: "DELETE" });
    loadProcesses();
  }

  function getDeptName(id: string | null): string {
    if (!id) return "—";
    return departments.find((d) => d.id === id)?.name || "—";
  }

  function renderProcessRow(p: ProcessData, depth: number) {
    const children = getChildren(processes, p.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(p.id);

    return (
      <div key={p.id}>
        <div
          className="flex items-center gap-2 border-b px-4 py-2.5 hover:bg-neutral-50"
          style={{ paddingLeft: `${16 + depth * 24}px` }}
        >
          {/* Expand toggle */}
          <button
            onClick={() => toggleExpand(p.id)}
            className={`flex h-5 w-5 items-center justify-center rounded ${hasChildren ? "hover:bg-neutral-200" : ""}`}
            disabled={!hasChildren}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4 text-neutral-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-neutral-500" />
              )
            ) : (
              <span className="h-4 w-4" />
            )}
          </button>

          {/* Name */}
          <span
            className="flex-1 text-sm font-medium cursor-pointer hover:text-blue-600 hover:underline"
            onClick={() => router.push(`/processes/${p.id}`)}
          >
            {p.name}
          </span>

          {/* Level badge */}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${LEVEL_COLORS[p.level]}`}>
            {LEVEL_LABELS[p.level]}
          </span>

          {/* Status badge */}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[p.status]}`}>
            {STATUS_LABELS[p.status]}
          </span>

          {/* Owner */}
          <span className="w-36 truncate text-xs text-neutral-500">
            {getDeptName(p.ownerDeptId)}
          </span>

          {/* KPIs count */}
          <span className="w-12 text-center text-xs text-neutral-400">
            {p.kpis.length} KPI
          </span>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => openCreateForm(p.id)}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
              title="Добавить дочерний"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => openEditForm(p)}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
              title="Редактировать"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleDelete(p.id)}
              className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
              title="Удалить"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Children */}
        {isExpanded && children.map((c) => renderProcessRow(c, depth + 1))}
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

  const rootProcesses = buildTree(processes);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network className="h-6 w-6 text-neutral-700" />
          <h1 className="text-xl font-bold">Процессы</h1>
          <span className="text-sm text-neutral-400">{processes.length} процессов</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/processes/raci"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
          >
            <Grid3X3 className="h-4 w-4" />
            RACI-матрица
          </Link>
          <button
            onClick={() => openCreateForm()}
            className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            <Plus className="h-4 w-4" />
            Добавить
          </button>
        </div>
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <div className="rounded-lg border bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold">{editId ? "Редактировать" : "Новый процесс"}</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Название *</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-sm"
                placeholder="Название процесса"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Уровень</label>
              <select value={formLevel} onChange={(e) => setFormLevel(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm">
                <option value="MACRO">Макропроцесс</option>
                <option value="PROCESS">Процесс</option>
                <option value="SUBPROCESS">Подпроцесс</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Владелец (подразделение)</label>
              <select value={formOwner} onChange={(e) => setFormOwner(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm">
                <option value="">Не назначен</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Статус</label>
              <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm">
                <option value="ACTIVE">Активный</option>
                <option value="PLANNED">Планируемый</option>
                <option value="DEPRECATED">Устаревший</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Родительский процесс</label>
              <select value={formParentId} onChange={(e) => setFormParentId(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm">
                <option value="">Корневой</option>
                {processes.filter((p) => p.id !== editId).map((p) => (
                  <option key={p.id} value={p.id}>{LEVEL_LABELS[p.level]}: {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Описание</label>
              <input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-sm"
                placeholder="Краткое описание"
              />
            </div>
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
            <button
              onClick={() => setShowForm(false)}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
            >
              <X className="h-4 w-4" />
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Process tree */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      ) : processes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-400">
          Нет процессов. Нажмите «Добавить» для создания первого макропроцесса.
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 border-b bg-neutral-50 px-4 py-2 text-xs font-medium uppercase text-neutral-500">
            <span className="flex-1 pl-7">Название</span>
            <span className="w-24 text-center">Уровень</span>
            <span className="w-20 text-center">Статус</span>
            <span className="w-36">Владелец</span>
            <span className="w-12 text-center">KPI</span>
            <span className="w-24" />
          </div>
          {rootProcesses.map((p) => renderProcessRow(p, 0))}
        </div>
      )}
    </div>
  );
}
