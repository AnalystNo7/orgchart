"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Save, Plus, Loader2, Trash2, FileText } from "lucide-react";

interface EmployeeData {
  id: string;
  fullName: string;
  position: string;
  category: string;
  fte: string;
  department: { id: string; name: string } | null;
  contracts: Array<{
    id: string;
    revenueStatus: string;
    fte: string;
    periodStart: string;
    periodEnd: string;
    contract: { id: string; name: string; type: string; status: string; periodStart: string; periodEnd: string };
  }>;
}

interface CompetencyItem {
  id: string;
  name: string;
  category: string;
}

interface EmpCompRecord {
  id: string;
  competencyId: string;
  currentLevel: number;
}

interface RoleCompRecord {
  competencyId: string;
  requiredLevel: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  PP: "ПП",
  OPP: "ОПП",
  AUP: "АУП",
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  REVENUE: "Доходный",
  EXPENSE: "Расходный",
};

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  CONCLUDED: "Заключённый",
  PLANNED: "Планируемый",
};

const REVENUE_STATUS_LABELS: Record<string, string> = {
  PROVIDED: "Обеспечен",
  PLANNED: "Запланирован",
  NOT_PROVIDED: "Не обеспечен",
};

const REVENUE_STATUS_COLORS: Record<string, string> = {
  PROVIDED: "bg-green-100 text-green-700",
  PLANNED: "bg-yellow-100 text-yellow-700",
  NOT_PROVIDED: "bg-red-100 text-red-700",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const CATEGORY_COLORS: Record<string, string> = {
  HARD: "bg-blue-100 text-blue-700",
  SOFT: "bg-green-100 text-green-700",
  LEADERSHIP: "bg-[#FFE7D8] text-accent-orange-700",
};

const GAP_COLORS: Record<string, string> = {
  positive: "text-red-600 bg-red-50",
  zero: "text-green-600 bg-green-50",
  na: "text-neutral-400",
};

interface EmployeeCompetencyCardProps {
  employeeId: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function EmployeeCompetencyCard({ employeeId, open, onClose, onSaved }: EmployeeCompetencyCardProps) {
  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [competencies, setCompetencies] = useState<CompetencyItem[]>([]);
  const [empComps, setEmpComps] = useState<EmpCompRecord[]>([]);
  const [roleComps, setRoleComps] = useState<RoleCompRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Local state for editing
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [addCompId, setAddCompId] = useState("");

  useEffect(() => {
    if (!open || !employeeId) return;
    setLoading(true);
    setHasChanges(false);

    Promise.all([
      fetch(`/api/employees/${employeeId}`).then((r) => r.json()),
      fetch(`/api/competencies`).then((r) => r.json()),
      fetch(`/api/employee-competencies?employeeId=${employeeId}`).then((r) => r.json()),
    ]).then(async ([empData, compData, ecData]) => {
      const emp = empData as EmployeeData;
      setEmployee(emp);
      setCompetencies(compData.competencies || []);
      const records = (ecData.records || []) as EmpCompRecord[];
      setEmpComps(records);

      // Build levels map
      const lvls: Record<string, number> = {};
      for (const r of records) {
        lvls[r.competencyId] = r.currentLevel;
      }
      setLevels(lvls);

      // Load role requirements for this position
      if (emp.position) {
        const rcRes = await fetch(`/api/role-competencies?position=${encodeURIComponent(emp.position)}`).then((r) => r.json());
        setRoleComps(rcRes.records || []);
      }

      setLoading(false);
    }).catch(() => setLoading(false));
  }, [open, employeeId]);

  function setLevel(compId: string, level: number) {
    setLevels((prev) => ({ ...prev, [compId]: level }));
    setHasChanges(true);
  }

  function removeComp(compId: string) {
    setLevels((prev) => {
      const next = { ...prev };
      delete next[compId];
      return next;
    });
    setHasChanges(true);
  }

  function addCompetency() {
    if (!addCompId || levels[addCompId] !== undefined) return;
    setLevels((prev) => ({ ...prev, [addCompId]: 1 }));
    setAddCompId("");
    setHasChanges(true);
  }

  async function handleSave() {
    setSaving(true);
    const updates = Object.entries(levels)
      .filter(([, level]) => level > 0)
      .map(([competencyId, currentLevel]) => ({
        employeeId,
        competencyId,
        currentLevel,
      }));

    await fetch("/api/employee-competencies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });

    setSaving(false);
    setHasChanges(false);
    onSaved?.();
  }

  function getRequiredLevel(compId: string): number | null {
    const rc = roleComps.find((r) => r.competencyId === compId);
    return rc ? rc.requiredLevel : null;
  }

  function getCompName(id: string): string {
    return competencies.find((c) => c.id === id)?.name || id;
  }

  function getCompCategory(id: string): string {
    return competencies.find((c) => c.id === id)?.category || "HARD";
  }

  // All competency IDs that the employee has
  const employeeCompIds = Object.keys(levels);
  const availableComps = competencies.filter((c) => !employeeCompIds.includes(c.id));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Карточка компетенций сотрудника</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
          </div>
        ) : !employee ? (
          <div className="text-center text-neutral-400 py-8">Сотрудник не найден</div>
        ) : (
          <div className="space-y-4">
            {/* Employee info */}
            <div className="rounded-lg bg-neutral-50 p-4 grid grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-neutral-500">ФИО</div>
                <div className="font-medium">{employee.fullName}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-500">Должность</div>
                <div className="font-medium">{employee.position}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-500">Подразделение</div>
                <div className="font-medium">{employee.department?.name || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-500">Категория / FTE</div>
                <div className="font-medium">{CATEGORY_LABELS[employee.category] || employee.category} / {employee.fte}</div>
              </div>
            </div>

            {/* Contracts */}
            <div className="rounded-lg border">
              <div className="flex items-center gap-2 border-b bg-neutral-50 px-4 py-2">
                <FileText className="h-4 w-4 text-neutral-400" />
                <span className="text-sm font-medium">Договоры ({employee.contracts?.length || 0})</span>
              </div>
              {!employee.contracts || employee.contracts.length === 0 ? (
                <div className="px-4 py-4 text-center text-xs text-neutral-400">
                  Нет привязанных договоров
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-neutral-500">
                      <th className="px-4 py-1.5 text-left font-medium">Договор</th>
                      <th className="px-3 py-1.5 text-center font-medium w-24">Тип</th>
                      <th className="px-3 py-1.5 text-center font-medium w-28">Статус</th>
                      <th className="px-3 py-1.5 text-center font-medium w-28">Обеспечение</th>
                      <th className="px-3 py-1.5 text-center font-medium w-16">FTE</th>
                      <th className="px-3 py-1.5 text-center font-medium w-48">Период</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employee.contracts.map((ec) => (
                      <tr key={ec.id} className="border-b last:border-0 hover:bg-neutral-50">
                        <td className="px-4 py-1.5 font-medium">{ec.contract.name}</td>
                        <td className="px-3 py-1.5 text-center">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ec.contract.type === "REVENUE" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                            {CONTRACT_TYPE_LABELS[ec.contract.type] || ec.contract.type}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-center text-neutral-600">
                          {CONTRACT_STATUS_LABELS[ec.contract.status] || ec.contract.status}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${REVENUE_STATUS_COLORS[ec.revenueStatus] || "bg-neutral-100 text-neutral-600"}`}>
                            {REVENUE_STATUS_LABELS[ec.revenueStatus] || ec.revenueStatus}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-center font-medium">{ec.fte}</td>
                        <td className="px-3 py-1.5 text-center text-neutral-500">
                          {formatDate(ec.periodStart)} – {formatDate(ec.periodEnd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Competencies table */}
            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b bg-neutral-50 px-4 py-2">
                <span className="text-sm font-medium">Компетенции ({employeeCompIds.length})</span>
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  className="inline-flex items-center gap-1 rounded bg-neutral-800 px-3 py-1 text-xs text-white hover:bg-neutral-700 disabled:bg-neutral-300"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Сохранить
                </button>
              </div>

              {/* Add competency */}
              <div className="flex items-center gap-2 border-b px-4 py-2">
                <select
                  value={addCompId}
                  onChange={(e) => setAddCompId(e.target.value)}
                  className="rounded border px-2 py-1 text-sm flex-1"
                >
                  <option value="">Добавить компетенцию...</option>
                  {availableComps.map((c) => (
                    <option key={c.id} value={c.id}>[{c.category}] {c.name}</option>
                  ))}
                </select>
                <button
                  onClick={addCompetency}
                  disabled={!addCompId}
                  className="rounded border px-2 py-1 text-sm hover:bg-neutral-50 disabled:text-neutral-300"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {employeeCompIds.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-neutral-400">
                  Нет компетенций. Добавьте из справочника выше.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-neutral-500">
                      <th className="px-4 py-2 text-left font-medium">Компетенция</th>
                      <th className="px-4 py-2 text-center font-medium w-20">Категория</th>
                      <th className="px-4 py-2 text-center font-medium w-24">Требуемый</th>
                      <th className="px-4 py-2 text-center font-medium w-24">Текущий</th>
                      <th className="px-4 py-2 text-center font-medium w-16">Gap</th>
                      <th className="px-4 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {employeeCompIds.map((compId) => {
                      const current = levels[compId] || 0;
                      const required = getRequiredLevel(compId);
                      const gap = required !== null ? required - current : null;
                      const category = getCompCategory(compId);

                      return (
                        <tr key={compId} className="border-b last:border-0 hover:bg-neutral-50">
                          <td className="px-4 py-2 font-medium">{getCompName(compId)}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[category]}`}>
                              {category}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            {required !== null ? (
                              <span className="font-medium">{required}</span>
                            ) : (
                              <span className="text-neutral-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <select
                              value={current}
                              onChange={(e) => setLevel(compId, parseInt(e.target.value))}
                              className="rounded border px-2 py-1 text-sm text-center w-16"
                            >
                              {[0, 1, 2, 3, 4, 5].map((v) => (
                                <option key={v} value={v}>{v || "—"}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2 text-center">
                            {gap !== null ? (
                              <span className={`rounded px-2 py-0.5 text-xs font-bold ${gap > 0 ? GAP_COLORS.positive : GAP_COLORS.zero}`}>
                                {gap > 0 ? `-${gap}` : "OK"}
                              </span>
                            ) : (
                              <span className={`text-xs ${GAP_COLORS.na}`}>—</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => removeComp(compId)}
                              className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
