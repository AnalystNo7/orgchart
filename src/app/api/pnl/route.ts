import { NextRequest, NextResponse } from "next/server";
import { calculatePnl, type PnlMode } from "@/lib/pnl-calculator";

/**
 * GET /api/pnl?scenarioId=...&mode=...&periodStart=...&periodEnd=...
 * Calculates P&L on-the-fly (no cache dependency).
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

  try {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const results = await calculatePnl(scenarioId, mode, start, end);

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
  } catch (e) {
    console.error("[GET /api/pnl] Error:", e);
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    );
  }
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

  try {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    const results = await calculatePnl(scenarioId, mode, start, end);

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
  } catch (e) {
    console.error("[POST /api/pnl] Error:", e);
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    );
  }
}
