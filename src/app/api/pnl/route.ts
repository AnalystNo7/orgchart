import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateAndCachePnl, type PnlMode } from "@/lib/pnl-calculator";

/**
 * GET /api/pnl?scenarioId=...&mode=...&periodStart=...&periodEnd=...
 * Returns cached P&L data. If no cache, returns empty with calculatedAt=null.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scenarioId = searchParams.get("scenarioId");
  const mode = searchParams.get("mode") as PnlMode | null;
  const periodStart = searchParams.get("periodStart");
  const periodEnd = searchParams.get("periodEnd");

  if (!scenarioId || !mode || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "Missing required params: scenarioId, mode, periodStart, periodEnd" },
      { status: 400 }
    );
  }

  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  const cached = await prisma.pnlCache.findMany({
    where: { scenarioId, mode, periodStart: start, periodEnd: end },
  });

  if (cached.length === 0) {
    return NextResponse.json({ data: [], calculatedAt: null });
  }

  const calculatedAt = cached[0].calculatedAt;

  const data = cached.map((c) => ({
    departmentId: c.departmentId,
    mode: c.mode,
    revenue: Number(c.revenue),
    cost: Number(c.cost),
    pnl: Number(c.pnl),
    details: c.details,
    warnings: c.warnings,
  }));

  return NextResponse.json({ data, calculatedAt });
}

/**
 * POST /api/pnl
 * Trigger P&L recalculation.
 * Body: { scenarioId, mode, periodStart, periodEnd }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { scenarioId, mode, periodStart, periodEnd } = body;

  if (!scenarioId || !mode || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "Missing required fields: scenarioId, mode, periodStart, periodEnd" },
      { status: 400 }
    );
  }

  if (!["forecast", "plan", "combined"].includes(mode)) {
    return NextResponse.json(
      { error: "mode must be forecast, plan, or combined" },
      { status: 400 }
    );
  }

  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  const results = await calculateAndCachePnl(scenarioId, mode, start, end);

  return NextResponse.json({
    data: results.map((r) => ({
      departmentId: r.departmentId,
      departmentName: r.departmentName,
      shetilType: r.shetilType,
      isEarning: r.isEarning,
      revenue: r.revenue,
      cost: r.cost,
      pnl: r.pnl,
      childrenPnl: r.childrenPnl,
      totalPnl: r.totalPnl,
      warningCount: r.warnings.length,
    })),
    calculatedAt: new Date().toISOString(),
  });
}
