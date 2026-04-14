"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrgChartStore } from "@/lib/store";
import {
  Wallet,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Save,
  X,
  TrendingUp,
  TrendingDown,
  Users,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  BrainCircuit,
} from "lucide-react";

// --- Types ---

interface AnalyticsData {
  summary: {
    totalRevenue: number;
    totalCost: number;
    totalPnl: number;
    margin: number;
    revenuePerFte: number;
    costPerFte: number;
    totalFte: number;
    utilization: number;
    ppTotal: number;
    ppUtilized: number;
  };
  budget: {
    totalPlanned: number;
    totalActual: number;
    variance: number;
    budgetCount: number;
  };
  departments: Array<{
    departmentId: string;
    departmentName: string;
    shetilType: string;
    revenue: number;
    cost: number;
    pnl: number;
    totalPnl: number;
    margin: number;
    employeeCount: number;
  }>;
}

interface BudgetData {
  id: string;
  name: string;
  type: "CAPEX" | "OPEX";
  status: "DRAFT" | "APPROVED" | "CLOSED";
  periodStart: string;
  periodEnd: string;
  description: string | null;
  totalPlanned: number;
  totalActual: number;
  variance: number;
  _count: { lines: number };
  lines: Array<{
    id: string;
    category: string;
    plannedAmount: number;
    actualAmount: number;
    department: { id: string; name: string };
  }>;
}

interface DeptOption { id: string; name: string; }

// --- Constants ---

const BUDGET_TYPE_LABELS: Record<string, string> = { CAPEX: "CapEx", OPEX: "OpEx" };
const BUDGET_TYPE_COLORS: Record<string, string> = { CAPEX: "bg-blue-100 text-blue-700", OPEX: "bg-orange-100 text-orange-700" };
const BUDGET_STATUS_LABELS: Record<string, string> = { DRAFT: "Черновик", APPROVED: "Утверждён", CLOSED: "Закрыт" };
const BUDGET_STATUS_COLORS: Record<string, string> = { DRAFT: "bg-neutral-100 text-neutral-600", APPROVED: "bg-green-100 text-green-700", CLOSED: "bg-neutral-200 text-neutral-500" };

function fmt(v: number): string {
  if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return v.toString();
}

// --- Component ---

// Button order (left → right) as requested by the user.
const ALLOCATION_ORDER = ["fte", "transfer", "earning"] as const;
type AllocationMode = (typeof ALLOCATION_ORDER)[number];

const ALLOCATION_MODE_LABELS: Record<AllocationMode, string> = {
  fte: "По FTE",
  transfer: "Трансфертная цена",
  earning: "Только зарабатывающие",
};

const ALLOCATION_MODE_HINTS: Record<AllocationMode, string> = {
  fte: "Выручка договора делится между подразделениями пропорционально FTE их сотрудников, закреплённых в EmployeeContract.",
  transfer:
    "Ресурсные/сервисные подразделения «продают» FTE по тарифу: Tariff.rate × FTE × часы × overlap. Сумма договора не используется.",
  earning:
    "Выручка начисляется только зарабатывающим (REVENUE) подразделениям. Ресурсные и сервисные получают только затраты — это baseline-режим, используемый на дашборде.",
};

export default function FinancePage() {
  const currentScenarioId = useOrgChartStore((s) => s.currentScenarioId);
  const allocationMode = useOrgChartStore((s) => s.pnlAllocationMode);
  const setAllocationMode = useOrgChartStore((s) => s.setPnlAllocationMode);
  const [activeTab, setActiveTab] = useState<"analytics" | "budgets">("analytics");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [budgets, setBudgets] = useState<BudgetData[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Budget form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fType, setFType] = useState<"CAPEX" | "OPEX">("OPEX");
  const [fStatus, setFStatus] = useState<"DRAFT" | "APPROVED" | "CLOSED">("DRAFT");
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fLines, setFLines] = useState<Array<{ departmentId: string; category: string; plannedAmount: number; actualAmount: number }>>([]);
  const [saving, setSaving] = useState(false);

  const loadAnalytics = useCallback(() => {
    if (!currentScenarioId) return;
    setLoading(true);
    fetch(
      `/api/finance/analytics?scenarioId=${currentScenarioId}&allocationMode=${allocationMode}`
    )
      .then((r) => r.json())
      .then((d) => setAnalytics(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentScenarioId, allocationMode]);

  const loadBudgets = useCallback(() => {
    if (!currentScenarioId) return;
    fetch(`/api/budgets?scenarioId=${currentScenarioId}`)
      .then((r) => r.json())
      .then((d) => setBudgets(d.budgets || []))
      .catch(() => {});
  }, [currentScenarioId]);

  useEffect(() => { loadAnalytics(); loadBudgets(); }, [loadAnalytics, loadBudgets]);

  useEffect(() => {
    if (!currentScenarioId) return;
    fetch(`/api/departments?scenarioId=${currentScenarioId}`)
      .then((r) => r.json())
      .then((d) => setDepartments((d.departments || d || []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name }))))
      .catch(() => {});
  }, [currentScenarioId]);

  function openCreate() {
    setEditId(null); setFName(""); setFType("OPEX"); setFStatus("DRAFT");
    const now = new Date();
    setFStart(`${now.getFullYear()}-01-01`); setFEnd(`${now.getFullYear()}-12-31`);
    setFDesc(""); setFLines([]);
    setShowForm(true);
  }

  function openEdit(b: BudgetData) {
    setEditId(b.id); setFName(b.name); setFType(b.type); setFStatus(b.status);
    setFStart(b.periodStart.slice(0, 10)); setFEnd(b.periodEnd.slice(0, 10));
    setFDesc(b.description || "");
    setFLines(b.lines.map((l) => ({ departmentId: l.department.id, category: l.category, plannedAmount: l.plannedAmount, actualAmount: l.actualAmount })));
    setShowForm(true);
  }

  function addLine() {
    setFLines((p) => [...p, { departmentId: departments[0]?.id || "", category: "", plannedAmount: 0, actualAmount: 0 }]);
  }

  function updateLine(i: number, field: string, value: string | number) {
    setFLines((p) => p.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  function removeLine(i: number) {
    setFLines((p) => p.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!fName.trim() || !currentScenarioId) return;
    setSaving(true);
    const body = { scenarioId: currentScenarioId, name: fName.trim(), type: fType, status: fStatus, periodStart: fStart, periodEnd: fEnd, description: fDesc.trim() || null, lines: fLines.filter((l) => l.category.trim() && l.departmentId) };
    try {
      if (editId) {
        await fetch(`/api/budgets/${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        await fetch("/api/budgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      setShowForm(false);
      loadBudgets(); loadAnalytics();
    } catch {} finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить бюджет?")) return;
    await fetch(`/api/budgets/${id}`, { method: "DELETE" });
    loadBudgets(); loadAnalytics();
  }

  if (!currentScenarioId) {
    return <div className="flex h-full items-center justify-center text-neutral-400">Выберите сценарий</div>;
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-neutral-400" /></div>;
  }

  const s = analytics?.summary;
  const b = analytics?.budget;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wallet className="h-6 w-6 text-neutral-700" />
          <h1 className="text-xl font-bold">Финансы</h1>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-neutral-100 p-1">
          <button onClick={() => setActiveTab("analytics")} className={`rounded-md px-3 py-1 text-sm font-medium transition ${activeTab === "analytics" ? "bg-white shadow-sm" : "text-neutral-500"}`}>
            <BarChart3 className="inline h-3.5 w-3.5 mr-1" />P&L Аналитика
          </button>
          <button onClick={() => setActiveTab("budgets")} className={`rounded-md px-3 py-1 text-sm font-medium transition ${activeTab === "budgets" ? "bg-white shadow-sm" : "text-neutral-500"}`}>
            <span className="inline-block w-3.5 h-3.5 mr-1 text-center font-bold leading-[14px]">₽</span>Бюджеты ({budgets.length})
          </button>
        </div>
      </div>

      {/* Analytics tab */}
      {activeTab === "analytics" && s && (
        <>
          {/* Allocation mode switcher */}
          <div className="rounded-lg border bg-white p-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex flex-1 items-center gap-1 rounded-md bg-neutral-100 p-1">
                {ALLOCATION_ORDER.map((m) => (
                  <button
                    key={m}
                    onClick={() => setAllocationMode(m)}
                    className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition ${
                      allocationMode === m
                        ? "bg-white shadow-sm"
                        : "text-neutral-500 hover:text-neutral-700"
                    }`}
                  >
                    {ALLOCATION_MODE_LABELS[m]}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  if (!currentScenarioId) return;
                  window.open(
                    `/api/export/ai-analysis?scenarioId=${currentScenarioId}`,
                    "_blank"
                  );
                }}
                disabled={!currentScenarioId}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                title="Скачать .md файл со всем срезом сценария для загрузки в Claude Opus"
              >
                <BrainCircuit className="h-4 w-4 text-purple-600" />
                Экспорт для AI-анализа
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              {ALLOCATION_MODE_HINTS[allocationMode]}
            </p>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-4 gap-3">
            <KpiCard icon={<TrendingUp className="h-5 w-5 text-green-600" />} label="Выручка" value={fmt(s.totalRevenue)} />
            <KpiCard icon={<TrendingDown className="h-5 w-5 text-red-600" />} label="Затраты" value={fmt(s.totalCost)} />
            <KpiCard icon={<span className="text-blue-600 font-bold text-lg">₽</span>} label="P&L" value={fmt(s.totalPnl)} sub={`Маржа ${s.margin}%`} positive={s.totalPnl >= 0} />
            <KpiCard icon={<Users className="h-5 w-5 text-purple-600" />} label="Утилизация ПП" value={`${s.utilization}%`} sub={`${s.ppUtilized}/${s.ppTotal} ПП`} />
          </div>

          {/* Unit economics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-white p-4">
              <div className="text-xs text-neutral-500 mb-1">Revenue / FTE</div>
              <div className="text-xl font-bold">{fmt(s.revenuePerFte)}</div>
              <div className="text-[10px] text-neutral-400">{s.totalFte} FTE всего</div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-xs text-neutral-500 mb-1">Cost / FTE</div>
              <div className="text-xl font-bold">{fmt(s.costPerFte)}</div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-xs text-neutral-500 mb-1">Бюджет План/Факт</div>
              <div className="text-xl font-bold">{fmt(b?.totalPlanned || 0)} / {fmt(b?.totalActual || 0)}</div>
              <div className={`text-[10px] ${(b?.variance || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                Отклонение: {fmt(b?.variance || 0)}
              </div>
            </div>
          </div>

          {/* Department P&L table */}
          {analytics.departments.length > 0 && (
            <div className="rounded-lg border bg-white overflow-hidden">
              <div className="flex items-center gap-2 border-b bg-neutral-50 px-4 py-2 text-xs font-medium uppercase text-neutral-500">
                <span className="flex-1">Подразделение</span>
                <span className="w-20 text-right">Выручка</span>
                <span className="w-20 text-right">Затраты</span>
                <span className="w-20 text-right">P&L</span>
                <span className="w-16 text-right">Маржа</span>
                <span className="w-12 text-center">Чел.</span>
              </div>
              {analytics.departments
                .filter((d) => d.revenue > 0 || d.cost > 0)
                .sort((a, bb) => bb.totalPnl - a.totalPnl)
                .map((d) => (
                  <div key={d.departmentId} className="flex items-center gap-2 border-b px-4 py-2 hover:bg-neutral-50">
                    <span className="flex-1 text-sm font-medium truncate">{d.departmentName}</span>
                    <span className="w-20 text-right text-sm text-green-700">{fmt(d.revenue)}</span>
                    <span className="w-20 text-right text-sm text-red-600">{fmt(d.cost)}</span>
                    <span className={`w-20 text-right text-sm font-medium ${d.pnl >= 0 ? "text-green-700" : "text-red-600"}`}>
                      {d.pnl >= 0 ? <ArrowUpRight className="inline h-3 w-3" /> : <ArrowDownRight className="inline h-3 w-3" />}
                      {fmt(Math.abs(d.pnl))}
                    </span>
                    <span className={`w-16 text-right text-xs ${d.margin >= 0 ? "text-green-600" : "text-red-600"}`}>{d.margin}%</span>
                    <span className="w-12 text-center text-xs text-neutral-400">{d.employeeCount}</span>
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      {/* Budgets tab */}
      {activeTab === "budgets" && (
        <>
          <div className="flex justify-end">
            <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700">
              <Plus className="h-4 w-4" />Новый бюджет
            </button>
          </div>

          {showForm && (
            <div className="rounded-lg border bg-white p-4 space-y-3">
              <h2 className="text-sm font-semibold">{editId ? "Редактировать бюджет" : "Новый бюджет"}</h2>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Название *</label>
                  <input value={fName} onChange={(e) => setFName(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Тип</label>
                  <select value={fType} onChange={(e) => setFType(e.target.value as "CAPEX" | "OPEX")} className="w-full rounded border px-2 py-1.5 text-sm">
                    <option value="OPEX">OpEx</option>
                    <option value="CAPEX">CapEx</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Статус</label>
                  <select value={fStatus} onChange={(e) => setFStatus(e.target.value as "DRAFT" | "APPROVED" | "CLOSED")} className="w-full rounded border px-2 py-1.5 text-sm">
                    {Object.entries(BUDGET_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Начало периода</label>
                  <input type="date" value={fStart} onChange={(e) => setFStart(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Конец периода</label>
                  <input type="date" value={fEnd} onChange={(e) => setFEnd(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
              </div>

              {/* Budget lines */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-neutral-500">Статьи бюджета</label>
                  <button onClick={addLine} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"><Plus className="h-3 w-3" />Добавить</button>
                </div>
                {fLines.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1">
                    <select value={l.departmentId} onChange={(e) => updateLine(i, "departmentId", e.target.value)} className="w-40 rounded border px-2 py-1 text-xs">
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <input value={l.category} onChange={(e) => updateLine(i, "category", e.target.value)} className="flex-1 rounded border px-2 py-1 text-xs" placeholder="Категория" />
                    <input type="number" value={l.plannedAmount} onChange={(e) => updateLine(i, "plannedAmount", Number(e.target.value))} className="w-24 rounded border px-2 py-1 text-xs" placeholder="План" />
                    <input type="number" value={l.actualAmount} onChange={(e) => updateLine(i, "actualAmount", Number(e.target.value))} className="w-24 rounded border px-2 py-1 text-xs" placeholder="Факт" />
                    <button onClick={() => removeLine(i)} className="p-1 text-neutral-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button onClick={handleSave} disabled={!fName.trim() || saving} className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:bg-neutral-300">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{editId ? "Сохранить" : "Создать"}
                </button>
                <button onClick={() => setShowForm(false)} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-neutral-50">
                  <X className="h-4 w-4" />Отмена
                </button>
              </div>
            </div>
          )}

          {budgets.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-400">Нет бюджетов. Нажмите «Новый бюджет».</div>
          ) : (
            <div className="space-y-3">
              {budgets.map((bgt) => (
                <div key={bgt.id} className="rounded-lg border bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{bgt.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${BUDGET_TYPE_COLORS[bgt.type]}`}>{BUDGET_TYPE_LABELS[bgt.type]}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${BUDGET_STATUS_COLORS[bgt.status]}`}>{BUDGET_STATUS_LABELS[bgt.status]}</span>
                      <span className="text-xs text-neutral-400">{bgt._count.lines} статей</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">План: <span className="font-medium">{fmt(bgt.totalPlanned)}</span></div>
                        <div className="text-xs text-neutral-500">Факт: <span className="font-medium">{fmt(bgt.totalActual)}</span></div>
                      </div>
                      <div className={`text-xs font-medium ${bgt.variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {bgt.variance >= 0 ? "+" : ""}{fmt(bgt.variance)}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(bgt)} className="rounded p-1 text-neutral-400 hover:bg-neutral-100"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => handleDelete(bgt.id)} className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </div>
                  {bgt.lines.length > 0 && (
                    <div className="border-t">
                      {bgt.lines.map((l) => (
                        <div key={l.id} className="flex items-center gap-2 px-4 py-1.5 text-xs border-b last:border-b-0 hover:bg-neutral-50">
                          <span className="w-32 text-neutral-500 truncate">{l.department.name}</span>
                          <span className="flex-1 font-medium">{l.category}</span>
                          <span className="w-20 text-right text-neutral-600">{fmt(l.plannedAmount)}</span>
                          <span className="w-20 text-right text-neutral-600">{fmt(l.actualAmount)}</span>
                          <span className={`w-16 text-right ${l.plannedAmount - l.actualAmount >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {fmt(l.plannedAmount - l.actualAmount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, positive }: { icon: React.ReactNode; label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs font-medium text-neutral-500">{label}</span></div>
      <div className={`text-2xl font-bold ${positive === false ? "text-red-600" : positive === true ? "text-green-700" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-neutral-400">{sub}</div>}
    </div>
  );
}
