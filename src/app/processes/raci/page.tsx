"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrgChartStore } from "@/lib/store";
import { Loader2, Save, Grid3X3 } from "lucide-react";

interface ProcessItem {
  id: string;
  name: string;
  level: string;
  participants: Array<{ departmentId: string; role: string }>;
}

interface DeptItem {
  id: string;
  name: string;
}

type RaciRole = "RESPONSIBLE" | "ACCOUNTABLE" | "CONSULTED" | "INFORMED";

const RACI_OPTIONS: Array<{ value: RaciRole | ""; label: string; short: string; color: string }> = [
  { value: "", label: "—", short: "—", color: "bg-white text-neutral-300" },
  { value: "RESPONSIBLE", label: "Responsible", short: "R", color: "bg-blue-500 text-white" },
  { value: "ACCOUNTABLE", label: "Accountable", short: "A", color: "bg-red-500 text-white" },
  { value: "CONSULTED", label: "Consulted", short: "C", color: "bg-amber-400 text-white" },
  { value: "INFORMED", label: "Informed", short: "I", color: "bg-green-500 text-white" },
];

export default function RaciPage() {
  const currentScenarioId = useOrgChartStore((s) => s.currentScenarioId);
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [departments, setDepartments] = useState<DeptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // RACI matrix: processId → departmentId → role
  const [matrix, setMatrix] = useState<Record<string, Record<string, RaciRole | "">>>({});

  // Filters
  const [filterLevel, setFilterLevel] = useState("");
  const [filterDept, setFilterDept] = useState("");

  const loadData = useCallback(async () => {
    if (!currentScenarioId) return;
    setLoading(true);

    const [procRes, deptRes] = await Promise.all([
      fetch(`/api/processes?scenarioId=${currentScenarioId}`).then((r) => r.json()),
      fetch(`/api/departments?scenarioId=${currentScenarioId}`).then((r) => r.json()),
    ]);

    const procs: ProcessItem[] = procRes.processes || [];
    const depts: DeptItem[] = (deptRes.departments || deptRes || []).map((d: { id: string; name: string }) => ({
      id: d.id,
      name: d.name,
    }));

    setProcesses(procs);
    setDepartments(depts);

    // Build matrix from existing participants
    const m: Record<string, Record<string, RaciRole | "">> = {};
    for (const p of procs) {
      m[p.id] = {};
      for (const part of p.participants) {
        m[p.id][part.departmentId] = part.role as RaciRole;
      }
    }
    setMatrix(m);
    setHasChanges(false);
    setLoading(false);
  }, [currentScenarioId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function setRole(processId: string, departmentId: string, role: RaciRole | "") {
    setMatrix((prev) => ({
      ...prev,
      [processId]: {
        ...prev[processId],
        [departmentId]: role,
      },
    }));
    setHasChanges(true);
  }

  function cycleRole(processId: string, departmentId: string) {
    const current = matrix[processId]?.[departmentId] || "";
    const order: Array<RaciRole | ""> = ["", "RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"];
    const idx = order.indexOf(current);
    const next = order[(idx + 1) % order.length];
    setRole(processId, departmentId, next);
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Save each process's RACI
      for (const processId of Object.keys(matrix)) {
        const participants: Array<{ departmentId: string; role: RaciRole }> = [];
        for (const [deptId, role] of Object.entries(matrix[processId])) {
          if (role) {
            participants.push({ departmentId: deptId, role });
          }
        }
        await fetch(`/api/processes/${processId}/raci`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participants }),
        });
      }
      setHasChanges(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  // Apply filters
  const filteredProcesses = processes.filter((p) => {
    if (filterLevel && p.level !== filterLevel) return false;
    return true;
  });

  const filteredDepts = departments.filter((d) => {
    if (filterDept && !d.name.toLowerCase().includes(filterDept.toLowerCase())) return false;
    return true;
  });

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
        <div className="flex items-center gap-3">
          <Grid3X3 className="h-6 w-6 text-neutral-700" />
          <h1 className="text-xl font-bold">RACI-матрица</h1>
          <span className="text-sm text-neutral-400">
            {filteredProcesses.length} процессов × {filteredDepts.length} подразделений
          </span>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:bg-neutral-300"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Сохранить
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Уровень процесса</label>
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
          >
            <option value="">Все</option>
            <option value="MACRO">Макропроцессы</option>
            <option value="PROCESS">Процессы</option>
            <option value="SUBPROCESS">Подпроцессы</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Подразделение</label>
          <input
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            placeholder="Поиск..."
            className="rounded border px-2 py-1.5 text-sm"
          />
        </div>
        <div className="ml-4 flex items-end gap-2 pb-0.5">
          {RACI_OPTIONS.filter((o) => o.value).map((o) => (
            <span key={o.value} className={`rounded px-1.5 py-0.5 text-xs font-bold ${o.color}`}>
              {o.short}
            </span>
          ))}
          <span className="text-xs text-neutral-400 ml-1">← кликните на ячейку для переключения</span>
        </div>
      </div>

      {/* Matrix */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      ) : filteredProcesses.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-400">
          Нет процессов. Создайте процессы на странице «Процессы».
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-neutral-50">
                <th className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left font-medium min-w-[200px]">
                  Процесс
                </th>
                {filteredDepts.map((d) => (
                  <th
                    key={d.id}
                    className="px-1 py-2 text-center font-medium min-w-[40px]"
                    title={d.name}
                  >
                    <div className="writing-mode-vertical max-h-[120px] overflow-hidden text-ellipsis whitespace-nowrap -rotate-45 origin-bottom-left translate-x-3">
                      {d.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredProcesses.map((p) => (
                <tr key={p.id} className="border-b hover:bg-neutral-50/50">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium">
                    {p.name}
                  </td>
                  {filteredDepts.map((d) => {
                    const role = matrix[p.id]?.[d.id] || "";
                    const opt = RACI_OPTIONS.find((o) => o.value === role) || RACI_OPTIONS[0];
                    return (
                      <td
                        key={d.id}
                        className="px-1 py-1 text-center cursor-pointer"
                        onClick={() => cycleRole(p.id, d.id)}
                        title={`${p.name} × ${d.name}: ${opt.label}`}
                      >
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold ${opt.color}`}>
                          {opt.short}
                        </span>
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
  );
}
