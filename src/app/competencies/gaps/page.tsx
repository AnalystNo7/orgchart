"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrgChartStore } from "@/lib/store";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Loader2, Building2, User, GraduationCap } from "lucide-react";

interface GapSummary {
  totalEmployees: number;
  employeesWithGaps: number;
  totalGapPoints: number;
  competenciesAnalyzed: number;
}

interface EmployeeGap {
  employeeId: string;
  employeeName: string;
  position: string;
  departmentName: string;
  gaps: Array<{ competencyName: string; category: string; required: number; current: number; gap: number }>;
  totalGap: number;
}

interface DeptGap {
  id: string;
  name: string;
  totalGap: number;
  employeeCount: number;
  gapsByCompetency: Record<string, number>;
}

interface CompGap {
  id: string;
  name: string;
  category: string;
  totalGap: number;
  employeeCount: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  HARD: "bg-blue-100 text-blue-700",
  SOFT: "bg-green-100 text-green-700",
  LEADERSHIP: "bg-[#FFE7D8] text-accent-orange-700",
};

export default function SkillGapPage() {
  const currentScenarioId = useOrgChartStore((s) => s.currentScenarioId);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<GapSummary | null>(null);
  const [employeeGaps, setEmployeeGaps] = useState<EmployeeGap[]>([]);
  const [deptGaps, setDeptGaps] = useState<DeptGap[]>([]);
  const [compGaps, setCompGaps] = useState<CompGap[]>([]);
  const [view, setView] = useState<"dept" | "employee" | "competency">("dept");

  const loadData = useCallback(() => {
    if (!currentScenarioId) return;
    setLoading(true);
    fetch(`/api/competencies/gap-analysis?scenarioId=${currentScenarioId}`)
      .then((r) => r.json())
      .then((data) => {
        setSummary(data.summary);
        setEmployeeGaps(data.employeeGaps || []);
        setDeptGaps(data.departmentGaps || []);
        setCompGaps(data.competencyGaps || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentScenarioId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!currentScenarioId) {
    return <div className="flex h-full items-center justify-center text-neutral-400">Выберите сценарий</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Link href="/competencies" className="rounded p-1 hover:bg-neutral-100"><ArrowLeft className="h-5 w-5" /></Link>
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        <h1 className="text-xl font-bold">Skill Gap анализ</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-neutral-400" /></div>
      ) : !summary ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-400">Нет данных для анализа</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg border bg-white p-3 text-center">
              <div className="text-2xl font-bold">{summary.totalEmployees}</div>
              <div className="text-xs text-neutral-500">Сотрудников</div>
            </div>
            <div className="rounded-lg border bg-white p-3 text-center">
              <div className="text-2xl font-bold text-amber-600">{summary.employeesWithGaps}</div>
              <div className="text-xs text-neutral-500">С разрывами</div>
            </div>
            <div className="rounded-lg border bg-white p-3 text-center">
              <div className="text-2xl font-bold text-red-600">{summary.totalGapPoints}</div>
              <div className="text-xs text-neutral-500">Gap points</div>
            </div>
            <div className="rounded-lg border bg-white p-3 text-center">
              <div className="text-2xl font-bold">{summary.competenciesAnalyzed}</div>
              <div className="text-xs text-neutral-500">Компетенций</div>
            </div>
          </div>

          {summary.employeesWithGaps === 0 ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center text-sm text-green-700">
              Все сотрудники соответствуют требованиям к компетенциям. Разрывов не обнаружено.
              <div className="mt-2 text-xs text-green-500">Убедитесь, что заполнены требования к позициям в разделе Role Competencies.</div>
            </div>
          ) : (
            <>
              {/* View switcher */}
              <div className="flex gap-1 border-b">
                <button onClick={() => setView("dept")} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 ${view === "dept" ? "border-neutral-800 text-neutral-900" : "border-transparent text-neutral-500"}`}>
                  <Building2 className="h-4 w-4" /> По подразделениям
                </button>
                <button onClick={() => setView("competency")} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 ${view === "competency" ? "border-neutral-800 text-neutral-900" : "border-transparent text-neutral-500"}`}>
                  <GraduationCap className="h-4 w-4" /> По компетенциям
                </button>
                <button onClick={() => setView("employee")} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 ${view === "employee" ? "border-neutral-800 text-neutral-900" : "border-transparent text-neutral-500"}`}>
                  <User className="h-4 w-4" /> По сотрудникам
                </button>
              </div>

              {/* Department gaps */}
              {view === "dept" && (
                <div className="space-y-2">
                  {deptGaps.map((d) => (
                    <div key={d.id} className="rounded-lg border bg-white p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{d.name}</span>
                        <div className="flex items-center gap-3 text-xs text-neutral-500">
                          <span>{d.employeeCount} сотр. с gap</span>
                          <span className="rounded bg-red-100 px-2 py-0.5 font-medium text-red-700">Gap: {d.totalGap}</span>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(d.gapsByCompetency).sort(([, a], [, b]) => b - a).map(([name, gap]) => (
                          <span key={name} className="rounded bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                            {name}: -{gap}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Competency gaps */}
              {view === "competency" && (
                <div className="space-y-2">
                  {compGaps.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 rounded-lg border bg-white p-3">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[c.category]}`}>{c.category}</span>
                      <span className="flex-1 text-sm font-medium">{c.name}</span>
                      <span className="text-xs text-neutral-500">{c.employeeCount} сотр.</span>
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Gap: {c.totalGap}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Employee gaps */}
              {view === "employee" && (
                <div className="space-y-2">
                  {employeeGaps.map((e) => (
                    <div key={e.employeeId} className="rounded-lg border bg-white p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium">{e.employeeName}</span>
                          <span className="ml-2 text-xs text-neutral-400">{e.position} / {e.departmentName}</span>
                        </div>
                        <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Gap: {e.totalGap}</span>
                      </div>
                      <div className="mt-2">
                        <table className="w-full text-xs">
                          <thead><tr className="text-neutral-500"><th className="py-0.5 text-left">Компетенция</th><th className="py-0.5 text-center w-16">Треб.</th><th className="py-0.5 text-center w-16">Текущ.</th><th className="py-0.5 text-center w-16">Gap</th></tr></thead>
                          <tbody>
                            {e.gaps.map((g) => (
                              <tr key={g.competencyName} className="border-t">
                                <td className="py-0.5">{g.competencyName}</td>
                                <td className="py-0.5 text-center font-medium">{g.required}</td>
                                <td className="py-0.5 text-center">{g.current}</td>
                                <td className="py-0.5 text-center text-red-600 font-medium">-{g.gap}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
