import { prisma } from "./db";
import { calculateOhi } from "./ohi-calculator";
import type { InsightSeverity, InsightCategory } from "@prisma/client";

interface InsightDraft {
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  description: string;
  metricKey?: string;
  currentValue?: number;
  benchmarkValue?: number;
  recommendations: Array<{ title: string; description: string; priority: number }>;
}

/**
 * Run a full health check on a scenario.
 * Analyzes all layers, detects anomalies, generates insights and recommendations.
 * Stores results in AIInsight + AIRecommendation tables.
 */
export async function runHealthCheck(scenarioId: string): Promise<{ created: number; insights: InsightDraft[] }> {
  const drafts: InsightDraft[] = [];

  // 1. OHI-based analysis
  const ohi = await calculateOhi(scenarioId);

  for (const comp of ohi.components) {
    if (comp.score === null) continue;

    if (comp.score < 40) {
      drafts.push({
        category: mapComponentToCategory(comp.key),
        severity: "CRITICAL",
        title: `${comp.name}: критический уровень (${comp.score}/100)`,
        description: `Компонент OHI "${comp.name}" имеет оценку ${comp.score}/100, что ниже критического порога 40. ${formatMetrics(comp.metrics)}`,
        metricKey: comp.key,
        currentValue: comp.score,
        benchmarkValue: 70,
        recommendations: getRecommendations(comp.key, comp.score, comp.metrics),
      });
    } else if (comp.score < 60) {
      drafts.push({
        category: mapComponentToCategory(comp.key),
        severity: "WARNING",
        title: `${comp.name}: требует внимания (${comp.score}/100)`,
        description: `Компонент OHI "${comp.name}" имеет оценку ${comp.score}/100. ${formatMetrics(comp.metrics)}`,
        metricKey: comp.key,
        currentValue: comp.score,
        benchmarkValue: 70,
        recommendations: getRecommendations(comp.key, comp.score, comp.metrics),
      });
    } else if (comp.score >= 85) {
      drafts.push({
        category: mapComponentToCategory(comp.key),
        severity: "POSITIVE",
        title: `${comp.name}: отличный результат (${comp.score}/100)`,
        description: `Компонент "${comp.name}" показывает высокий уровень — ${comp.score}/100.`,
        metricKey: comp.key,
        currentValue: comp.score,
        benchmarkValue: 70,
        recommendations: [],
      });
    }
  }

  // 2. Specific metric checks
  const structureComp = ohi.components.find((c) => c.key === "structure");
  if (structureComp?.metrics) {
    const overhead = structureComp.metrics.overheadRatio as number;
    if (overhead > 30) {
      drafts.push({
        category: "STRUCTURE",
        severity: overhead > 40 ? "CRITICAL" : "WARNING",
        title: `Overhead ratio ${overhead}% — выше нормы`,
        description: `Доля АУП составляет ${overhead}% от общего FTE. Бенчмарк для IT-компаний: 15-25%.`,
        metricKey: "overheadRatio",
        currentValue: overhead,
        benchmarkValue: 25,
        recommendations: [
          { title: "Аудит АУП-функций", description: "Провести аудит административных функций для выявления возможностей автоматизации и оптимизации.", priority: 0 },
          { title: "Общий центр обслуживания", description: "Рассмотреть создание ОЦО для централизации бэк-офисных функций.", priority: 1 },
        ],
      });
    }

    const span = structureComp.metrics.spanOfControl as number;
    if (span < 3) {
      drafts.push({
        category: "STRUCTURE",
        severity: "WARNING",
        title: `Span of control ${span} — слишком узкий`,
        description: `Среднее количество подчинённых на руководителя: ${span}. Бенчмарк: 5-8. Избыточное количество управленческих уровней.`,
        metricKey: "spanOfControl",
        currentValue: span,
        benchmarkValue: 6,
        recommendations: [
          { title: "Расширить spans", description: "Объединить мелкие подразделения, убрать избыточные уровни иерархии.", priority: 0 },
        ],
      });
    }
  }

  // 3. Process checks
  const processComp = ohi.components.find((c) => c.key === "process");
  if (processComp?.metrics) {
    const ownerPct = processComp.metrics.ownerPct as number;
    if (ownerPct !== undefined && ownerPct < 50) {
      drafts.push({
        category: "PROCESS",
        severity: "WARNING",
        title: `${100 - ownerPct}% процессов без владельца`,
        description: `Только ${ownerPct}% бизнес-процессов имеют назначенного владельца. Это затрудняет управление качеством и SLA.`,
        metricKey: "processOwnerPct",
        currentValue: ownerPct,
        benchmarkValue: 100,
        recommendations: [
          { title: "Назначить владельцев процессов", description: "Провести ревью процессов и назначить ответственных руководителей для каждого процесса.", priority: 0 },
        ],
      });
    }
  }

  // 4. Strategy checks
  const strategyComp = ohi.components.find((c) => c.key === "strategy");
  if (strategyComp?.metrics) {
    const atRisk = strategyComp.metrics.atRisk as number;
    if (atRisk > 0) {
      drafts.push({
        category: "STRATEGY",
        severity: atRisk > 3 ? "CRITICAL" : "WARNING",
        title: `${atRisk} целей под угрозой или провалены`,
        description: `Из стратегических целей BSC/OKR ${atRisk} имеют статус "Под угрозой" или "Провалена". Средний прогресс: ${strategyComp.metrics.avgProgress}%.`,
        metricKey: "goalsAtRisk",
        currentValue: atRisk,
        benchmarkValue: 0,
        recommendations: [
          { title: "Ревью целей", description: "Провести ревью целей под угрозой, определить корневые причины и скорректировать планы.", priority: 0 },
        ],
      });
    }
  }

  // 5. Customer checks
  const customerComp = ohi.components.find((c) => c.key === "customer");
  if (customerComp?.score !== null && customerComp?.metrics) {
    const concentration = customerComp.metrics.concentrationTop3 as number;
    if (concentration > 70) {
      drafts.push({
        category: "CUSTOMER",
        severity: concentration > 85 ? "CRITICAL" : "WARNING",
        title: `Концентрация выручки: ${concentration}% от top-3 заказчиков`,
        description: `${concentration}% выручки приходится на 3 крупнейших заказчиков. Высокий риск при потере ключевого клиента.`,
        metricKey: "revenueConcentration",
        currentValue: concentration,
        benchmarkValue: 40,
        recommendations: [
          { title: "Диверсификация портфеля", description: "Активизировать привлечение новых заказчиков, развивать pipeline с фокусом на новые отрасли/сегменты.", priority: 0 },
        ],
      });
    }
  }

  // 6. Budget checks
  const budgets = await prisma.budget.findMany({
    where: { scenarioId, status: "APPROVED" },
    include: { lines: true },
  });

  for (const budget of budgets) {
    const planned = budget.lines.reduce((s, l) => s + l.plannedAmount, 0);
    const actual = budget.lines.reduce((s, l) => s + l.actualAmount, 0);
    if (planned > 0 && actual > planned * 1.1) {
      const overrun = Math.round(((actual - planned) / planned) * 100);
      drafts.push({
        category: "FINANCIAL",
        severity: overrun > 25 ? "CRITICAL" : "WARNING",
        title: `Бюджет "${budget.name}": перерасход ${overrun}%`,
        description: `Фактические расходы (${Math.round(actual)}) превысили план (${Math.round(planned)}) на ${overrun}%.`,
        metricKey: "budgetOverrun",
        currentValue: actual,
        benchmarkValue: planned,
        recommendations: [
          { title: "Анализ перерасхода", description: "Определить статьи с наибольшим отклонением и разработать корректирующие меры.", priority: 0 },
        ],
      });
    }
  }

  // Store insights (clear old unresolved, add new)
  await prisma.aIInsight.deleteMany({ where: { scenarioId, resolved: false } });

  let created = 0;
  for (const draft of drafts) {
    await prisma.aIInsight.create({
      data: {
        scenarioId,
        category: draft.category,
        severity: draft.severity,
        title: draft.title,
        description: draft.description,
        metricKey: draft.metricKey || null,
        currentValue: draft.currentValue ?? null,
        benchmarkValue: draft.benchmarkValue ?? null,
        recommendations: {
          create: draft.recommendations,
        },
      },
    });
    created++;
  }

  return { created, insights: drafts };
}

// --- Helpers ---

function mapComponentToCategory(key: string): InsightCategory {
  const map: Record<string, InsightCategory> = {
    structure: "STRUCTURE",
    financial: "FINANCIAL",
    process: "PROCESS",
    competency: "COMPETENCY",
    strategy: "STRATEGY",
    operations: "OPERATIONS",
    customer: "CUSTOMER",
  };
  return map[key] || "STRUCTURE";
}

function formatMetrics(metrics: Record<string, number | string | null>): string {
  return Object.entries(metrics)
    .filter(([k, v]) => v !== null && k !== "note")
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}

function getRecommendations(key: string, score: number, metrics: Record<string, number | string | null>): InsightDraft["recommendations"] {
  const recs: InsightDraft["recommendations"] = [];

  switch (key) {
    case "structure":
      recs.push({ title: "Оптимизация оргструктуры", description: "Провести анализ spans & layers, выявить возможности для упрощения иерархии.", priority: 0 });
      break;
    case "financial":
      recs.push({ title: "Ревью затрат", description: "Проанализировать структуру затрат по подразделениям, выявить неэффективные расходы.", priority: 0 });
      break;
    case "process":
      recs.push({ title: "Повышение процессной зрелости", description: "Назначить владельцев процессов, внедрить RACI для ключевых процессов.", priority: 0 });
      break;
    case "competency":
      recs.push({ title: "Программа развития компетенций", description: "Составить план обучения для закрытия ключевых skill gap.", priority: 0 });
      break;
    case "strategy":
      recs.push({ title: "Каскадирование целей", description: "Обеспечить декомпозицию стратегических целей до уровня подразделений с чёткими KPI.", priority: 0 });
      break;
    case "operations":
      recs.push({ title: "Повышение утилизации", description: "Оптимизировать загрузку ПП через pipeline management и resource planning.", priority: 0 });
      break;
    case "customer":
      recs.push({ title: "Диверсификация клиентского портфеля", description: "Снизить зависимость от top-клиентов через привлечение новых заказчиков.", priority: 0 });
      break;
  }

  return recs;
}
