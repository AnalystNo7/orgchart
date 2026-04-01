"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrgChartStore } from "@/lib/store";
import { BarChart3, ArrowUp, ArrowDown, Minus, Loader2 } from "lucide-react";

interface Benchmark {
  metric: string;
  industry: string;
  companySize: string;
  min: number;
  max: number;
  optimal: number;
  unit: string;
  source: string;
  description: string;
}

interface MetricDef {
  category: string;
  metric: string;
  description: string;
}

interface CurrentMetrics {
  span_of_control: number | null;
  overhead_ratio: number | null;
  hierarchy_depth: number | null;
  revenue_dept_share: number | null;
  revenue_per_fte: number | null;
  gross_margin: number | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  org_design: "Оргдизайн",
  financial: "Финансы",
  hr: "HR",
};

const METRIC_LABELS: Record<string, string> = {
  span_of_control: "Span of control",
  overhead_ratio: "Overhead ratio (АУП)",
  hierarchy_depth: "Глубина иерархии",
  revenue_dept_share: "Доля REVENUE FTE",
  manager_to_staff: "Руководитель/сотрудник",
  revenue_per_fte: "Выручка на FTE",
  gross_margin: "Валовая маржа",
  utilization_rate: "Утилизация ПП",
  cost_per_employee: "Стоимость сотрудника",
  sga_ratio: "SGA ratio",
  ebitda_margin: "EBITDA margin",
  turnover_rate: "Текучесть",
  time_to_fill: "Время закрытия вакансии",
  cost_per_hire: "Стоимость найма",
  hr_to_employee: "HR/сотрудник",
  training_hours: "Часы обучения",
  training_budget: "Бюджет обучения",
  absenteeism_rate: "Абсентеизм",
  engagement_score: "Вовлечённость",
  succession_coverage: "Покрытие преемниками",
};

function formatValue(value: number, unit: string): string {
  if (unit === "руб/год" || unit === "руб") {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)} тыс`;
    return `${value}`;
  }
  return `${value}`;
}

function DeviationBadge({ current, min, max, optimal }: { current: number; min: number; max: number; optimal: number }) {
  if (current >= min && current <= max) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <Minus className="h-3 w-3" />
        В норме
      </span>
    );
  }
  if (current < min) {
    const pct = min > 0 ? Math.round(((min - current) / min) * 100) : 0;
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        <ArrowDown className="h-3 w-3" />
        Ниже на {pct}%
      </span>
    );
  }
  const pct = max > 0 ? Math.round(((current - max) / max) * 100) : 0;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      <ArrowUp className="h-3 w-3" />
      Выше на {pct}%
    </span>
  );
}

export default function BenchmarksPage() {
  const currentScenarioId = useOrgChartStore((s) => s.currentScenarioId);

  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [metricDefs, setMetricDefs] = useState<MetricDef[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [currentMetrics, setCurrentMetrics] = useState<CurrentMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterIndustry, setFilterIndustry] = useState<string>("");
  const [filterSize, setFilterSize] = useState<string>("");

  // Load benchmarks
  useEffect(() => {
    setLoading(true);
    fetch("/api/benchmarks")
      .then((r) => r.json())
      .then((data) => {
        setBenchmarks(data.benchmarks || []);
        setMetricDefs(data.availableMetrics || []);
        setIndustries(data.availableIndustries || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load current scenario metrics
  useEffect(() => {
    if (!currentScenarioId) {
      setCurrentMetrics(null);
      return;
    }
    fetch(`/api/benchmarks/metrics?scenarioId=${currentScenarioId}`)
      .then((r) => r.json())
      .then((data) => setCurrentMetrics(data.metrics || null))
      .catch(() => setCurrentMetrics(null));
  }, [currentScenarioId]);

  // Available company sizes from data
  const companySizes = useMemo(() => {
    const sizes = new Set(benchmarks.map((b) => b.companySize));
    return Array.from(sizes).sort();
  }, [benchmarks]);

  // Filtered benchmarks
  const filtered = useMemo(() => {
    let result = benchmarks;
    if (filterCategory) {
      const metricsInCategory = metricDefs
        .filter((m) => m.category === filterCategory)
        .map((m) => m.metric);
      result = result.filter((b) => metricsInCategory.includes(b.metric));
    }
    if (filterIndustry) {
      result = result.filter((b) => b.industry === filterIndustry);
    }
    if (filterSize) {
      result = result.filter((b) => b.companySize === filterSize);
    }
    return result;
  }, [benchmarks, metricDefs, filterCategory, filterIndustry, filterSize]);

  // Get current value for a metric
  function getCurrentValue(metric: string): number | null {
    if (!currentMetrics) return null;
    const m = currentMetrics as Record<string, number | null>;
    return m[metric] ?? null;
  }

  // Get category for a metric
  function getCategory(metric: string): string {
    const def = metricDefs.find((m) => m.metric === metric);
    return def?.category || "";
  }

  if (!currentScenarioId) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-400">
        Выберите сценарий
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-neutral-700" />
        <h1 className="text-xl font-bold">Бенчмарки</h1>
        <span className="text-sm text-neutral-400">
          OSINT-данные по отраслям
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Категория</label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
          >
            <option value="">Все</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Отрасль</label>
          <select
            value={filterIndustry}
            onChange={(e) => setFilterIndustry(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
          >
            <option value="">Все</option>
            {industries.map((ind) => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Размер компании</label>
          <select
            value={filterSize}
            onChange={(e) => setFilterSize(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
          >
            <option value="">Все</option>
            {companySizes.map((s) => (
              <option key={s} value={s}>{s} чел.</option>
            ))}
          </select>
        </div>
        <div className="ml-auto text-sm text-neutral-400">
          {filtered.length} из {benchmarks.length}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-neutral-50 text-left text-xs font-medium uppercase text-neutral-500">
                <th className="px-4 py-3">Метрика</th>
                <th className="px-4 py-3">Категория</th>
                <th className="px-4 py-3">Отрасль</th>
                <th className="px-4 py-3">Размер</th>
                <th className="px-4 py-3 text-center">Мин</th>
                <th className="px-4 py-3 text-center">Оптимум</th>
                <th className="px-4 py-3 text-center">Макс</th>
                <th className="px-4 py-3 text-center">У вас</th>
                <th className="px-4 py-3">Отклонение</th>
                <th className="px-4 py-3">Источник</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, i) => {
                const currentVal = getCurrentValue(b.metric);
                const cat = getCategory(b.metric);
                return (
                  <tr
                    key={`${b.metric}-${b.industry}-${b.companySize}-${i}`}
                    className="border-b last:border-0 hover:bg-neutral-50"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{METRIC_LABELS[b.metric] || b.metric}</div>
                      <div className="text-xs text-neutral-400">{b.description}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">
                        {CATEGORY_LABELS[cat] || cat}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">{b.industry}</td>
                    <td className="px-4 py-2.5 text-neutral-600">{b.companySize}</td>
                    <td className="px-4 py-2.5 text-center">{formatValue(b.min, b.unit)}</td>
                    <td className="px-4 py-2.5 text-center font-semibold">{formatValue(b.optimal, b.unit)}</td>
                    <td className="px-4 py-2.5 text-center">{formatValue(b.max, b.unit)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {currentVal !== null ? (
                        <span className="font-semibold">{formatValue(currentVal, b.unit)}</span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {currentVal !== null ? (
                        <DeviationBadge current={currentVal} min={b.min} max={b.max} optimal={b.optimal} />
                      ) : (
                        <span className="text-xs text-neutral-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-neutral-400">{b.source}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-neutral-400">
                    Нет бенчмарков по заданным фильтрам
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
