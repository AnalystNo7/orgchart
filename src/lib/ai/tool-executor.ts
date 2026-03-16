import { prisma } from "@/lib/db";
import { computeDiff } from "@/lib/diff";
import { calculatePnl, type PnlMode } from "@/lib/pnl-calculator";
import type { ShetilType, GapCategory, GapPriority } from "@prisma/client";

type ToolInput = Record<string, unknown>;

export async function executeTool(
  name: string,
  input: ToolInput,
  currentScenarioId: string
): Promise<string> {
  try {
    switch (name) {
      case "get_org_structure":
        return await getOrgStructure(
          (input.scenarioId as string) || currentScenarioId
        );
      case "get_department_details":
        return await getDepartmentDetails(input.departmentId as string);
      case "get_org_metrics":
        return await getOrgMetrics(
          (input.scenarioId as string) || currentScenarioId
        );
      case "compare_scenarios":
        return await compareScenarios(
          input.leftScenarioId as string,
          input.rightScenarioId as string
        );
      case "clone_scenario":
        return await cloneScenario(
          (input.scenarioId as string) || currentScenarioId,
          input.newName as string
        );
      case "create_department":
        return await createDepartment(
          (input.scenarioId as string) || currentScenarioId,
          input.name as string,
          input.parentId as string | undefined,
          input.shetilType as ShetilType
        );
      case "move_department":
        return await moveDepartment(
          input.departmentId as string,
          input.newParentId as string | null
        );
      case "rename_department":
        return await renameDepartment(
          input.departmentId as string,
          input.newName as string
        );
      case "delete_department":
        return await deleteDepartment(input.departmentId as string);
      case "move_employees":
        return await moveEmployees(
          input.employeeIds as string[],
          input.targetDepartmentId as string
        );
      case "create_gap_passport":
        return await createGapPassport(input, currentScenarioId);
      case "calculate_pnl":
        return await calculatePnlTool(
          (input.scenarioId as string) || currentScenarioId,
          input.mode as PnlMode | undefined,
          input.periodStart as string | undefined,
          input.periodEnd as string | undefined
        );
      case "list_scenarios":
        return await listScenarios();
      default:
        return JSON.stringify({ error: `Неизвестный инструмент: ${name}` });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

async function getOrgStructure(scenarioId: string): Promise<string> {
  const departments = await prisma.department.findMany({
    where: { scenarioId },
    include: {
      head: { select: { id: true, fullName: true } },
      _count: { select: { employees: true, children: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  // Calculate metrics per department
  const employees = await prisma.employee.findMany({
    where: { scenarioId },
    select: { departmentId: true, category: true, fte: true },
  });

  const metricsMap = new Map<
    string,
    { pp: number; opp: number; aup: number; totalFte: number }
  >();
  for (const emp of employees) {
    const m = metricsMap.get(emp.departmentId) || {
      pp: 0,
      opp: 0,
      aup: 0,
      totalFte: 0,
    };
    const fte = Number(emp.fte);
    m.totalFte += fte;
    if (emp.category === "PP") m.pp += fte;
    else if (emp.category === "OPP") m.opp += fte;
    else if (emp.category === "AUP") m.aup += fte;
    metricsMap.set(emp.departmentId, m);
  }

  const result = departments.map((d) => ({
    id: d.id,
    name: d.name,
    parentId: d.parentId,
    shetilType: d.shetilType,
    head: d.head?.fullName || null,
    employeeCount: d._count.employees,
    childrenCount: d._count.children,
    metrics: metricsMap.get(d.id) || { pp: 0, opp: 0, aup: 0, totalFte: 0 },
  }));

  return JSON.stringify(result, null, 2);
}

async function getDepartmentDetails(departmentId: string): Promise<string> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    include: {
      head: { select: { id: true, fullName: true, position: true } },
      employees: {
        select: {
          id: true,
          fullName: true,
          position: true,
          category: true,
          fte: true,
        },
      },
      children: {
        select: { id: true, name: true, shetilType: true },
      },
    },
  });

  if (!dept) return JSON.stringify({ error: "Подразделение не найдено" });
  return JSON.stringify(dept, null, 2);
}

async function getOrgMetrics(scenarioId: string): Promise<string> {
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

  const totalEmployees = employees.length;
  const totalFte = employees.reduce((s, e) => s + Number(e.fte), 0);
  const ppFte = employees
    .filter((e) => e.category === "PP")
    .reduce((s, e) => s + Number(e.fte), 0);
  const oppFte = employees
    .filter((e) => e.category === "OPP")
    .reduce((s, e) => s + Number(e.fte), 0);
  const aupFte = employees
    .filter((e) => e.category === "AUP")
    .reduce((s, e) => s + Number(e.fte), 0);

  // Span of control: departments with children or employees
  const depsWithSubs = departments.filter(
    (d) => d._count.children > 0 || d._count.employees > 0
  );
  const spans = depsWithSubs.map((d) => d._count.employees + d._count.children);
  const avgSpan =
    spans.length > 0
      ? Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10
      : 0;

  // Hierarchy depth
  const parentMap = new Map(departments.map((d) => [d.id, d.parentId]));
  function getDepth(id: string): number {
    const parentId = parentMap.get(id);
    if (!parentId) return 0;
    return 1 + getDepth(parentId);
  }
  const maxDepth = Math.max(...departments.map((d) => getDepth(d.id)), 0);

  // Departments by type
  const byType: Record<string, number> = {};
  for (const d of departments) {
    byType[d.shetilType] = (byType[d.shetilType] || 0) + 1;
  }

  return JSON.stringify(
    {
      totalDepartments: departments.length,
      totalEmployees,
      totalFte: Math.round(totalFte * 10) / 10,
      fteByCategory: {
        PP: Math.round(ppFte * 10) / 10,
        OPP: Math.round(oppFte * 10) / 10,
        AUP: Math.round(aupFte * 10) / 10,
      },
      overheadRatio:
        totalFte > 0
          ? `${Math.round((aupFte / totalFte) * 100)}%`
          : "N/A",
      avgSpanOfControl: avgSpan,
      maxHierarchyDepth: maxDepth,
      departmentsByType: byType,
      benchmarks: {
        spanOfControl: "5-8 (норма для ИТ)",
        overheadRatio: "15-25% (норма для ИТ)",
        hierarchyDepth: "3-4 уровня (для до 2000 чел.)",
      },
    },
    null,
    2
  );
}

async function compareScenarios(
  leftId: string,
  rightId: string
): Promise<string> {
  const [leftDepts, rightDepts] = await Promise.all([
    prisma.department.findMany({
      where: { scenarioId: leftId },
      include: {
        head: { select: { fullName: true } },
        _count: { select: { employees: true, children: true } },
      },
    }),
    prisma.department.findMany({
      where: { scenarioId: rightId },
      include: {
        head: { select: { fullName: true } },
        _count: { select: { employees: true, children: true } },
      },
    }),
  ]);

  // Calculate metrics for diff
  const toInput = (depts: typeof leftDepts) => {
    const empsByDept = new Map<string, { pp: number; opp: number; aup: number; totalFte: number }>();
    return depts.map((d) => ({
      id: d.id,
      name: d.name,
      parentId: d.parentId,
      shetilType: d.shetilType,
      originId: d.originId,
      head: d.head,
      _count: d._count,
      metrics: empsByDept.get(d.id) || { pp: 0, opp: 0, aup: 0, totalFte: 0 },
    }));
  };

  const { left, right, summary } = computeDiff(toInput(leftDepts), toInput(rightDepts));

  return JSON.stringify(
    {
      summary,
      changes: right
        .filter((d) => d.diffStatus !== "unchanged")
        .map((d) => ({
          name: d.name,
          status: d.diffStatus,
          changes: d.changes,
        })),
    },
    null,
    2
  );
}

async function cloneScenario(
  scenarioId: string,
  newName: string
): Promise<string> {
  const original = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: {
      departments: { include: { employees: true } },
    },
  });
  if (!original)
    return JSON.stringify({ error: "Сценарий не найден" });

  const newScenario = await prisma.scenario.create({
    data: {
      name: newName,
      description: `Клон сценария «${original.name}»`,
      status: "DRAFT",
      createdFromId: scenarioId,
      columnNames: original.columnNames ?? undefined,
    },
  });

  // Clone departments and employees
  const deptIdMap = new Map<string, string>();

  // First pass: create departments without parentId
  for (const dept of original.departments) {
    const newDept = await prisma.department.create({
      data: {
        scenarioId: newScenario.id,
        name: dept.name,
        cfo: dept.cfo,
        shetilType: dept.shetilType,
        sortOrder: dept.sortOrder,
        originId: dept.originId || dept.id,
      },
    });
    deptIdMap.set(dept.id, newDept.id);
  }

  // Second pass: set parentIds
  for (const dept of original.departments) {
    if (dept.parentId) {
      const newId = deptIdMap.get(dept.id)!;
      const newParentId = deptIdMap.get(dept.parentId);
      if (newParentId) {
        await prisma.department.update({
          where: { id: newId },
          data: { parentId: newParentId },
        });
      }
    }
  }

  // Clone employees
  const empIdMap = new Map<string, string>();
  for (const dept of original.departments) {
    const newDeptId = deptIdMap.get(dept.id)!;
    for (const emp of dept.employees) {
      const newEmp = await prisma.employee.create({
        data: {
          scenarioId: newScenario.id,
          departmentId: newDeptId,
          fullName: emp.fullName,
          position: emp.position,
          category: emp.category,
          fte: emp.fte,
          costRate: emp.costRate,
          tariffId: emp.tariffId,
          originId: emp.originId || emp.id,
        },
      });
      empIdMap.set(emp.id, newEmp.id);
    }
  }

  // Set head references
  for (const dept of original.departments) {
    if (dept.headId) {
      const newDeptId = deptIdMap.get(dept.id)!;
      const newHeadId = empIdMap.get(dept.headId);
      if (newHeadId) {
        await prisma.department.update({
          where: { id: newDeptId },
          data: { headId: newHeadId },
        });
      }
    }
  }

  return JSON.stringify({
    id: newScenario.id,
    name: newScenario.name,
    message: `Сценарий «${newName}» создан как клон «${original.name}»`,
  });
}

async function createDepartment(
  scenarioId: string,
  name: string,
  parentId: string | undefined,
  shetilType: ShetilType
): Promise<string> {
  const dept = await prisma.department.create({
    data: {
      scenarioId,
      name,
      parentId: parentId || null,
      shetilType,
    },
  });
  return JSON.stringify({
    id: dept.id,
    name: dept.name,
    message: `Подразделение «${name}» создано`,
  });
}

async function moveDepartment(
  departmentId: string,
  newParentId: string | null
): Promise<string> {
  const dept = await prisma.department.update({
    where: { id: departmentId },
    data: { parentId: newParentId },
  });
  return JSON.stringify({
    id: dept.id,
    name: dept.name,
    message: `Подразделение «${dept.name}» перемещено`,
  });
}

async function renameDepartment(
  departmentId: string,
  newName: string
): Promise<string> {
  const dept = await prisma.department.update({
    where: { id: departmentId },
    data: { name: newName },
  });
  return JSON.stringify({
    id: dept.id,
    name: dept.name,
    message: `Подразделение переименовано в «${newName}»`,
  });
}

async function deleteDepartment(departmentId: string): Promise<string> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { name: true },
  });
  if (!dept) return JSON.stringify({ error: "Подразделение не найдено" });

  await prisma.department.delete({ where: { id: departmentId } });
  return JSON.stringify({
    message: `Подразделение «${dept.name}» удалено`,
  });
}

async function moveEmployees(
  employeeIds: string[],
  targetDepartmentId: string
): Promise<string> {
  await prisma.employee.updateMany({
    where: { id: { in: employeeIds } },
    data: { departmentId: targetDepartmentId },
  });
  return JSON.stringify({
    message: `${employeeIds.length} сотрудник(ов) перемещены`,
    count: employeeIds.length,
  });
}

async function createGapPassport(
  input: ToolInput,
  currentScenarioId: string
): Promise<string> {
  const gap = await prisma.gapPassport.create({
    data: {
      scenarioId: (input.scenarioId as string) || currentScenarioId,
      asIsScenarioId: input.asIsScenarioId as string,
      toBeScenarioId: input.toBeScenarioId as string,
      category: input.category as GapCategory,
      title: input.title as string,
      description: input.description as string,
      priority: input.priority as GapPriority,
      impact: (input.impact as string) || null,
      affectedDepartmentIds: (input.affectedDepartmentIds as string[]) || [],
      aiGenerated: true,
      aiRationale: (input.aiRationale as string) || null,
    },
  });
  return JSON.stringify({
    id: gap.id,
    title: gap.title,
    message: `Паспорт разрыва «${gap.title}» создан`,
  });
}

async function calculatePnlTool(
  scenarioId: string,
  mode?: PnlMode,
  periodStartStr?: string,
  periodEndStr?: string
): Promise<string> {
  const now = new Date();
  const periodStart = periodStartStr
    ? new Date(periodStartStr)
    : new Date(now.getFullYear(), 0, 1);
  const periodEnd = periodEndStr
    ? new Date(periodEndStr)
    : new Date(now.getFullYear(), 11, 31);

  const results = await calculatePnl(
    scenarioId,
    mode || "combined",
    periodStart,
    periodEnd
  );

  // Summarize
  const totalRevenue = results.reduce((s, r) => s + r.revenue, 0);
  const totalCost = results.reduce((s, r) => s + r.cost, 0);

  const summary = results.map((r) => ({
    department: r.departmentName,
    type: r.shetilType,
    revenue: r.revenue,
    cost: r.cost,
    pnl: r.pnl,
    totalPnl: r.totalPnl,
    warnings: r.warnings.length,
  }));

  return JSON.stringify(
    {
      period: {
        start: periodStart.toISOString().split("T")[0],
        end: periodEnd.toISOString().split("T")[0],
      },
      mode: mode || "combined",
      totals: {
        revenue: Math.round(totalRevenue),
        cost: Math.round(totalCost),
        pnl: Math.round(totalRevenue - totalCost),
      },
      departments: summary,
    },
    null,
    2
  );
}

async function listScenarios(): Promise<string> {
  const scenarios = await prisma.scenario.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      isBaseline: true,
      _count: { select: { departments: true, employees: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return JSON.stringify(scenarios, null, 2);
}
