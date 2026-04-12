import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculatePnl, type PnlAllocationMode } from "@/lib/pnl-calculator";

const ALLOCATION_MODES: PnlAllocationMode[] = ["earning", "fte", "transfer"];

// GET — extended financial analytics for a scenario
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenarioId");
  const allocationModeRaw = searchParams.get("allocationMode");
  const allocationMode: PnlAllocationMode =
    allocationModeRaw && (ALLOCATION_MODES as string[]).includes(allocationModeRaw)
      ? (allocationModeRaw as PnlAllocationMode)
      : "earning";

  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId required" }, { status: 400 });
  }

  if (allocationModeRaw && !(ALLOCATION_MODES as string[]).includes(allocationModeRaw)) {
    return NextResponse.json(
      { error: "allocationMode must be earning, fte, or transfer" },
      { status: 400 }
    );
  }

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31);

  // P&L data
  const pnlResults = await calculatePnl(scenarioId, "combined", yearStart, yearEnd, allocationMode);

  // Employee data for utilization
  const employees = await prisma.employee.findMany({
    where: { scenarioId },
    include: { contracts: true },
  });

  // Budget data
  const budgets = await prisma.budget.findMany({
    where: { scenarioId },
    include: { lines: true },
  });

  // Calculations
  const totalRevenue = pnlResults.reduce((s, d) => s + d.revenue, 0);
  const totalCost = pnlResults.reduce((s, d) => s + d.cost, 0);
  const totalPnl = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (totalPnl / totalRevenue) * 100 : 0;

  const totalFte = employees.reduce((s, e) => s + Number(e.fte), 0);
  const revenuePerFte = totalFte > 0 ? totalRevenue / totalFte : 0;
  const costPerFte = totalFte > 0 ? totalCost / totalFte : 0;

  // Utilization: PP employees with contracts / total PP
  const ppEmployees = employees.filter((e) => e.category === "PP");
  const ppWithContracts = ppEmployees.filter((e) => e.contracts.length > 0);
  const utilization = ppEmployees.length > 0 ? (ppWithContracts.length / ppEmployees.length) * 100 : 0;

  // Budget totals
  const totalBudgetPlanned = budgets.reduce((s, b) => s + b.lines.reduce((ss, l) => ss + l.plannedAmount, 0), 0);
  const totalBudgetActual = budgets.reduce((s, b) => s + b.lines.reduce((ss, l) => ss + l.actualAmount, 0), 0);

  // Department breakdown
  const departmentMetrics = pnlResults.map((d) => ({
    departmentId: d.departmentId,
    departmentName: d.departmentName,
    shetilType: d.shetilType,
    revenue: Math.round(d.revenue),
    cost: Math.round(d.cost),
    pnl: Math.round(d.pnl),
    totalPnl: Math.round(d.totalPnl),
    margin: d.revenue > 0 ? Math.round(((d.revenue - d.cost) / d.revenue) * 100) : 0,
    employeeCount: d.employeeDetails.length,
    warnings: d.warnings.length,
  }));

  return NextResponse.json({
    period: { start: yearStart.toISOString(), end: yearEnd.toISOString() },
    allocationMode,
    summary: {
      totalRevenue: Math.round(totalRevenue),
      totalCost: Math.round(totalCost),
      totalPnl: Math.round(totalPnl),
      margin: Math.round(margin * 10) / 10,
      revenuePerFte: Math.round(revenuePerFte),
      costPerFte: Math.round(costPerFte),
      totalFte: Math.round(totalFte * 10) / 10,
      utilization: Math.round(utilization),
      ppTotal: ppEmployees.length,
      ppUtilized: ppWithContracts.length,
    },
    budget: {
      totalPlanned: Math.round(totalBudgetPlanned),
      totalActual: Math.round(totalBudgetActual),
      variance: Math.round(totalBudgetPlanned - totalBudgetActual),
      budgetCount: budgets.length,
    },
    departments: departmentMetrics,
  });
}
