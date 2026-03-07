import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/pnl/[departmentId]?scenarioId=...&mode=...&periodStart=...&periodEnd=...
 * Returns drill-down details for a specific department.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  const { departmentId } = await params;
  const { searchParams } = new URL(req.url);
  const scenarioId = searchParams.get("scenarioId");
  const mode = searchParams.get("mode");
  const periodStart = searchParams.get("periodStart");
  const periodEnd = searchParams.get("periodEnd");

  if (!scenarioId || !mode || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "Missing required params" },
      { status: 400 }
    );
  }

  const cached = await prisma.pnlCache.findUnique({
    where: {
      scenarioId_departmentId_mode_periodStart_periodEnd: {
        scenarioId,
        departmentId,
        mode,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
      },
    },
  });

  if (!cached) {
    return NextResponse.json(
      { error: "No cached data. Run calculation first." },
      { status: 404 }
    );
  }

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { name: true, shetilType: true },
  });

  return NextResponse.json({
    departmentId,
    departmentName: department?.name ?? "Unknown",
    shetilType: department?.shetilType ?? "BACKOFFICE",
    revenue: Number(cached.revenue),
    cost: Number(cached.cost),
    pnl: Number(cached.pnl),
    details: cached.details,
    warnings: cached.warnings,
    calculatedAt: cached.calculatedAt,
  });
}
