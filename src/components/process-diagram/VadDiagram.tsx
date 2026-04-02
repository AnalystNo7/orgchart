"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface ProcessItem {
  id: string;
  name: string;
  level: string;
  status: string;
  parentId: string | null;
  description: string | null;
  ownerDeptId: string | null;
  children?: ProcessItem[];
}

interface DeptOption {
  id: string;
  name: string;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "border-green-400 bg-green-50",
  PLANNED: "border-amber-400 bg-amber-50",
  DEPRECATED: "border-red-300 bg-red-50",
};

const ARROW_COLOR = "text-neutral-400";

interface VadDiagramProps {
  processId: string;
  scenarioId: string;
}

export function VadDiagram({ processId, scenarioId }: VadDiagramProps) {
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/processes?scenarioId=${scenarioId}`).then((r) => r.json()),
      fetch(`/api/departments?scenarioId=${scenarioId}`).then((r) => r.json()),
    ])
      .then(([procData, deptData]) => {
        setProcesses(procData.processes || []);
        setDepartments(
          (deptData.departments || deptData || []).map((d: { id: string; name: string }) => ({
            id: d.id,
            name: d.name,
          }))
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [scenarioId]);

  function getDeptName(id: string | null): string {
    if (!id) return "";
    return departments.find((d) => d.id === id)?.name || "";
  }

  // Build tree: find current process's children (for MACRO level)
  // or sibling processes (for PROCESS level — show parent's children)
  const currentProcess = processes.find((p) => p.id === processId);
  let vadProcesses: ProcessItem[] = [];

  if (currentProcess) {
    if (currentProcess.level === "MACRO") {
      // Show this macro + its children as the chain
      vadProcesses = processes.filter((p) => p.parentId === processId);
      if (vadProcesses.length === 0) {
        // No children — show siblings (other macros)
        vadProcesses = processes.filter((p) => p.level === "MACRO");
      }
    } else {
      // Show all siblings (same parent)
      vadProcesses = processes.filter((p) => p.parentId === currentProcess.parentId);
    }
  }

  // Fallback: show all macros
  if (vadProcesses.length === 0) {
    vadProcesses = processes.filter((p) => p.level === "MACRO");
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (vadProcesses.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-neutral-400">
        Нет процессов для отображения VAD. Создайте макропроцессы на странице «Процессы».
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* VAD Title */}
      <div className="text-center text-sm text-neutral-500">
        Value Added Chain Diagram{currentProcess ? `: ${currentProcess.name}` : ""}
      </div>

      {/* Horizontal chain */}
      <div className="flex items-stretch justify-center gap-0 overflow-x-auto py-4">
        {vadProcesses.map((p, i) => {
          const isLast = i === vadProcesses.length - 1;
          const children = processes.filter((c) => c.parentId === p.id);

          return (
            <div key={p.id} className="flex items-stretch">
              {/* Process block */}
              <div
                className={`flex min-w-[160px] max-w-[200px] flex-col rounded-lg border-2 p-3 transition-shadow hover:shadow-md ${
                  STATUS_COLORS[p.status] || "border-neutral-300 bg-white"
                } ${p.id === processId ? "ring-2 ring-blue-400 ring-offset-2" : ""}`}
              >
                <div className="text-xs font-bold text-neutral-800 text-center">{p.name}</div>
                {p.description && (
                  <div className="mt-1 text-[10px] text-neutral-500 text-center line-clamp-2">
                    {p.description}
                  </div>
                )}
                {p.ownerDeptId && (
                  <div className="mt-1 text-[10px] text-neutral-400 text-center">
                    {getDeptName(p.ownerDeptId)}
                  </div>
                )}
                {/* Sub-processes */}
                {children.length > 0 && (
                  <div className="mt-2 border-t pt-2 space-y-0.5">
                    {children.map((c) => (
                      <div key={c.id} className="text-[10px] text-neutral-600 truncate">
                        • {c.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Arrow */}
              {!isLast && (
                <div className={`flex items-center px-1 ${ARROW_COLOR}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-neutral-400">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded border-2 border-green-400 bg-green-50" /> Активный</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded border-2 border-amber-400 bg-amber-50" /> Планируемый</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded border-2 border-red-300 bg-red-50" /> Устаревший</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded ring-2 ring-blue-400" /> Текущий</span>
      </div>
    </div>
  );
}
