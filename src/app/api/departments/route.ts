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

  // Compute metrics for each department
  const deptsWithMetrics = await Promise.all(
    departments.map(async (dept) => {
      const metrics = await prisma.employee.groupBy({
        by: ["category"],
        where: { departmentId: dept.id },
        _count: true,
        _sum: { fte: true },
      });

      const pp = metrics.find((m) => m.category === "PP")?._count ?? 0;
      const opp = metrics.find((m) => m.category === "OPP")?._count ?? 0;
      const aup = metrics.find((m) => m.category === "AUP")?._count ?? 0;
      const totalFte = metrics.reduce(
        (sum, m) => sum + (Number(m._sum.fte) || 0),
        0
      );

      return {
        ...dept,
        metrics: { pp, opp, aup, totalFte },
      };
    })
  );

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
