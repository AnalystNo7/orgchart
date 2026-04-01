/**
 * OSINT-бенчмарки: финансовые показатели
 * Источники: Gartner IT Key Metrics, NASSCOM, TAdviser
 */

export interface FinancialBenchmark {
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

export const financialBenchmarks: FinancialBenchmark[] = [
  // Revenue per FTE
  {
    metric: "revenue_per_fte",
    industry: "IT-интеграторы",
    companySize: "100-500",
    min: 2_500_000, max: 5_000_000, optimal: 3_500_000,
    unit: "руб/год",
    source: "TAdviser / CNews Analytics",
    description: "Выручка на 1 FTE для средних IT-интеграторов в РФ",
  },
  {
    metric: "revenue_per_fte",
    industry: "IT-интеграторы",
    companySize: "500-2000",
    min: 3_000_000, max: 6_000_000, optimal: 4_200_000,
    unit: "руб/год",
    source: "TAdviser / CNews Analytics",
    description: "Крупные IT-интеграторы: эффект масштаба увеличивает выручку на FTE",
  },
  {
    metric: "revenue_per_fte",
    industry: "IT-продуктовые",
    companySize: "50-500",
    min: 4_000_000, max: 10_000_000, optimal: 6_000_000,
    unit: "руб/год",
    source: "NASSCOM / Gartner",
    description: "Продуктовые IT-компании: высокая маржинальность на FTE",
  },

  // Gross margin
  {
    metric: "gross_margin",
    industry: "IT-интеграторы",
    companySize: "100-2000",
    min: 15, max: 35, optimal: 25,
    unit: "%",
    source: "Gartner IT Key Metrics",
    description: "Валовая маржинальность IT-интеграторов",
  },
  {
    metric: "gross_margin",
    industry: "IT-продуктовые",
    companySize: "50-500",
    min: 60, max: 85, optimal: 70,
    unit: "%",
    source: "Gartner IT Key Metrics",
    description: "Продуктовые IT-компании: высокая маржинальность за счёт лицензий/SaaS",
  },
  {
    metric: "gross_margin",
    industry: "IT-аутсорсинг",
    companySize: "100-2000",
    min: 20, max: 40, optimal: 30,
    unit: "%",
    source: "NASSCOM",
    description: "IT-аутсорсинг: маржинальность зависит от утилизации",
  },

  // Utilization rate (утилизация ПП)
  {
    metric: "utilization_rate",
    industry: "IT-интеграторы",
    companySize: "100-2000",
    min: 65, max: 85, optimal: 75,
    unit: "%",
    source: "Gartner IT Key Metrics",
    description: "Процент оплачиваемого времени ПП от общего рабочего времени",
  },
  {
    metric: "utilization_rate",
    industry: "IT-консалтинг",
    companySize: "100-1000",
    min: 60, max: 80, optimal: 70,
    unit: "%",
    source: "McKinsey / BCG benchmarks",
    description: "Утилизация консультантов (остальное — внутренние проекты, обучение)",
  },

  // Cost per employee
  {
    metric: "cost_per_employee",
    industry: "IT-интеграторы",
    companySize: "100-2000",
    min: 1_800_000, max: 3_600_000, optimal: 2_400_000,
    unit: "руб/год",
    source: "HeadHunter / Habr Career",
    description: "Полная стоимость сотрудника (зарплата + налоги + офис + оборудование)",
  },

  // SGA ratio (selling, general & administrative)
  {
    metric: "sga_ratio",
    industry: "IT-интеграторы",
    companySize: "100-2000",
    min: 10, max: 20, optimal: 15,
    unit: "% от выручки",
    source: "Gartner IT Key Metrics",
    description: "Доля коммерческих и управленческих расходов от выручки",
  },

  // EBITDA margin
  {
    metric: "ebitda_margin",
    industry: "IT-интеграторы",
    companySize: "100-2000",
    min: 8, max: 18, optimal: 12,
    unit: "%",
    source: "TAdviser / CNews Analytics",
    description: "EBITDA маржинальность IT-интеграторов",
  },
  {
    metric: "ebitda_margin",
    industry: "IT-продуктовые",
    companySize: "50-500",
    min: 20, max: 40, optimal: 28,
    unit: "%",
    source: "Gartner",
    description: "EBITDA маржинальность продуктовых IT-компаний",
  },
];

export function getFinancialBenchmarks(
  metric?: string,
  industry?: string,
  companySize?: string
): FinancialBenchmark[] {
  let result = financialBenchmarks;
  if (metric) result = result.filter((b) => b.metric === metric);
  if (industry) result = result.filter((b) => b.industry.toLowerCase().includes(industry.toLowerCase()));
  if (companySize) result = result.filter((b) => b.companySize === companySize);
  return result;
}
