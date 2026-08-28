import { prisma } from "./db";
import { calculatePnl } from "./pnl-calculator";

// --- Types ---

export interface OhiComponent {
  key: string;
  name: string;
  weight: number;
  score: number | null; // null = no data
  metrics: Record<string, number | string | null>;
}

export interface OhiResult {
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

// --- Scoring helpers ---

/** Linear score: value in [low, high] → 100, outside → drops to 0 */
function scoreInRange(value: number, low: number, high: number, penalty: number = 15): number {
  if (value >= low && value <= high) return 100;
  const dist = value < low ? low - value : value - high;
  return Math.max(0, Math.round(100 - dist * penalty));
}

/** Percentage score: 0-100 maps to 0-100 */
function scorePercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Inverse score: lower is better (e.g. gap size) */
function scoreInverse(value: number, maxBad: number): number {
  return Math.max(0, Math.min(100, Math.round((1 - value / maxBad) * 100)));
}

// --- Main calculator ---

export async function calculateOhi(scenarioId: string): Promise<OhiResult> {
  // Fetch all data in parallel
  const [departments, employees, processes, goals, competencyData, clients, pipelineDeals] = await Promise.all([
    prisma.department.findMany({
      where: { scenarioId },
      include: {
        _count: { select: { employees: true, children: true } },
      },
    }),
    prisma.employee.findMany({
      where: { scenarioId },
      include: {
        contracts: { include: { contract: true } },
        competencies: {
          include: { competency: true },
        },
      },
    }),
    prisma.process.findMany({
      where: { scenarioId },
      include: {
        _count: { select: { participants: true } },
      },
    }),
    prisma.goal.findMany({
      where: { scenarioId },
      include: { kpis: true },
    }),
    prisma.roleCompetency.findMany(),
    prisma.client.findMany({
      include: {
        contracts: { select: { id: true, type: true, amount: true } },
        _count: { select: { contracts: true } },
      },
    }),
    prisma.pipelineDeal.findMany({
      where: { scenarioId },
    }),
  ]);

  const totalEmployees = employees.length;
  const totalFte = employees.reduce((s, e) => s + Number(e.fte), 0);
  const totalDepartments = departments.length;
  const totalProcesses = processes.length;
  const totalGoals = goals.length;

  const components: OhiComponent[] = [];

  // 1. STRUCTURAL EFFICIENCY (15%)
  {
    const managersWithReports = departments.filter(
      (d) => d._count.employees > 0 || d._count.children > 0
    );
    const avgSpan = managersWithReports.length > 0
      ? managersWithReports.reduce((s, d) => s + d._count.employees + d._count.children, 0) / managersWithReports.length
      : 0;

    const aupFte = employees
      .filter((e) => e.category === "AUP")
      .reduce((s, e) => s + Number(e.fte), 0);
    const overheadRatio = totalFte > 0 ? (aupFte / totalFte) * 100 : 0;

    let maxDepth = 0;
    const deptMap = new Map(departments.map((d) => [d.id, d]));
    for (const dept of departments) {
      let depth = 0;
      let current = dept;
      while (current.parentId && deptMap.has(current.parentId)) {
        depth++;
        current = deptMap.get(current.parentId)!;
      }
      maxDepth = Math.max(maxDepth, depth + 1);
    }

    const spanScore = scoreInRange(avgSpan, 5, 8, 10);
    const overheadScore = scoreInRange(overheadRatio, 15, 25, 4);
    const depthScore = scoreInRange(maxDepth, 3, 4, 15);
    const score = Math.round((spanScore + overheadScore + depthScore) / 3);

    components.push({
      key: "structure",
      name: "Структурная эффективность",
      weight: 0.15,
      score,
      metrics: {
        spanOfControl: Math.round(avgSpan * 10) / 10,
        overheadRatio: Math.round(overheadRatio * 10) / 10,
        hierarchyDepth: maxDepth,
      },
    });
  }

  // 2. FINANCIAL HEALTH (20%)
  {
    let score: number | null = null;
    const metrics: Record<string, number | string | null> = {};

    try {
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const yearEnd = new Date(now.getFullYear(), 11, 31);
      const pnlResults = await calculatePnl(scenarioId, "forecast", yearStart, yearEnd);

      const totalRevenue = pnlResults.reduce((s, d) => s + d.revenue, 0);
      const totalCost = pnlResults.reduce((s, d) => s + d.cost, 0);
      const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
      const revenuePerFte = totalFte > 0 ? totalRevenue / totalFte : 0;

      const marginScore = scoreInRange(margin, 10, 40, 3);
      const rftScore = revenuePerFte > 0 ? Math.min(100, Math.round((revenuePerFte / 5000000) * 100)) : 0;

      score = Math.round((marginScore + rftScore) / 2);
      metrics.margin = Math.round(margin * 10) / 10;
      metrics.revenuePerFte = Math.round(revenuePerFte);
      metrics.totalRevenue = Math.round(totalRevenue);
      metrics.totalCost = Math.round(totalCost);
    } catch {
      score = null;
    }

    components.push({
      key: "financial",
      name: "Финансовое здоровье",
      weight: 0.20,
      score,
      metrics,
    });
  }

  // 3. PROCESS MATURITY (15%)
  {
    let score: number | null = null;
    const metrics: Record<string, number | string | null> = {};

    if (totalProcesses > 0) {
      const withOwner = processes.filter((p) => p.ownerDeptId).length;
      const withRaci = processes.filter((p) => p._count.participants > 0).length;

      const ownerPct = (withOwner / totalProcesses) * 100;
      const raciPct = (withRaci / totalProcesses) * 100;

      score = Math.round((scorePercent(ownerPct) + scorePercent(raciPct)) / 2);
      metrics.totalProcesses = totalProcesses;
      metrics.withOwner = withOwner;
      metrics.withRaci = withRaci;
      metrics.ownerPct = Math.round(ownerPct);
      metrics.raciPct = Math.round(raciPct);
    }

    components.push({
      key: "process",
      name: "Процессная зрелость",
      weight: 0.15,
      score,
      metrics,
    });
  }

  // 4. COMPETENCY READINESS (15%)
  {
    let score: number | null = null;
    const metrics: Record<string, number | string | null> = {};

    const roleReqs = new Map<string, number>(); // "position|competencyId" → requiredLevel
    for (const rc of competencyData) {
      roleReqs.set(`${rc.position}|${rc.competencyId}`, rc.requiredLevel);
    }

    if (roleReqs.size > 0) {
      let totalAssessments = 0;
      let totalGaps = 0;
      let gapSum = 0;

      for (const emp of employees) {
        for (const ec of emp.competencies) {
          const key = `${emp.position}|${ec.competencyId}`;
          const required = roleReqs.get(key);
          if (required !== undefined) {
            totalAssessments++;
            const gap = required - ec.currentLevel;
            if (gap > 0) {
              totalGaps++;
              gapSum += gap;
            }
          }
        }
      }

      if (totalAssessments > 0) {
        const noGapPct = ((totalAssessments - totalGaps) / totalAssessments) * 100;
        const avgGap = totalGaps > 0 ? gapSum / totalGaps : 0;
        const gapScore = scoreInverse(avgGap, 3);

        score = Math.round((scorePercent(noGapPct) + gapScore) / 2);
        metrics.assessments = totalAssessments;
        metrics.gaps = totalGaps;
        metrics.noGapPct = Math.round(noGapPct);
        metrics.avgGap = Math.round(avgGap * 10) / 10;
      }
    }

    components.push({
      key: "competency",
      name: "Компетентностная готовность",
      weight: 0.15,
      score,
      metrics,
    });
  }

  // 5. STRATEGIC ALIGNMENT (15%)
  {
    let score: number | null = null;
    const metrics: Record<string, number | string | null> = {};

    if (totalGoals > 0) {
      const avgProgress = goals.reduce((s, g) => s + g.progress, 0) / totalGoals;
      const atRisk = goals.filter((g) => g.status === "AT_RISK" || g.status === "FAILED").length;
      const healthyPct = ((totalGoals - atRisk) / totalGoals) * 100;

      score = Math.round((scorePercent(avgProgress) + scorePercent(healthyPct)) / 2);
      metrics.totalGoals = totalGoals;
      metrics.avgProgress = Math.round(avgProgress);
      metrics.atRisk = atRisk;
      metrics.healthyPct = Math.round(healthyPct);
    }

    components.push({
      key: "strategy",
      name: "Стратегическое выравнивание",
      weight: 0.15,
      score,
      metrics,
    });
  }

  // 6. OPERATIONAL LOAD (10%)
  {
    let score: number | null = null;
    const metrics: Record<string, number | string | null> = {};

    const ppEmployees = employees.filter((e) => e.category === "PP");
    if (ppEmployees.length > 0) {
      const ppWithContracts = ppEmployees.filter((e) => e.contracts.length > 0).length;
      const utilizationPct = (ppWithContracts / ppEmployees.length) * 100;

      score = scorePercent(utilizationPct);
      metrics.ppTotal = ppEmployees.length;
      metrics.ppWithContracts = ppWithContracts;
      metrics.utilizationPct = Math.round(utilizationPct);
    }

    components.push({
      key: "operations",
      name: "Операционная нагрузка",
      weight: 0.10,
      score,
      metrics,
    });
  }

  // 7. CUSTOMER RESILIENCE (10%)
  {
    let score: number | null = null;
    const metrics: Record<string, number | string | null> = {};

    if (clients.length > 0) {
      // Revenue concentration: % from top-3 clients
      const clientRevenues = clients.map((c) => ({
        name: c.name,
        revenue: c.contracts
          .filter((ct) => ct.type === "REVENUE")
          .reduce((s, ct) => s + Number(ct.amount || 0), 0),
      })).sort((a, b) => b.revenue - a.revenue);

      const totalClientRevenue = clientRevenues.reduce((s, c) => s + c.revenue, 0);
      const top3Revenue = clientRevenues.slice(0, 3).reduce((s, c) => s + c.revenue, 0);
      const concentrationPct = totalClientRevenue > 0 ? (top3Revenue / totalClientRevenue) * 100 : 0;

      // Concentration score: <40% top-3 = 100, >80% = 0
      const concentrationScore = scoreInRange(100 - concentrationPct, 20, 60, 2);

      // Diversification: more active clients = better
      const activeClients = clients.filter((c) => c.status === "ACTIVE").length;
      const diversificationScore = Math.min(100, activeClients * 15); // 7+ clients = 100

      // Pipeline health
      const activeDeals = pipelineDeals.filter((d) => d.stage !== "LOST" && d.stage !== "WON");
      const advancedDeals = activeDeals.filter((d) => d.stage === "PROPOSAL" || d.stage === "NEGOTIATION");
      const pipelineScore = activeDeals.length > 0
        ? scorePercent((advancedDeals.length / activeDeals.length) * 100)
        : 0;

      score = Math.round((concentrationScore + diversificationScore + pipelineScore) / 3);
      metrics.totalClients = clients.length;
      metrics.activeClients = activeClients;
      metrics.concentrationTop3 = Math.round(concentrationPct);
      metrics.pipelineDeals = activeDeals.length;
    }

    components.push({
      key: "customer",
      name: "Клиентская устойчивость",
      weight: 0.10,
      score,
      metrics: clients.length > 0 ? metrics : { note: "Нет клиентов" },
    });
  }

  // Calculate overall score (proportionally redistribute weights for available components)
  const available = components.filter((c) => c.score !== null);
  const totalWeight = available.reduce((s, c) => s + c.weight, 0);
  const overallScore = totalWeight > 0
    ? Math.round(available.reduce((s, c) => s + (c.score! * c.weight) / totalWeight, 0))
    : 0;

  return {
    overallScore,
    components,
    summary: {
      employees: totalEmployees,
      departments: totalDepartments,
      processes: totalProcesses,
      goals: totalGoals,
      totalFte: Math.round(totalFte * 10) / 10,
    },
  };
}
