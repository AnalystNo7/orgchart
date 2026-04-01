/**
 * OSINT-бенчмарки: организационный дизайн
 * Источники: Bain Spans & Layers, McKinsey OrgSolutions, Deloitte HC Trends
 */

export interface OrgDesignBenchmark {
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

export const orgDesignBenchmarks: OrgDesignBenchmark[] = [
  // Span of control
  {
    metric: "span_of_control",
    industry: "IT-интеграторы",
    companySize: "100-500",
    min: 5, max: 8, optimal: 6,
    unit: "подчинённых",
    source: "Bain Spans & Layers",
    description: "Норма управляемости для среднего менеджмента IT-компаний",
  },
  {
    metric: "span_of_control",
    industry: "IT-интеграторы",
    companySize: "500-2000",
    min: 6, max: 10, optimal: 7,
    unit: "подчинённых",
    source: "Bain Spans & Layers",
    description: "Для крупных IT-интеграторов span растёт за счёт стандартизации",
  },
  {
    metric: "span_of_control",
    industry: "IT-продуктовые",
    companySize: "50-500",
    min: 4, max: 7, optimal: 5,
    unit: "подчинённых",
    source: "McKinsey OrgSolutions",
    description: "Продуктовые команды требуют более узкого span для инноваций",
  },
  {
    metric: "span_of_control",
    industry: "Нефтегаз",
    companySize: "1000-5000",
    min: 5, max: 8, optimal: 6,
    unit: "подчинённых",
    source: "McKinsey OrgSolutions",
    description: "Нефтегазовый сектор — умеренный span из-за регуляторных требований",
  },
  {
    metric: "span_of_control",
    industry: "Производство",
    companySize: "500-5000",
    min: 8, max: 15, optimal: 10,
    unit: "подчинённых",
    source: "Bain Spans & Layers",
    description: "Производственные линии допускают широкий span при стандартных операциях",
  },

  // Overhead ratio (доля АУП)
  {
    metric: "overhead_ratio",
    industry: "IT-интеграторы",
    companySize: "100-500",
    min: 15, max: 25, optimal: 20,
    unit: "%",
    source: "Deloitte HC Trends",
    description: "Доля АУП от общего FTE для средних IT-компаний",
  },
  {
    metric: "overhead_ratio",
    industry: "IT-интеграторы",
    companySize: "500-2000",
    min: 12, max: 20, optimal: 16,
    unit: "%",
    source: "Deloitte HC Trends",
    description: "Крупные IT-интеграторы оптимизируют overhead за счёт масштаба",
  },
  {
    metric: "overhead_ratio",
    industry: "IT-продуктовые",
    companySize: "50-500",
    min: 10, max: 18, optimal: 14,
    unit: "%",
    source: "McKinsey OrgSolutions",
    description: "Продуктовые IT-компании имеют минимальный overhead",
  },
  {
    metric: "overhead_ratio",
    industry: "Нефтегаз",
    companySize: "1000-5000",
    min: 18, max: 30, optimal: 22,
    unit: "%",
    source: "McKinsey OrgSolutions",
    description: "Нефтегаз: повышенный overhead из-за compliance и HSE",
  },

  // Hierarchy depth
  {
    metric: "hierarchy_depth",
    industry: "IT-интеграторы",
    companySize: "100-500",
    min: 3, max: 4, optimal: 3,
    unit: "уровней",
    source: "Bain Spans & Layers",
    description: "Оптимальная глубина иерархии для средних IT-компаний",
  },
  {
    metric: "hierarchy_depth",
    industry: "IT-интеграторы",
    companySize: "500-2000",
    min: 4, max: 5, optimal: 4,
    unit: "уровней",
    source: "Bain Spans & Layers",
    description: "Для крупных IT-интеграторов допустимо 4-5 уровней",
  },
  {
    metric: "hierarchy_depth",
    industry: "Нефтегаз",
    companySize: "1000-5000",
    min: 5, max: 7, optimal: 6,
    unit: "уровней",
    source: "McKinsey OrgSolutions",
    description: "Нефтегаз допускает глубокую иерархию из-за операционной сложности",
  },

  // Revenue departments share
  {
    metric: "revenue_dept_share",
    industry: "IT-интеграторы",
    companySize: "100-500",
    min: 40, max: 60, optimal: 50,
    unit: "% FTE",
    source: "Deloitte HC Trends",
    description: "Доля FTE в зарабатывающих подразделениях (REVENUE)",
  },
  {
    metric: "revenue_dept_share",
    industry: "IT-интеграторы",
    companySize: "500-2000",
    min: 45, max: 65, optimal: 55,
    unit: "% FTE",
    source: "Deloitte HC Trends",
    description: "Крупные интеграторы увеличивают долю ПП за счёт масштаба",
  },

  // Manager-to-staff ratio
  {
    metric: "manager_to_staff",
    industry: "IT-интеграторы",
    companySize: "100-2000",
    min: 1, max: 1, optimal: 1,
    unit: "руководитель на 6-8 сотрудников",
    source: "Bain Spans & Layers",
    description: "Оптимальное соотношение руководителей к подчинённым",
  },
];

export function getOrgDesignBenchmarks(
  metric?: string,
  industry?: string,
  companySize?: string
): OrgDesignBenchmark[] {
  let result = orgDesignBenchmarks;
  if (metric) result = result.filter((b) => b.metric === metric);
  if (industry) result = result.filter((b) => b.industry.toLowerCase().includes(industry.toLowerCase()));
  if (companySize) result = result.filter((b) => b.companySize === companySize);
  return result;
}
