/**
 * OSINT-бенчмарки: HR и управление персоналом
 * Источники: SHRM, Bersin by Deloitte, HeadHunter, SuperJob
 */

export interface HrBenchmark {
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

export const hrBenchmarks: HrBenchmark[] = [
  // Turnover rate (текучесть)
  {
    metric: "turnover_rate",
    industry: "IT-интеграторы",
    companySize: "100-2000",
    min: 10, max: 20, optimal: 14,
    unit: "% в год",
    source: "HeadHunter IT Report",
    description: "Средняя текучесть в IT-интеграторах РФ",
  },
  {
    metric: "turnover_rate",
    industry: "IT-продуктовые",
    companySize: "50-500",
    min: 8, max: 15, optimal: 12,
    unit: "% в год",
    source: "Habr Career / SuperJob",
    description: "Продуктовые IT-компании: ниже текучесть за счёт бренда и условий",
  },
  {
    metric: "turnover_rate",
    industry: "Нефтегаз",
    companySize: "1000-5000",
    min: 5, max: 12, optimal: 8,
    unit: "% в год",
    source: "Deloitte HC Trends",
    description: "Нефтегазовый сектор: низкая текучесть, высокие зарплаты",
  },

  // Time to fill (время закрытия вакансии)
  {
    metric: "time_to_fill",
    industry: "IT-интеграторы",
    companySize: "100-2000",
    min: 30, max: 60, optimal: 40,
    unit: "дней",
    source: "HeadHunter IT Report",
    description: "Среднее время закрытия вакансии IT-специалиста",
  },
  {
    metric: "time_to_fill",
    industry: "IT-интеграторы",
    companySize: "100-2000",
    min: 45, max: 90, optimal: 60,
    unit: "дней",
    source: "HeadHunter IT Report",
    description: "Время закрытия вакансии senior/lead уровня",
  },

  // Cost per hire (стоимость найма)
  {
    metric: "cost_per_hire",
    industry: "IT-интеграторы",
    companySize: "100-2000",
    min: 80_000, max: 200_000, optimal: 120_000,
    unit: "руб",
    source: "SHRM / Адаптация под РФ",
    description: "Стоимость привлечения 1 IT-специалиста (рекрутинг + адаптация)",
  },

  // HR-to-employee ratio
  {
    metric: "hr_to_employee",
    industry: "IT-интеграторы",
    companySize: "100-500",
    min: 1, max: 1, optimal: 1,
    unit: "HR на 80-100 сотрудников",
    source: "SHRM / Bersin by Deloitte",
    description: "Оптимальное соотношение HR-специалистов к сотрудникам",
  },
  {
    metric: "hr_to_employee",
    industry: "IT-интеграторы",
    companySize: "500-2000",
    min: 1, max: 1, optimal: 1,
    unit: "HR на 100-120 сотрудников",
    source: "SHRM / Bersin by Deloitte",
    description: "Крупные компании: эффект масштаба для HR-функции",
  },

  // Training hours per employee
  {
    metric: "training_hours",
    industry: "IT-интеграторы",
    companySize: "100-2000",
    min: 20, max: 60, optimal: 40,
    unit: "часов/год",
    source: "Bersin by Deloitte",
    description: "Часы обучения на 1 сотрудника в год",
  },

  // Training budget per employee
  {
    metric: "training_budget",
    industry: "IT-интеграторы",
    companySize: "100-2000",
    min: 30_000, max: 100_000, optimal: 60_000,
    unit: "руб/год",
    source: "Bersin by Deloitte / HH",
    description: "Бюджет обучения на 1 сотрудника в год",
  },

  // Absenteeism rate
  {
    metric: "absenteeism_rate",
    industry: "IT-интеграторы",
    companySize: "100-2000",
    min: 2, max: 5, optimal: 3,
    unit: "%",
    source: "SHRM",
    description: "Процент пропущенных рабочих дней (болезни, отсутствия)",
  },

  // Employee engagement
  {
    metric: "engagement_score",
    industry: "IT-интеграторы",
    companySize: "100-2000",
    min: 60, max: 80, optimal: 70,
    unit: "% (eNPS-подобный)",
    source: "Gallup / Deloitte",
    description: "Уровень вовлечённости сотрудников",
  },

  // Succession coverage
  {
    metric: "succession_coverage",
    industry: "IT-интеграторы",
    companySize: "500-2000",
    min: 50, max: 80, optimal: 65,
    unit: "% ключевых позиций",
    source: "Bersin by Deloitte",
    description: "Процент ключевых позиций с подготовленным преемником",
  },
];

export function getHrBenchmarks(
  metric?: string,
  industry?: string,
  companySize?: string
): HrBenchmark[] {
  let result = hrBenchmarks;
  if (metric) result = result.filter((b) => b.metric === metric);
  if (industry) result = result.filter((b) => b.industry.toLowerCase().includes(industry.toLowerCase()));
  if (companySize) result = result.filter((b) => b.companySize === companySize);
  return result;
}
