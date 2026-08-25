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
import { RaciMatrix } from "@/components/process-diagram/RaciMatrix";

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
const LEVEL_COLORS: Record<string, string> = { MACRO: "bg-[#FFE7D8] text-accent-orange-700", PROCESS: "bg-blue-100 text-blue-700", SUBPROCESS: "bg-neutral-100 text-neutral-600" };
const STATUS_COLORS: Record<string, string> = { ACTIVE: "bg-green-100 text-green-700", PLANNED: "bg-amber-100 text-amber-700", DEPRECATED: "bg-red-100 text-red-700" };

type TabId = "info" | "raci" | "diagram";
const TABS: Array<{ id: TabId; label: string }> = [
  { id: "info", label: "Информация" },
  { id: "raci", label: "RACI" },
  { id: "diagram", label: "Схема" },
];



type DiagramSubTab = "flowchart" | "vad";

function DiagramTab({ processId, scenarioId }: { processId: string; scenarioId: string | null }) {
  const [subTab, setSubTab] = useState<DiagramSubTab>("flowchart");

  return (
    <div className="space-y-3">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setSubTab("flowchart")}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
            subTab === "flowchart"
              ? "border-neutral-700 text-neutral-900"
              : "border-transparent text-neutral-400 hover:text-neutral-600"
          }`}
        >
          Flowchart
        </button>
        <button
          onClick={() => setSubTab("vad")}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
            subTab === "vad"
              ? "border-neutral-700 text-neutral-900"
              : "border-transparent text-neutral-400 hover:text-neutral-600"
          }`}
        >
          VAD
        </button>
      </div>

      {subTab === "flowchart" && (
        <FlowchartTab processId={processId} />
      )}

      {subTab === "vad" && scenarioId && (
        <VadDiagram processId={processId} scenarioId={scenarioId} />
      )}
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
        <RaciMatrix
          process={process}
          childProcesses={processes.filter((p) => p.parentId === process.id)}
          departments={departments}
          onSaved={loadProcess}
        />
      )}

      {activeTab === "diagram" && (
        <DiagramTab processId={processId} scenarioId={currentScenarioId} />
      )}
    </div>
  );
}
