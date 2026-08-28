import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEmployeeSchema } from "@/lib/validations/employee";
import { logAction } from "@/lib/action-logger";
import { DEFAULT_LEVEL_NAMES, HIERARCHY_SKIP_LEVELS } from "@/types";

/** Remove user-overridden hierarchy_* column names so defaults take effect */
function stripHierarchyOverrides(
  names: Record<string, string> | null
): Record<string, string> | null {
  if (!names) return null;
  const cleaned = Object.fromEntries(
    Object.entries(names).filter(([key]) => !key.startsWith("hierarchy_"))
  );
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

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

  // Fetch all departments upfront (needed for hierarchy filtering and path computation)
  const allDepartments = await prisma.department.findMany({
    where: { scenarioId },
    select: { id: true, name: true, parentId: true, cfo: true },
  });

  const deptMapFull = new Map(allDepartments.map((d) => [d.id, d]));

  // Build hierarchy path for a department (flat names)
  function buildDeptPath(depId: string): string[] {
    const path: string[] = [];
    let current = deptMapFull.get(depId);
    while (current) {
      path.unshift(current.name);
      current = current.parentId ? deptMapFull.get(current.parentId) : undefined;
    }
    return path.slice(HIERARCHY_SKIP_LEVELS);
  }

  // Hierarchy column filters (hierarchy_0=Блок, hierarchy_1=Управление, etc.)
  const hierarchyFilters: Record<number, string> = {};
  for (let i = 0; i < 4; i++) {
    const val = req.nextUrl.searchParams.get(`hierarchy_${i}`);
    if (val) hierarchyFilters[i] = val;
  }
  const cfoFilter = req.nextUrl.searchParams.get("cfo");

  // Compute allowed department IDs based on hierarchy + cfo filters
  let filteredDeptIds: Set<string> | null = null;
  if (Object.keys(hierarchyFilters).length > 0 || cfoFilter) {
    filteredDeptIds = new Set<string>();
    for (const dept of allDepartments) {
      if (cfoFilter && dept.cfo !== cfoFilter) continue;
      const path = buildDeptPath(dept.id);
      let match = true;
      for (const [level, name] of Object.entries(hierarchyFilters)) {
        if (path[Number(level)] !== name) {
          match = false;
          break;
        }
      }
      if (match) filteredDeptIds.add(dept.id);
    }
  }

  // Recursive department filter: include department + all descendants
  const rootDeptId = req.nextUrl.searchParams.get("rootDepartmentId");
  if (rootDeptId) {
    const descendantIds = new Set<string>([rootDeptId]);
    let frontier = [rootDeptId];
    while (frontier.length > 0) {
      const nextFrontier: string[] = [];
      for (const dept of allDepartments) {
        if (dept.parentId && frontier.includes(dept.parentId) && !descendantIds.has(dept.id)) {
          descendantIds.add(dept.id);
          nextFrontier.push(dept.id);
        }
      }
      frontier = nextFrontier;
    }
    filteredDeptIds = filteredDeptIds
      ? new Set([...filteredDeptIds].filter((id) => descendantIds.has(id)))
      : descendantIds;
  }

  const where: Record<string, unknown> = { scenarioId };
  if (departmentId) where.departmentId = departmentId;
  if (filteredDeptIds) where.departmentId = { in: [...filteredDeptIds] };
  if (category) where.category = category;
  if (search) {
    where.fullName = { contains: search, mode: "insensitive" };
  }

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        department: { select: { id: true, name: true, cfo: true } },
        tariff: { select: { id: true, name: true, rate: true } },
        _count: { select: { contracts: true } },
      },
      orderBy: { fullName: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.employee.count({ where }),
  ]);

  function buildHierarchyPath(
    depId: string
  ): Array<{ id: string; name: string; depth: number }> {
    const path: Array<{ id: string; name: string }> = [];
    let current = deptMapFull.get(depId);
    while (current) {
      path.unshift({ id: current.id, name: current.name });
      current = current.parentId ? deptMapFull.get(current.parentId) : undefined;
    }
    return path.slice(HIERARCHY_SKIP_LEVELS).map((item, index) => ({ ...item, depth: index }));
  }

  const enrichedEmployees = employees.map((emp) => ({
    ...emp,
    hierarchyPath: buildHierarchyPath(emp.departmentId),
  }));

  // Compute maxDepth from ALL departments in the scenario (not just current page)
  // so that hierarchy columns stay consistent across pages and renames
  const allPaths = allDepartments.map((d) => {
    const path: string[] = [];
    let cur = deptMapFull.get(d.id);
    while (cur) {
      path.unshift(cur.id);
      cur = cur.parentId ? deptMapFull.get(cur.parentId) : undefined;
    }
    return Math.max(0, path.length - HIERARCHY_SKIP_LEVELS);
  });
  const maxDepth = allPaths.reduce((max, len) => Math.max(max, len), 0);

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
    columnNames: stripHierarchyOverrides(
      (scenario?.columnNames as Record<string, string>) ?? null
    ),
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
      costRate: parsed.data.costRate,
      tariffId: parsed.data.tariffId,
    },
    include: {
      department: { select: { id: true, name: true } },
      tariff: { select: { id: true, name: true, rate: true } },
    },
  });

  // Log action for undo
  await logAction(
    employee.scenarioId,
    "create_employee",
    {
      employee: {
        id: employee.id,
        scenarioId: employee.scenarioId,
        departmentId: employee.departmentId,
        fullName: employee.fullName,
        position: employee.position,
        category: employee.category,
        fte: employee.fte.toString(),
        originId: employee.originId,
      },
    },
    { employeeId: employee.id }
  );

  return NextResponse.json(employee, { status: 201 });
}
