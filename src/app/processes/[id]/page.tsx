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
import { FlowchartEditor } from "@/components/process-diagram/FlowchartEditor";
import { VadDiagram } from "@/components/process-diagram/VadDiagram";

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

type TabId = "info" | "raci" | "flowchart" | "vad";
const TABS: Array<{ id: TabId; label: string }> = [
  { id: "info", label: "Информация" },
  { id: "raci", label: "RACI" },
  { id: "flowchart", label: "Flowchart" },
  { id: "vad", label: "VAD" },
];

type RaciRole = "RESPONSIBLE" | "ACCOUNTABLE" | "CONSULTED" | "INFORMED";
const RACI_OPTIONS: Array<{ value: RaciRole | ""; short: string; color: string }> = [
  { value: "", short: "—", color: "bg-white text-neutral-300 border" },
  { value: "RESPONSIBLE", short: "R", color: "bg-blue-500 text-white" },
  { value: "ACCOUNTABLE", short: "A", color: "bg-red-500 text-white" },
  { value: "CONSULTED", short: "C", color: "bg-amber-400 text-white" },
  { value: "INFORMED", short: "I", color: "bg-green-500 text-white" },
];

function RaciMatrixTab({
  process,
  departments,
  allProcesses,
  onSaved,
}: {
  process: ProcessDetail;
  departments: DeptOption[];
  allProcesses: ProcessDetail[];
  onSaved: () => void;
}) {
  // Matrix processes: current + children
  const matrixProcesses = [process, ...allProcesses.filter((p) => p.parentId === process.id)];

  // Collect all departments already participating
  const initialDeptIds = new Set<string>();
  for (const p of matrixProcesses) {
    for (const part of p.participants) {
      initialDeptIds.add(part.departmentId);
    }
  }

  const [selectedDepts, setSelectedDepts] = useState<string[]>(Array.from(initialDeptIds));
  const [matrix, setMatrix] = useState<Record<string, Record<string, RaciRole | "">>>({});
  const [saving, setSaving] = useState(false);
  const [addDeptId, setAddDeptId] = useState("");

  // Initialize matrix from participants
  useEffect(() => {
    const m: Record<string, Record<string, RaciRole | "">> = {};
    for (const p of matrixProcesses) {
      m[p.id] = {};
      for (const part of p.participants) {
        m[p.id][part.departmentId] = part.role as RaciRole;
      }
    }
    setMatrix(m);

    const deptIds = new Set<string>();
    for (const p of matrixProcesses) {
      for (const part of p.participants) {
        deptIds.add(part.departmentId);
      }
    }
    setSelectedDepts(Array.from(deptIds));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process.id]);

  function cycleRole(processId: string, deptId: string) {
    const order: Array<RaciRole | ""> = ["", "RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"];
    const current = matrix[processId]?.[deptId] || "";
    const idx = order.indexOf(current);
    setMatrix((prev) => ({
      ...prev,
      [processId]: { ...prev[processId], [deptId]: order[(idx + 1) % order.length] },
    }));
  }

  function addDept() {
    if (!addDeptId || selectedDepts.includes(addDeptId)) return;
    setSelectedDepts([...selectedDepts, addDeptId]);
    setAddDeptId("");
  }

  function removeDept(deptId: string) {
    setSelectedDepts(selectedDepts.filter((d) => d !== deptId));
    // Clean matrix
    const newMatrix = { ...matrix };
    for (const pid of Object.keys(newMatrix)) {
      const row = { ...newMatrix[pid] };
      delete row[deptId];
      newMatrix[pid] = row;
    }
    setMatrix(newMatrix);
  }

  function getDeptName(id: string): string {
    return departments.find((d) => d.id === id)?.name || id;
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const p of matrixProcesses) {
        const participants: Array<{ departmentId: string; role: RaciRole }> = [];
        for (const deptId of selectedDepts) {
          const role = matrix[p.id]?.[deptId];
          if (role) participants.push({ departmentId: deptId, role });
        }
        await fetch(`/api/processes/${p.id}/raci`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participants }),
        });
      }
      onSaved();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  const availableDepts = departments.filter((d) => !selectedDepts.includes(d.id));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">
            RACI-матрица: {process.name}
            {matrixProcesses.length > 1 && ` + ${matrixProcesses.length - 1} дочерних`}
          </h2>
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1 rounded bg-neutral-800 px-3 py-1.5 text-xs text-white hover:bg-neutral-700 disabled:bg-neutral-300">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Сохранить
          </button>
        </div>

        {/* Legend */}
        <div className="mb-3 flex items-center gap-2 text-xs text-neutral-500">
          {RACI_OPTIONS.filter((o) => o.value).map((o) => (
            <span key={o.value} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold ${o.color}`}>
              {o.short}
            </span>
          ))}
          <span className="ml-1">— кликните на ячейку для переключения</span>
        </div>

        {/* Add department */}
        <div className="mb-3 flex items-center gap-2">
          <select value={addDeptId} onChange={(e) => setAddDeptId(e.target.value)} className="rounded border px-2 py-1.5 text-sm flex-1">
            <option value="">Добавить подразделение...</option>
            {availableDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button onClick={addDept} disabled={!addDeptId} className="rounded border px-2 py-1.5 text-sm hover:bg-neutral-50 disabled:text-neutral-300">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {selectedDepts.length === 0 ? (
          <div className="rounded border border-dashed p-8 text-center text-xs text-neutral-400">
            Добавьте подразделения для построения RACI-матрицы.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-neutral-50">
                  <th className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left text-xs font-medium text-neutral-500 min-w-[180px]">
                    Процесс
                  </th>
                  {selectedDepts.map((deptId) => (
                    <th key={deptId} className="px-1 py-2 text-center text-xs font-medium text-neutral-500 min-w-[60px]">
                      <div className="flex flex-col items-center gap-1">
                        <span className="truncate max-w-[80px]" title={getDeptName(deptId)}>{getDeptName(deptId)}</span>
                        <button onClick={() => removeDept(deptId)} className="text-neutral-300 hover:text-red-500">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixProcesses.map((p) => (
                  <tr key={p.id} className={`border-b hover:bg-neutral-50/50 ${p.id === process.id ? "bg-blue-50/30" : ""}`}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 text-xs font-medium">
                      {p.id === process.id ? p.name : `↳ ${p.name}`}
                    </td>
                    {selectedDepts.map((deptId) => {
                      const role = matrix[p.id]?.[deptId] || "";
                      const opt = RACI_OPTIONS.find((o) => o.value === role) || RACI_OPTIONS[0];
                      return (
                        <td key={deptId} className="px-1 py-1 text-center">
                          <button
                            onClick={() => cycleRole(p.id, deptId)}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded text-xs font-bold ${opt.color}`}
                            title={`${p.name} × ${getDeptName(deptId)}`}
                          >
                            {opt.short}
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
      </div>
    </div>
  );
}

function FlowchartTab({ processId }: { processId: string }) {
  const [diagramId, setDiagramId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/diagrams?processId=${processId}`)
      .then((r) => r.json())
      .then((data) => {
        const flowchart = (data.diagrams || []).find((d: { type: string }) => d.type === "FLOWCHART");
        if (flowchart) setDiagramId(flowchart.id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [processId]);

  if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-neutral-400" /></div>;

  return (
    <FlowchartEditor
      processId={processId}
      diagramId={diagramId}
      onDiagramCreated={(id) => setDiagramId(id)}
    />
  );
}

export default function ProcessDetailPage() {
  const params = useParams();
  const router = useRouter();
  const processId = params.id as string;
  const currentScenarioId = useOrgChartStore((s) => s.currentScenarioId);

  const [process, setProcess] = useState<ProcessDetail | null>(null);
  const [processes, setProcesses] = useState<ProcessDetail[]>([]);
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

  const loadProcess = useCallback(() => {
    setLoading(true);
    fetch(`/api/processes/${processId}`)
      .then((r) => r.json())
      .then((data) => {
        setProcess(data.process as ProcessDetail);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [processId]);

  useEffect(() => { loadProcess(); }, [loadProcess]);

  // Load all processes for RACI matrix
  useEffect(() => {
    if (!currentScenarioId) return;
    fetch(`/api/processes?scenarioId=${currentScenarioId}`)
      .then((r) => r.json())
      .then((data) => setProcesses(data.processes || []))
      .catch(() => {});
  }, [currentScenarioId]);

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

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-neutral-400" /></div>;
  }

  if (!process) {
    return <div className="flex h-full items-center justify-center text-neutral-400">Процесс не найден</div>;
  }

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

      {activeTab === "raci" && process && (
        <RaciMatrixTab
          process={process}
          departments={departments}
          allProcesses={processes}
          onSaved={loadProcess}
        />
      )}

      {activeTab === "flowchart" && (
        <FlowchartTab processId={processId} />
      )}

      {activeTab === "vad" && currentScenarioId && (
        <VadDiagram processId={processId} scenarioId={currentScenarioId} />
      )}
    </div>
  );
}
