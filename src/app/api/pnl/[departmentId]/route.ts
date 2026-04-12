import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  calculatePnl,
  type PnlMode,
  type PnlAllocationMode,
} from "@/lib/pnl-calculator";

const ALLOCATION_MODES: PnlAllocationMode[] = ["earning", "fte", "transfer"];

/**
 * GET /api/pnl/[departmentId]?scenarioId=...&mode=...&periodStart=...&periodEnd=...&allocationMode=...
 * Returns drill-down details for a specific department (calculated on-the-fly).
 * allocationMode is optional; defaults to "earning".
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  const { departmentId } = await params;
  const { searchParams } = new URL(req.url);
  const scenarioId = searchParams.get("scenarioId");
  const mode = searchParams.get("mode") as PnlMode | null;
  const periodStart = searchParams.get("periodStart");
  const periodEnd = searchParams.get("periodEnd");
  const allocationModeRaw = searchParams.get("allocationMode");
  const allocationMode: PnlAllocationMode =
    allocationModeRaw && (ALLOCATION_MODES as string[]).includes(allocationModeRaw)
      ? (allocationModeRaw as PnlAllocationMode)
      : "earning";

  if (!scenarioId || !mode || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "Missing required params" },
      { status: 400 }
    );
  }

  if (allocationModeRaw && !(ALLOCATION_MODES as string[]).includes(allocationModeRaw)) {
    return NextResponse.json(
      { error: "allocationMode must be earning, fte, or transfer" },
      { status: 400 }
    );
  }

  try {
    const results = await calculatePnl(
      scenarioId,
      mode,
      new Date(periodStart),
      new Date(periodEnd),
      allocationMode
    );

    const result = results.find((r) => r.departmentId === departmentId);

    if (!result) {
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
        select: { name: true, shetilType: true },
      });

      return NextResponse.json({
        departmentId,
        departmentName: department?.name ?? "Unknown",
        shetilType: department?.shetilType ?? "BACKOFFICE",
        revenue: 0,
        cost: 0,
        pnl: 0,
        details: {
          employees: [],
          contracts: [],
          childrenPnl: 0,
          totalPnl: 0,
        },
        warnings: null,
        calculatedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      departmentId,
      departmentName: result.departmentName,
      shetilType: result.shetilType,
      revenue: result.revenue,
      cost: result.cost,
      pnl: result.pnl,
      details: {
        employees: result.employeeDetails,
        contracts: result.contractDetails,
        childrenPnl: result.childrenPnl,
        totalPnl: result.totalPnl,
      },
      warnings: result.warnings.length > 0 ? result.warnings : null,
      calculatedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[PnlDrillDown] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
