"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrgChartStore } from "@/lib/store";
import Link from "next/link";
import {
  ArrowLeft,
  Network,
  Plus,
  Trash2,
  Save,
  Loader2,
  X,
  ChevronRight,
} from "lucide-react";

interface ProcessDetail {
  id: string;
  name: string;
  description: string | null;
  level: string;
  status: string;
  ownerDeptId: string | null;
  parentId: string | null;
  kpis: KpiData[];
  participants: ParticipantData[];
  children: Array<{ id: string; name: string; level: string; status: string }>;
}

interface KpiData {
  id: string;
  name: string;
  targetValue: string | null;
  currentValue: string | null;
  unit: string | null;
  description: string | null;
}

interface ParticipantData {
  id: string;
  departmentId: string;
  role: string;
}

interface DeptOption {
  id: string;
  name: string;
}

const LEVEL_LABELS: Record<string, string> = { MACRO: "Макропроцесс", PROCESS: "Процесс", SUBPROCESS: "Подпроцесс" };
const STATUS_LABELS: Record<string, string> = { ACTIVE: "Активный", PLANNED: "Планируемый", DEPRECATED: "Устаревший" };
const LEVEL_COLORS: Record<string, string> = { MACRO: "bg-purple-100 text-purple-700", PROCESS: "bg-blue-100 text-blue-700", SUBPROCESS: "bg-neutral-100 text-neutral-600" };
const STATUS_COLORS: Record<string, string> = { ACTIVE: "bg-green-100 text-green-700", PLANNED: "bg-amber-100 text-amber-700", DEPRECATED: "bg-red-100 text-red-700" };

type RaciRole = "RESPONSIBLE" | "ACCOUNTABLE" | "CONSULTED" | "INFORMED";
const RACI_OPTIONS: Array<{ value: RaciRole | ""; short: string; color: string }> = [
  { value: "", short: "—", color: "bg-white text-neutral-300" },
  { value: "RESPONSIBLE", short: "R", color: "bg-blue-500 text-white" },
  { value: "ACCOUNTABLE", short: "A", color: "bg-red-500 text-white" },
  { value: "CONSULTED", short: "C", color: "bg-amber-400 text-white" },
  { value: "INFORMED", short: "I", color: "bg-green-500 text-white" },
];

type TabId = "info" | "flowchart" | "vad";
const TABS: Array<{ id: TabId; label: string }> = [
  { id: "info", label: "Информация" },
  { id: "flowchart", label: "Flowchart" },
  { id: "vad", label: "VAD" },
];

export default function ProcessDetailPage() {
  const params = useParams();
  const router = useRouter();
  const processId = params.id as string;
  const currentScenarioId = useOrgChartStore((s) => s.currentScenarioId);

  const [process, setProcess] = useState<ProcessDetail | null>(null);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("info");

  // KPI form
  const [showKpiForm, setShowKpiForm] = useState(false);
  const [kpiName, setKpiName] = useState("");
  const [kpiTarget, setKpiTarget] = useState("");
  const [kpiCurrent, setKpiCurrent] = useState("");
  const [kpiUnit, setKpiUnit] = useState("");
  const [savingKpi, setSavingKpi] = useState(false);

  // RACI
  const [raciMap, setRaciMap] = useState<Record<string, RaciRole | "">>({});
  const [raciDepts, setRaciDepts] = useState<string[]>([]);
  const [savingRaci, setSavingRaci] = useState(false);
  const [addDeptId, setAddDeptId] = useState("");

  const loadProcess = useCallback(() => {
    setLoading(true);
    fetch(`/api/processes/${processId}`)
      .then((r) => r.json())
      .then((data) => {
        const p = data.process as ProcessDetail;
        setProcess(p);
        // Build RACI map
        const map: Record<string, RaciRole | ""> = {};
        const deptIds: string[] = [];
        for (const part of p.participants) {
          map[part.departmentId] = part.role as RaciRole;
          if (!deptIds.includes(part.departmentId)) deptIds.push(part.departmentId);
        }
        setRaciMap(map);
        setRaciDepts(deptIds);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [processId]);

  useEffect(() => { loadProcess(); }, [loadProcess]);

  useEffect(() => {
    if (!currentScenarioId) return;
    fetch(`/api/departments?scenarioId=${currentScenarioId}`)
      .then((r) => r.json())
      .then((data) => setDepartments((data.departments || data || []).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }))))
      .catch(() => {});
  }, [currentScenarioId]);

  function getDeptName(id: string): string {
    return departments.find((d) => d.id === id)?.name || id;
  }

  // KPI handlers
  async function handleAddKpi() {
    if (!kpiName.trim()) return;
    setSavingKpi(true);
    await fetch(`/api/processes/${processId}/kpis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: kpiName, targetValue: kpiTarget || null, currentValue: kpiCurrent || null, unit: kpiUnit || null }),
    });
    setKpiName(""); setKpiTarget(""); setKpiCurrent(""); setKpiUnit("");
    setShowKpiForm(false);
    setSavingKpi(false);
    loadProcess();
  }

  async function handleDeleteKpi(kpiId: string) {
    await fetch(`/api/processes/${processId}/kpis/${kpiId}`, { method: "DELETE" });
    loadProcess();
  }

  // RACI handlers
  function cycleRole(deptId: string) {
    const order: Array<RaciRole | ""> = ["", "RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"];
    const current = raciMap[deptId] || "";
    const idx = order.indexOf(current);
    setRaciMap({ ...raciMap, [deptId]: order[(idx + 1) % order.length] });
  }

  function addRaciDept() {
    if (!addDeptId || raciDepts.includes(addDeptId)) return;
    setRaciDepts([...raciDepts, addDeptId]);
    setRaciMap({ ...raciMap, [addDeptId]: "" });
    setAddDeptId("");
  }

  function removeRaciDept(deptId: string) {
    setRaciDepts(raciDepts.filter((d) => d !== deptId));
    const newMap = { ...raciMap };
    delete newMap[deptId];
    setRaciMap(newMap);
  }

  async function saveRaci() {
    setSavingRaci(true);
    const participants: Array<{ departmentId: string; role: RaciRole }> = [];
    for (const deptId of raciDepts) {
      const role = raciMap[deptId];
      if (role) participants.push({ departmentId: deptId, role });
    }
    await fetch(`/api/processes/${processId}/raci`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participants }),
    });
    setSavingRaci(false);
    loadProcess();
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-neutral-400" /></div>;
  }

  if (!process) {
    return <div className="flex h-full items-center justify-center text-neutral-400">Процесс не найден</div>;
  }

  const availableDepts = departments.filter((d) => !raciDepts.includes(d.id));

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/processes")} className="rounded p-1 hover:bg-neutral-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Network className="h-5 w-5 text-neutral-500" />
        <h1 className="text-xl font-bold">{process.name}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_COLORS[process.level]}`}>{LEVEL_LABELS[process.level]}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[process.status]}`}>{STATUS_LABELS[process.status]}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-neutral-800 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "info" && (
        <div className="space-y-6">
          {/* Basic info */}
          <div className="rounded-lg border bg-white p-4 space-y-2">
            <h2 className="text-sm font-semibold">Основная информация</h2>
            {process.description && <p className="text-sm text-neutral-600">{process.description}</p>}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><span className="text-neutral-500">Владелец:</span> <span className="font-medium">{process.ownerDeptId ? getDeptName(process.ownerDeptId) : "Не назначен"}</span></div>
              <div><span className="text-neutral-500">Уровень:</span> <span className="font-medium">{LEVEL_LABELS[process.level]}</span></div>
              <div><span className="text-neutral-500">Статус:</span> <span className="font-medium">{STATUS_LABELS[process.status]}</span></div>
            </div>
          </div>

          {/* KPIs */}
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">KPI ({process.kpis.length})</h2>
              <button onClick={() => setShowKpiForm(true)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-neutral-100">
                <Plus className="h-3.5 w-3.5" /> Добавить
              </button>
            </div>
            {showKpiForm && (
              <div className="mb-3 flex items-end gap-2 rounded border bg-neutral-50 p-3">
                <div className="flex-1"><label className="block text-[10px] text-neutral-500">Название *</label><input value={kpiName} onChange={(e) => setKpiName(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></div>
                <div className="w-24"><label className="block text-[10px] text-neutral-500">Цель</label><input value={kpiTarget} onChange={(e) => setKpiTarget(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></div>
                <div className="w-24"><label className="block text-[10px] text-neutral-500">Текущее</label><input value={kpiCurrent} onChange={(e) => setKpiCurrent(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></div>
                <div className="w-20"><label className="block text-[10px] text-neutral-500">Ед.</label><input value={kpiUnit} onChange={(e) => setKpiUnit(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" /></div>
                <button onClick={handleAddKpi} disabled={!kpiName.trim() || savingKpi} className="rounded bg-neutral-800 px-2 py-1 text-xs text-white hover:bg-neutral-700 disabled:bg-neutral-300">
                  {savingKpi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => setShowKpiForm(false)} className="rounded px-2 py-1 text-xs hover:bg-neutral-100"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
            {process.kpis.length === 0 ? (
              <div className="text-xs text-neutral-400">Нет KPI</div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b text-xs text-neutral-500"><th className="py-1 text-left">Название</th><th className="py-1 text-center">Цель</th><th className="py-1 text-center">Текущее</th><th className="py-1 text-center">Ед.</th><th className="py-1 w-8" /></tr></thead>
                <tbody>
                  {process.kpis.map((kpi) => (
                    <tr key={kpi.id} className="border-b last:border-0">
                      <td className="py-1.5">{kpi.name}</td>
                      <td className="py-1.5 text-center font-medium">{kpi.targetValue || "—"}</td>
                      <td className="py-1.5 text-center">{kpi.currentValue || "—"}</td>
                      <td className="py-1.5 text-center text-neutral-500">{kpi.unit || ""}</td>
                      <td className="py-1.5"><button onClick={() => handleDeleteKpi(kpi.id)} className="rounded p-0.5 text-neutral-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* RACI */}
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">RACI-участники</h2>
              <button onClick={saveRaci} disabled={savingRaci} className="inline-flex items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs text-white hover:bg-neutral-700 disabled:bg-neutral-300">
                {savingRaci ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Сохранить
              </button>
            </div>
            {/* Add dept */}
            <div className="mb-3 flex items-center gap-2">
              <select value={addDeptId} onChange={(e) => setAddDeptId(e.target.value)} className="rounded border px-2 py-1 text-sm flex-1">
                <option value="">Добавить подразделение...</option>
                {availableDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button onClick={addRaciDept} disabled={!addDeptId} className="rounded border px-2 py-1 text-sm hover:bg-neutral-50 disabled:text-neutral-300">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {raciDepts.length === 0 ? (
              <div className="text-xs text-neutral-400">Нет участников. Добавьте подразделения выше.</div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b text-xs text-neutral-500"><th className="py-1 text-left">Подразделение</th><th className="py-1 text-center">Роль</th><th className="py-1 w-8" /></tr></thead>
                <tbody>
                  {raciDepts.map((deptId) => {
                    const role = raciMap[deptId] || "";
                    const opt = RACI_OPTIONS.find((o) => o.value === role) || RACI_OPTIONS[0];
                    return (
                      <tr key={deptId} className="border-b last:border-0">
                        <td className="py-1.5">{getDeptName(deptId)}</td>
                        <td className="py-1.5 text-center">
                          <button onClick={() => cycleRole(deptId)} className={`inline-flex h-7 w-7 items-center justify-center rounded text-xs font-bold ${opt.color}`}>
                            {opt.short}
                          </button>
                        </td>
                        <td className="py-1.5"><button onClick={() => removeRaciDept(deptId)} className="rounded p-0.5 text-neutral-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Children */}
          {process.children.length > 0 && (
            <div className="rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold mb-3">Дочерние процессы ({process.children.length})</h2>
              <div className="space-y-1">
                {process.children.map((c) => (
                  <Link key={c.id} href={`/processes/${c.id}`} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-50">
                    <ChevronRight className="h-4 w-4 text-neutral-400" />
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${LEVEL_COLORS[c.level]}`}>{LEVEL_LABELS[c.level]}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "flowchart" && (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-neutral-400">
          Flowchart-редактор будет реализован в итерации 2.7
        </div>
      )}

      {activeTab === "vad" && (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-neutral-400">
          VAD-визуализация будет реализована в итерации 2.8
        </div>
      )}
    </div>
  );
}
