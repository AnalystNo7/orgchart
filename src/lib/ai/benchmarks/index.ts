/**
 * Unified benchmark API — OSINT-бенчмарки (Уровень 1)
 */

import { getOrgDesignBenchmarks, type OrgDesignBenchmark } from "./org-design";
import { getFinancialBenchmarks, type FinancialBenchmark } from "./financial";
import { getHrBenchmarks, type HrBenchmark } from "./hr";

export type BenchmarkCategory = "org_design" | "financial" | "hr";

export type AnyBenchmark = OrgDesignBenchmark | FinancialBenchmark | HrBenchmark;

export interface BenchmarkQuery {
  category?: BenchmarkCategory;
  metric?: string;
  industry?: string;
  companySize?: string;
}

export function getBenchmarks(query: BenchmarkQuery): AnyBenchmark[] {
  const { category, metric, industry, companySize } = query;

  const results: AnyBenchmark[] = [];

  if (!category || category === "org_design") {
    results.push(...getOrgDesignBenchmarks(metric, industry, companySize));
  }
  if (!category || category === "financial") {
    results.push(...getFinancialBenchmarks(metric, industry, companySize));
  }
  if (!category || category === "hr") {
    results.push(...getHrBenchmarks(metric, industry, companySize));
  }

  return results;
}

export function listAvailableMetrics(): Array<{ category: BenchmarkCategory; metric: string; description: string }> {
  return [
    { category: "org_design", metric: "span_of_control", description: "Норма управляемости (подчинённых на руководителя)" },
    { category: "org_design", metric: "overhead_ratio", description: "Доля административно-управленческого персонала (АУП) от общего FTE, %" },
    { category: "org_design", metric: "hierarchy_depth", description: "Глубина иерархии (уровней)" },
    { category: "org_design", metric: "revenue_dept_share", description: "Доля FTE в зарабатывающих подразделениях (%)" },
    { category: "org_design", metric: "manager_to_staff", description: "Соотношение руководителей к сотрудникам" },
    { category: "financial", metric: "revenue_per_fte", description: "Выручка на 1 FTE (руб/год)" },
    { category: "financial", metric: "gross_margin", description: "Валовая маржинальность (%)" },
    { category: "financial", metric: "utilization_rate", description: "Утилизация производственного персонала (ПП), %" },
    { category: "financial", metric: "cost_per_employee", description: "Полная стоимость сотрудника (руб/год)" },
    { category: "financial", metric: "sga_ratio", description: "Доля SGA от выручки (%)" },
    { category: "financial", metric: "ebitda_margin", description: "EBITDA маржинальность (%)" },
    { category: "hr", metric: "turnover_rate", description: "Текучесть кадров (% в год)" },
    { category: "hr", metric: "time_to_fill", description: "Время закрытия вакансии (дней)" },
    { category: "hr", metric: "cost_per_hire", description: "Стоимость найма 1 сотрудника (руб)" },
    { category: "hr", metric: "hr_to_employee", description: "Соотношение HR к сотрудникам" },
    { category: "hr", metric: "training_hours", description: "Часы обучения на сотрудника (часов/год)" },
    { category: "hr", metric: "training_budget", description: "Бюджет обучения на сотрудника (руб/год)" },
    { category: "hr", metric: "absenteeism_rate", description: "Уровень абсентеизма (%)" },
    { category: "hr", metric: "engagement_score", description: "Вовлечённость сотрудников (%)" },
    { category: "hr", metric: "succession_coverage", description: "Покрытие ключевых позиций преемниками (%)" },
  ];
}

export function listAvailableIndustries(): string[] {
  return [
    "IT-интеграторы",
    "IT-продуктовые",
    "IT-аутсорсинг",
    "IT-консалтинг",
    "Нефтегаз",
    "Производство",
  ];
}
