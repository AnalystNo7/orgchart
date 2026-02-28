import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEmployeeSchema } from "@/lib/validations/employee";
import { DEFAULT_LEVEL_NAMES, HIERARCHY_SKIP_LEVELS } from "@/types";

export async function GET(req: NextRequest) {
  const scenarioId = req.nextUrl.searchParams.get("scenarioId");
  const departmentId = req.nextUrl.searchParams.get("departmentId");
  const category = req.nextUrl.searchParams.get("category");
  const search = req.nextUrl.searchParams.get("search");
  const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20");

  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
  }

  const where: Record<string, unknown> = { scenarioId };
  if (departmentId) where.departmentId = departmentId;
  if (category) where.category = category;
  if (search) {
    where.fullName = { contains: search, mode: "insensitive" };
  }

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        department: { select: { id: true, name: true, cfo: true } },
      },
      orderBy: { fullName: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.employee.count({ where }),
  ]);

  // Fetch all departments for hierarchy path computation
  const allDepartments = await prisma.department.findMany({
    where: { scenarioId },
    select: { id: true, name: true, parentId: true },
  });

  const deptMap = new Map(allDepartments.map((d) => [d.id, d]));

  function buildHierarchyPath(
    depId: string
  ): Array<{ id: string; name: string; depth: number }> {
    const path: Array<{ id: string; name: string }> = [];
    let current = deptMap.get(depId);
    while (current) {
      path.unshift({ id: current.id, name: current.name });
      current = current.parentId ? deptMap.get(current.parentId) : undefined;
    }
    return path
      .map((item, index) => ({ ...item, depth: index }))
      .slice(HIERARCHY_SKIP_LEVELS)
      .map((item, index) => ({ ...item, depth: index }));
  }

  const enrichedEmployees = employees.map((emp) => ({
    ...emp,
    hierarchyPath: buildHierarchyPath(emp.departmentId),
  }));

  const maxDepth = enrichedEmployees.reduce(
    (max, emp) => Math.max(max, emp.hierarchyPath.length),
    0
  );

  const levelNames = DEFAULT_LEVEL_NAMES.slice(0, maxDepth);

  // Fetch scenario column names
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    select: { columnNames: true },
  });

  // Category totals for footer
  const categoryTotals = await prisma.employee.groupBy({
    by: ["category"],
    where: { scenarioId },
    _count: true,
  });

  return NextResponse.json({
    data: enrichedEmployees,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    maxDepth,
    levelNames,
    columnNames: (scenario?.columnNames as Record<string, string>) ?? null,
    categoryTotals: {
      pp: categoryTotals.find((c) => c.category === "PP")?._count ?? 0,
      opp: categoryTotals.find((c) => c.category === "OPP")?._count ?? 0,
      aup: categoryTotals.find((c) => c.category === "AUP")?._count ?? 0,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createEmployeeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const employee = await prisma.employee.create({
    data: {
      scenarioId: parsed.data.scenarioId,
      departmentId: parsed.data.departmentId,
      fullName: parsed.data.fullName,
      position: parsed.data.position,
      category: parsed.data.category,
      fte: parsed.data.fte ?? 1.0,
    },
    include: {
      department: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(employee, { status: 201 });
}
