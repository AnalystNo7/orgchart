"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";

type RaciRole = "RESPONSIBLE" | "ACCOUNTABLE" | "CONSULTED" | "INFORMED";

const RACI_OPTIONS: Array<{ value: RaciRole | ""; short: string; color: string; label: string; description: string }> = [
  { value: "", short: "—", color: "bg-white text-neutral-300 border", label: "Не назначено", description: "" },
  { value: "RESPONSIBLE", short: "R", color: "bg-blue-500 text-white", label: "Ответственный", description: "Выполняет работу" },
  { value: "ACCOUNTABLE", short: "A", color: "bg-red-500 text-white", label: "Утверждающий", description: "Принимает решение" },
  { value: "CONSULTED", short: "C", color: "bg-amber-400 text-white", label: "Консультируемый", description: "Даёт экспертизу" },
  { value: "INFORMED", short: "I", color: "bg-green-500 text-white", label: "Информируемый", description: "Уведомляется о результате" },
];

interface ProcessItem {
  id: string;
  name: string;
  participants: Array<{ departmentId: string; role: string }>;
}

interface DeptOption {
  id: string;
  name: string;
}

interface RaciMatrixProps {
  process: ProcessItem;
  childProcesses: ProcessItem[];
  departments: DeptOption[];
  onSaved: () => void;
}

export function RaciMatrix({ process, childProcesses, departments, onSaved }: RaciMatrixProps) {
  const matrixProcesses = [process, ...childProcesses];

  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Record<string, RaciRole | "">>>({});
  const [saving, setSaving] = useState(false);
  const [addDeptId, setAddDeptId] = useState("");
  const [dropdownCell, setDropdownCell] = useState<string | null>(null);

  // Initialize from existing participants
  useEffect(() => {
    const m: Record<string, Record<string, RaciRole | "">> = {};
    const deptIds = new Set<string>();

    for (const p of matrixProcesses) {
      m[p.id] = {};
      for (const part of p.participants) {
        m[p.id][part.departmentId] = part.role as RaciRole;
        deptIds.add(part.departmentId);
      }
    }

    setMatrix(m);
    setSelectedDepts(Array.from(deptIds));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process.id]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownCell) return;
    const handler = () => setDropdownCell(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [dropdownCell]);

  function setRole(processId: string, deptId: string, role: RaciRole | "") {
    setMatrix((prev) => ({
      ...prev,
      [processId]: { ...prev[processId], [deptId]: role },
    }));
    setDropdownCell(null);
  }

  function cycleRole(processId: string, deptId: string) {
    const order: Array<RaciRole | ""> = ["", "RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"];
    const current = matrix[processId]?.[deptId] || "";
    const idx = order.indexOf(current);
    setRole(processId, deptId, order[(idx + 1) % order.length]);
  }

  function toggleDropdown(e: React.MouseEvent, processId: string, deptId: string) {
    e.preventDefault();
    e.stopPropagation();
    const key = `${processId}:${deptId}`;
    setDropdownCell((prev) => (prev === key ? null : key));
  }

  function addDept() {
    if (!addDeptId || selectedDepts.includes(addDeptId)) return;
    setSelectedDepts([...selectedDepts, addDeptId]);
    setAddDeptId("");
  }

  function removeDept(deptId: string) {
    setSelectedDepts(selectedDepts.filter((d) => d !== deptId));
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">
            RACI-матрица: {process.name}
            {childProcesses.length > 0 && ` + ${childProcesses.length} дочерних`}
          </h2>
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1 rounded bg-neutral-800 px-3 py-1.5 text-xs text-white hover:bg-neutral-700 disabled:bg-neutral-300">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Сохранить
          </button>
        </div>

        {/* Legend with Russian descriptions */}
        <div className="mb-4 rounded-lg bg-neutral-50 p-3">
          <div className="text-xs font-medium text-neutral-500 mb-2">Расшифровка ролей RACI:</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {RACI_OPTIONS.filter((o) => o.value).map((o) => (
              <div key={o.value} className="flex items-center gap-2">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold ${o.color}`}>{o.short}</span>
                <div><span className="font-medium">{o.label}</span> — {o.description}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-neutral-400">
            Левый клик — переключение роли по кругу. Правый клик — выбор из списка.
          </div>
        </div>

        {/* Add department */}
        <div className="mb-4 flex items-center gap-2">
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
            Выберите подразделение выше и нажмите «+» для построения RACI-матрицы.
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
                    <th key={deptId} className="px-2 py-2 text-center text-xs font-medium text-neutral-500 min-w-[90px]">
                      <div className="flex flex-col items-center gap-1">
                        <span className="truncate max-w-[100px]" title={getDeptName(deptId)}>{getDeptName(deptId)}</span>
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
                      const cellKey = `${p.id}:${deptId}`;
                      const role = matrix[p.id]?.[deptId] || "";
                      const opt = RACI_OPTIONS.find((o) => o.value === role) || RACI_OPTIONS[0];
                      const isOpen = dropdownCell === cellKey;
                      return (
                        <td key={deptId} className="px-1 py-1 text-center relative">
                          <button
                            onClick={() => cycleRole(p.id, deptId)}
                            onContextMenu={(e) => toggleDropdown(e, p.id, deptId)}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded text-sm font-bold ${opt.color} hover:opacity-80`}
                            title={`${opt.label} — ЛКМ: переключить, ПКМ: выбрать`}
                          >
                            {opt.short}
                          </button>
                          {isOpen && (
                            <div
                              className="absolute z-20 mt-1 left-1/2 -translate-x-1/2 rounded-lg border bg-white shadow-lg py-1 min-w-[200px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {RACI_OPTIONS.map((o) => (
                                <button
                                  key={o.value}
                                  onClick={() => setRole(p.id, deptId, o.value)}
                                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-neutral-50 ${role === o.value ? "bg-neutral-100" : ""}`}
                                >
                                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${o.color}`}>
                                    {o.short}
                                  </span>
                                  <span className="font-medium">{o.label}</span>
                                  {o.description && <span className="text-neutral-400">— {o.description}</span>}
                                </button>
                              ))}
                            </div>
                          )}
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
