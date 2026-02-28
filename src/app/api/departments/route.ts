import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createDepartmentSchema } from "@/lib/validations/department";

export async function GET(req: NextRequest) {
  const scenarioId = req.nextUrl.searchParams.get("scenarioId");

  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
  }

  const departments = await prisma.department.findMany({
    where: { scenarioId },
    include: {
      head: { select: { id: true, fullName: true } },
      _count: { select: { employees: true, children: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  // Single batch query for all department metrics instead of N+1
  const allMetrics = await prisma.employee.groupBy({
    by: ["departmentId", "category"],
    where: { scenarioId },
    _count: true,
    _sum: { fte: true },
  });

  // Build per-department metrics map
  const metricsMap = new Map<
    string,
    { pp: number; opp: number; aup: number; totalFte: number }
  >();
  departments.forEach((d) => {
    metricsMap.set(d.id, { pp: 0, opp: 0, aup: 0, totalFte: 0 });
  });
  allMetrics.forEach((m) => {
    const existing = metricsMap.get(m.departmentId);
    if (!existing) return;
    const fte = Number(m._sum.fte) || 0;
    if (m.category === "PP") existing.pp = m._count;
    else if (m.category === "OPP") existing.opp = m._count;
    else if (m.category === "AUP") existing.aup = m._count;
    existing.totalFte += fte;
  });

  const deptsWithMetrics = departments.map((dept) => ({
    ...dept,
    metrics: metricsMap.get(dept.id) ?? { pp: 0, opp: 0, aup: 0, totalFte: 0 },
  }));

  return NextResponse.json(deptsWithMetrics);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createDepartmentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const department = await prisma.department.create({
    data: {
      scenarioId: parsed.data.scenarioId,
      parentId: parsed.data.parentId ?? null,
      name: parsed.data.name,
      cfo: parsed.data.cfo ?? null,
      shetilType: parsed.data.shetilType,
      headId: parsed.data.headId ?? null,
      sortOrder: parsed.data.sortOrder ?? 0,
    },
    include: {
      head: { select: { id: true, fullName: true } },
      _count: { select: { employees: true, children: true } },
    },
  });

  return NextResponse.json(department, { status: 201 });
}
