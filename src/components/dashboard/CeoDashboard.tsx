"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrgChartStore } from "@/lib/store";
import {
  Activity,
  Users,
  Building2,
  Network,
  Target,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  Info,
  XCircle,
  RefreshCw,
  Lightbulb,
} from "lucide-react";

// --- Types ---

interface OhiComponent {
  key: string;
  name: string;
  weight: number;
  score: number | null;
  metrics: Record<string, number | string | null>;
}

interface OhiData {
  overallScore: number;
  components: OhiComponent[];
  summary: {
    employees: number;
    departments: number;
    processes: number;
    goals: number;
    totalFte: number;
  };
}

interface InsightData {
  id: string;
  category: string;
  severity: "CRITICAL" | "WARNING" | "INFO" | "POSITIVE";
  title: string;
  description: string;
  metricKey: string | null;
  currentValue: number | null;
  benchmarkValue: number | null;
  resolved: boolean;
  recommendations: Array<{ id: string; title: string; description: string; priority: number }>;
}

// --- Constants ---

const COMPONENT_ICONS: Record<string, string> = {
  structure: "🏗️",
  financial: "💰",
  process: "⚙️",
  competency: "🎓",
  strategy: "🎯",
  operations: "📊",
  customer: "👥",
};

const METRIC_LABELS: Record<string, string> = {
  spanOfControl: "Span of control",
  overheadRatio: "Overhead ratio",
  hierarchyDepth: "Глубина иерархии",
  margin: "Маржинальность",
  revenuePerFte: "Revenue/FTE",
  totalRevenue: "Общая выручка",
  totalCost: "Общие затраты",
  totalProcesses: "Всего процессов",
  withOwner: "С владельцем",
  withRaci: "С RACI",
  ownerPct: "% с владельцем",
  raciPct: "% с RACI",
  assessments: "Оценок",
  gaps: "Разрывов",
  noGapPct: "% без разрыва",
  avgGap: "Ср. разрыв",
  totalGoals: "Всего целей",
  avgProgress: "Ср. прогресс",
  atRisk: "Под угрозой",
  healthyPct: "% здоровых",
  ppTotal: "ПП всего",
  ppWithContracts: "ПП с контрактами",
  utilizationPct: "Утилизация ПП",
  note: "Примечание",
};

// --- Helpers ---

function scoreColor(score: number | null): string {
  if (score === null) return "text-neutral-400";
  if (score >= 70) return "text-green-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

function scoreBg(score: number | null): string {
  if (score === null) return "bg-neutral-200";
  if (score >= 70) return "bg-green-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function scoreBgLight(score: number | null): string {
  if (score === null) return "bg-neutral-50 border-neutral-200";
  if (score >= 70) return "bg-green-50 border-green-200";
  if (score >= 40) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function scoreIcon(score: number | null) {
  if (score === null) return <Minus className="h-4 w-4 text-neutral-400" />;
  if (score >= 70) return <TrendingUp className="h-4 w-4 text-green-600" />;
  if (score >= 40) return <Minus className="h-4 w-4 text-amber-600" />;
  return <TrendingDown className="h-4 w-4 text-red-600" />;
}

function formatMetricValue(key: string, value: number | string | null): string {
  if (value === null) return "—";
  if (typeof value === "string") return value;
  if (key.includes("Pct") || key === "margin" || key === "overheadRatio" || key === "utilizationPct") return `${value}%`;
  if (key === "revenuePerFte" || key === "totalRevenue" || key === "totalCost") {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  }
  return value.toString();
}

// --- SVG Gauge ---

function OhiGauge({ score, size = 160 }: { score: number; size?: number }) {
  const radius = (size - 20) / 2;
  const circumference = Math.PI * radius; // semicircle
  const progress = (score / 100) * circumference;
  const color = score >= 70 ? "#16a34a" : score >= 40 ? "#d97706" : "#dc2626";

  return (
    <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
      {/* Background arc */}
      <path
        d={`M 10 ${size / 2 + 10} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2 + 10}`}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth="12"
        strokeLinecap="round"
      />
      {/* Progress arc */}
      <path
        d={`M 10 ${size / 2 + 10} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2 + 10}`}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${progress} ${circumference}`}
      />
      {/* Score text */}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        className="text-3xl font-bold"
        fill={color}
        fontSize="36"
        fontWeight="bold"
      >
        {score}
      </text>
      <text
        x={size / 2}
        y={size / 2 + 18}
        textAnchor="middle"
        fill="#9ca3af"
        fontSize="12"
      >
        из 100
      </text>
    </svg>
  );
}

// --- Component ---

export function CeoDashboard() {
  const currentScenarioId = useOrgChartStore((s) => s.currentScenarioId);
  const [data, setData] = useState<OhiData | null>(null);
  const [insights, setInsights] = useState<InsightData[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOhi = useCallback(() => {
    if (!currentScenarioId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/ohi?scenarioId=${currentScenarioId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load OHI");
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [currentScenarioId]);

  const loadInsights = useCallback(() => {
    if (!currentScenarioId) return;
    fetch(`/api/insights?scenarioId=${currentScenarioId}&resolved=false`)
      .then((r) => r.json())
      .then((d) => setInsights(d.insights || []))
      .catch(() => {});
  }, [currentScenarioId]);

  const runAnalysis = useCallback(async () => {
    if (!currentScenarioId) return;
    setAnalyzing(true);
    try {
      await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: currentScenarioId }),
      });
      loadInsights();
    } catch {} finally { setAnalyzing(false); }
  }, [currentScenarioId, loadInsights]);

  useEffect(() => {
    loadOhi();
    loadInsights();
  }, [loadOhi, loadInsights]);

  if (!currentScenarioId) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-400">
        Выберите сценарий
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center text-red-500">
        Ошибка загрузки: {error || "Нет данных"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Activity className="h-6 w-6 text-neutral-700" />
        <h1 className="text-xl font-bold">CEO Dashboard</h1>
        <span className="text-sm text-neutral-400">Organization Health Index</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard icon={<Users className="h-5 w-5 text-blue-600" />} label="Сотрудники" value={data.summary.employees} sub={`${data.summary.totalFte} FTE`} />
        <SummaryCard icon={<Building2 className="h-5 w-5 text-brand-800" />} label="Подразделения" value={data.summary.departments} />
        <SummaryCard icon={<Network className="h-5 w-5 text-orange-600" />} label="Процессы" value={data.summary.processes} />
        <SummaryCard icon={<Target className="h-5 w-5 text-green-600" />} label="Цели" value={data.summary.goals} />
      </div>

      {/* OHI Score + Components */}
      <div className="grid grid-cols-3 gap-4">
        {/* OHI Gauge - takes 1 column */}
        <div className="rounded-lg border bg-white p-6 flex flex-col items-center justify-center">
          <h2 className="text-sm font-semibold text-neutral-500 mb-2">OHI Score</h2>
          <OhiGauge score={data.overallScore} />
          <div className="mt-2 text-xs text-neutral-400">
            {data.overallScore >= 70 ? "Здоровая организация" : data.overallScore >= 40 ? "Требуется внимание" : "Критическое состояние"}
          </div>
        </div>

        {/* Component cards - takes 2 columns */}
        <div className="col-span-2 grid grid-cols-2 gap-3">
          {data.components.map((comp) => (
            <ComponentCard key={comp.key} component={comp} />
          ))}
        </div>
      </div>

      {/* AI Insights */}
      <div className="rounded-lg border bg-white">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold">AI Инсайты</h2>
            {insights.length > 0 && (
              <span className="rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px] font-medium">
                {insights.filter((i) => i.severity === "CRITICAL" || i.severity === "WARNING").length}
              </span>
            )}
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${analyzing ? "animate-spin" : ""}`} />
            {analyzing ? "Анализ..." : "Запустить анализ"}
          </button>
        </div>

        {insights.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-neutral-400">
            Нет инсайтов. Нажмите «Запустить анализ» для проверки здоровья организации.
          </div>
        ) : (
          <div className="divide-y">
            {insights.map((insight) => (
              <InsightRow key={insight.id} insight={insight} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

const SEVERITY_CONFIG: Record<string, { icon: React.ReactNode; bg: string; text: string }> = {
  CRITICAL: { icon: <XCircle className="h-4 w-4 text-red-600" />, bg: "bg-red-50", text: "text-red-700" },
  WARNING: { icon: <AlertTriangle className="h-4 w-4 text-amber-600" />, bg: "bg-amber-50", text: "text-amber-700" },
  INFO: { icon: <Info className="h-4 w-4 text-blue-600" />, bg: "bg-blue-50", text: "text-blue-700" },
  POSITIVE: { icon: <CheckCircle className="h-4 w-4 text-green-600" />, bg: "bg-green-50", text: "text-green-700" },
};

function InsightRow({ insight }: { insight: InsightData }) {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.INFO;

  return (
    <div className={`${config.bg}`}>
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-black/5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="mt-0.5">{config.icon}</div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${config.text}`}>{insight.title}</div>
          <div className="text-xs text-neutral-500 mt-0.5">{insight.description}</div>
        </div>
        {insight.recommendations.length > 0 && (
          <span className="text-[10px] text-neutral-400 shrink-0">{insight.recommendations.length} рек.</span>
        )}
      </div>
      {expanded && insight.recommendations.length > 0 && (
        <div className="px-4 pb-3 pl-11 space-y-1.5">
          {insight.recommendations.map((rec) => (
            <div key={rec.id} className="flex items-start gap-2 text-xs">
              <Lightbulb className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium">{rec.title}:</span>{" "}
                <span className="text-neutral-500">{rec.description}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium text-neutral-500">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-neutral-400">{sub}</div>}
    </div>
  );
}

function ComponentCard({ component }: { component: OhiComponent }) {
  const { key, name, weight, score, metrics } = component;
  const icon = COMPONENT_ICONS[key] || "📌";
  const visibleMetrics = Object.entries(metrics).filter(
    ([k]) => k !== "note"
  );
  const note = metrics.note;

  return (
    <div className={`rounded-lg border p-3 ${scoreBgLight(score)}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{icon}</span>
          <span className="text-xs font-semibold">{name}</span>
          <span className="text-[10px] text-neutral-400">{Math.round(weight * 100)}%</span>
        </div>
        {scoreIcon(score)}
      </div>

      {score !== null ? (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xl font-bold ${scoreColor(score)}`}>{score}</span>
            <div className="flex-1 h-2 rounded-full bg-neutral-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${scoreBg(score)}`}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>
          {visibleMetrics.length > 0 && (
            <div className="space-y-0.5">
              {visibleMetrics.slice(0, 3).map(([k, v]) => (
                <div key={k} className="flex justify-between text-[10px]">
                  <span className="text-neutral-500">{METRIC_LABELS[k] || k}</span>
                  <span className="font-medium">{formatMetricValue(k, v)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="py-3 text-center">
          <span className="text-xs text-neutral-400">{typeof note === "string" ? note : "N/A"}</span>
        </div>
      )}
    </div>
  );
}
