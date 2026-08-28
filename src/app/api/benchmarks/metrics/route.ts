import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculatePnl } from "@/lib/pnl-calculator";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenarioId");

  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId required" }, { status: 400 });
  }

  const departments = await prisma.department.findMany({
    where: { scenarioId },
    include: {
      _count: { select: { employees: true, children: true } },
    },
  });

  const employees = await prisma.employee.findMany({
    where: { scenarioId },
    select: { category: true, fte: true, departmentId: true },
  });

  const totalFte = employees.reduce((s, e) => s + Number(e.fte), 0);
  const ppFte = employees.filter((e) => e.category === "PP").reduce((s, e) => s + Number(e.fte), 0);
  const aupFte = employees.filter((e) => e.category === "AUP").reduce((s, e) => s + Number(e.fte), 0);

  // Span of control
  const depsWithSubs = departments.filter((d) => d._count.children > 0 || d._count.employees > 0);
  const spans = depsWithSubs.map((d) => d._count.employees + d._count.children);
  const avgSpan = spans.length > 0
    ? Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10
    : 0;

  // Hierarchy depth
  const parentMap = new Map(departments.map((d) => [d.id, d.parentId]));
  function getDepth(id: string): number {
    const parentId = parentMap.get(id);
    if (!parentId) return 0;
    return 1 + getDepth(parentId);
  }
  const maxDepth = departments.length > 0 ? Math.max(...departments.map((d) => getDepth(d.id))) : 0;

  // Revenue dept share
  const revenueDeptIds = new Set(departments.filter((d) => d.shetilType === "REVENUE").map((d) => d.id));
  const revenueFte = employees
    .filter((e) => revenueDeptIds.has(e.departmentId))
    .reduce((s, e) => s + Number(e.fte), 0);
  const revenueDeptShare = totalFte > 0 ? Math.round((revenueFte / totalFte) * 100 * 10) / 10 : 0;

  // P&L (try, may fail if no contracts)
  let revenuePerFte: number | null = null;
  let grossMargin: number | null = null;
  try {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), 0, 1);
    const periodEnd = new Date(now.getFullYear(), 11, 31);
    const pnlResults = await calculatePnl(scenarioId, "combined", periodStart, periodEnd);
    const totalRevenue = pnlResults.reduce((s, r) => s + r.revenue, 0);
    const totalCost = pnlResults.reduce((s, r) => s + r.cost, 0);
    if (totalRevenue > 0 && totalFte > 0) {
      revenuePerFte = Math.round(totalRevenue / totalFte);
      grossMargin = Math.round(((totalRevenue - totalCost) / totalRevenue) * 100 * 10) / 10;
    }
  } catch {
    // P&L not available
  }

  return NextResponse.json({
    metrics: {
      span_of_control: avgSpan,
      overhead_ratio: totalFte > 0 ? Math.round((aupFte / totalFte) * 100 * 10) / 10 : null,
      hierarchy_depth: maxDepth,
      revenue_dept_share: revenueDeptShare,
      revenue_per_fte: revenuePerFte,
      gross_margin: grossMargin,
    },
  });
}
