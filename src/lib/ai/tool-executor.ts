import { prisma } from "@/lib/db";
import { computeDiff } from "@/lib/diff";
import {
  calculatePnl,
  type PnlMode,
  type PnlAllocationMode,
} from "@/lib/pnl-calculator";
import { calculateOhi } from "@/lib/ohi-calculator";
import { runHealthCheck } from "@/lib/org-analyzer";
import { getBenchmarks, listAvailableMetrics, listAvailableIndustries, type BenchmarkCategory } from "./benchmarks";
import { retrieveChunks, formatRetrievalContext } from "@/lib/rag";
import type { ShetilType, GapCategory, GapPriority } from "@prisma/client";

import type { ToolProgressCallback } from "./tools";

type ToolInput = Record<string, unknown>;

export async function executeTool(
  name: string,
  input: ToolInput,
  currentScenarioId: string,
  onProgress?: ToolProgressCallback
): Promise<string> {
  try {
    switch (name) {
      case "get_benchmarks":
        return getBenchmarksTool(input);
      case "query_knowledge_base":
        return await queryKnowledgeBaseTool(input);
      case "analyze_skill_gaps":
        return await analyzeSkillGaps(
          (input.scenarioId as string) || currentScenarioId,
          input.departmentId as string | undefined
        );
      case "get_competencies":
        return await getCompetencies();
      case "analyze_processes":
        return await analyzeProcesses((input.scenarioId as string) || currentScenarioId);
      case "get_processes":
        return await getProcesses((input.scenarioId as string) || currentScenarioId);
      case "get_org_structure":
        return await getOrgStructure(
          (input.scenarioId as string) || currentScenarioId,
          (input.offset as number) ?? 0,
          (input.limit as number) ?? 200
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
          input.periodEnd as string | undefined,
          input.allocationMode as PnlAllocationMode | undefined
        );
      case "list_scenarios":
        return await listScenarios();
      case "run_whatif_scenario":
        return await runWhatIfScenario(input, currentScenarioId, onProgress);
      case "add_employee":
        return await addEmployee(input);
      case "remove_employees":
        return await removeEmployees(input.employeeIds as string[]);
      case "get_goals":
        return await getGoals(
          (input.scenarioId as string) || currentScenarioId,
          input.type as string | undefined,
          input.status as string | undefined
        );
      case "analyze_strategy":
        return await analyzeStrategy(
          (input.scenarioId as string) || currentScenarioId
        );
      case "get_ohi":
        return await getOhi(
          (input.scenarioId as string) || currentScenarioId
        );
      case "generate_board_report":
        return await generateBoardReport(
          (input.scenarioId as string) || currentScenarioId
        );
      case "get_clients":
        return await getClients(input.status as string | undefined);
      case "analyze_portfolio":
        return await analyzePortfolio(
          (input.scenarioId as string) || currentScenarioId
        );
      case "get_pipeline":
        return await getPipeline(
          (input.scenarioId as string) || currentScenarioId,
          input.stage as string | undefined,
          input.clientId as string | undefined
        );
      case "analyze_budget":
        return await analyzeBudget(
          (input.scenarioId as string) || currentScenarioId
        );
      case "get_unit_economics":
        return await getUnitEconomics(
          (input.scenarioId as string) || currentScenarioId
        );
      case "run_health_check":
        return await runHealthCheckTool(
          (input.scenarioId as string) || currentScenarioId
        );
      case "get_insights":
        return await getInsightsTool(
          (input.scenarioId as string) || currentScenarioId
        );
      default:
        return JSON.stringify({ error: `Неизвестный инструмент: ${name}` });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

async function getOrgStructure(
  scenarioId: string,
  offset = 0,
  limit = 200
): Promise<string> {
  const departments = await prisma.department.findMany({
    where: { scenarioId },
    // headId is enough: the list reports only whether a head exists.
    include: { _count: { select: { employees: true, children: true } } },
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

  // Paged: a full 1000-department tree blows past the provider's per-block
  // size limit. Callers ask for the next page via offset.
  const from = Math.max(0, offset);
  const page = departments.slice(from, from + Math.max(1, limit));
  const hasMore = from + page.length < departments.length;

  // Columnar, not an array of objects: repeating eleven key names on every
  // record cost more than the data itself (~120 of ~300 bytes per row) and
  // that weight is re-sent to the model on every subsequent step.
  // The head's full name is reduced to hasHead — for structural analysis what
  // matters is whether a unit has a head at all; the name comes from
  // get_department_details when actually needed.
  const rows = page.map((d) => {
    const m = metricsMap.get(d.id) || { pp: 0, opp: 0, aup: 0, totalFte: 0 };
    return [
      d.id,
      d.name,
      d.parentId,
      d.shetilType,
      d._count.employees,
      d._count.children,
      d.headId ? 1 : 0,
      round1(m.pp),
      round1(m.opp),
      round1(m.aup),
      round1(m.totalFte),
    ];
  });

  return JSON.stringify({
    total: departments.length,
    offset: from,
    shown: page.length,
    ...(hasMore
      ? {
          nextOffset: from + page.length,
          _hint: `Показаны подразделения ${from}..${from + page.length - 1} из ${departments.length}. Для продолжения вызовите get_org_structure с offset=${from + page.length}.`,
        }
      : {}),
    // A string, not an array: capToolResult splits its budget across the
    // arrays it finds, so a second array would halve what rows may occupy.
    columns: "id,name,parentId,type,emp,children,hasHead,pp,opp,aup,fte",
    rows,
  });
}

/** Доли FTE могут быть дробными — одного знака достаточно, длину не раздувает. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
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
  return JSON.stringify(dept);
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
  periodEndStr?: string,
  allocationMode?: PnlAllocationMode
): Promise<string> {
  const now = new Date();
  const periodStart = periodStartStr
    ? new Date(periodStartStr)
    : new Date(now.getFullYear(), 0, 1);
  const periodEnd = periodEndStr
    ? new Date(periodEndStr)
    : new Date(now.getFullYear(), 11, 31);

  const effectiveAllocation: PnlAllocationMode = allocationMode ?? "fte";

  const results = await calculatePnl(
    scenarioId,
    mode || "combined",
    periodStart,
    periodEnd,
    effectiveAllocation
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
      allocationMode: effectiveAllocation,
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
  return JSON.stringify(scenarios);
}

interface WhatIfOperation {
  action: string;
  params: Record<string, unknown>;
}

async function runWhatIfScenario(
  input: ToolInput,
  currentScenarioId: string,
  onProgress?: ToolProgressCallback
): Promise<string> {
  const sourceScenarioId = (input.scenarioId as string) || currentScenarioId;
  const name = input.name as string;
  const operations = input.operations as WhatIfOperation[];
  const comparePnl = input.comparePnl !== false;

  // 1. Get before-metrics
  onProgress?.("run_whatif_scenario", "Получение метрик исходного сценария...");
  const beforeMetrics = JSON.parse(await getOrgMetrics(sourceScenarioId));

  // 2. Clone scenario
  onProgress?.("run_whatif_scenario", "Клонирование сценария...");
  const cloneResult = JSON.parse(
    await cloneScenario(sourceScenarioId, name)
  );
  if (cloneResult.error) {
    return JSON.stringify({ error: `Не удалось клонировать: ${cloneResult.error}` });
  }
  const newScenarioId = cloneResult.id;

  // Build department name->id map for the new scenario (operations use original IDs, we need mapped IDs)
  const origDepts = await prisma.department.findMany({
    where: { scenarioId: sourceScenarioId },
    select: { id: true, name: true, originId: true },
  });
  const newDepts = await prisma.department.findMany({
    where: { scenarioId: newScenarioId },
    select: { id: true, name: true, originId: true },
  });

  // Map: original dept ID -> new dept ID (via originId or name match)
  const deptIdMap = new Map<string, string>();
  for (const nd of newDepts) {
    // originId points to the original department
    if (nd.originId) {
      deptIdMap.set(nd.originId, nd.id);
    }
  }
  // Also map by name as fallback
  const newDeptByName = new Map<string, string>();
  for (const nd of newDepts) {
    newDeptByName.set(nd.name, nd.id);
  }

  // Map original employee IDs to new employee IDs
  const origEmps = await prisma.employee.findMany({
    where: { scenarioId: sourceScenarioId },
    select: { id: true, originId: true },
  });
  const newEmps = await prisma.employee.findMany({
    where: { scenarioId: newScenarioId },
    select: { id: true, originId: true },
  });
  const empIdMap = new Map<string, string>();
  for (const ne of newEmps) {
    if (ne.originId) {
      empIdMap.set(ne.originId, ne.id);
    }
  }

  function mapDeptId(id: string): string {
    return deptIdMap.get(id) || newDeptByName.get(id) || id;
  }
  function mapEmpId(id: string): string {
    return empIdMap.get(id) || id;
  }

  // 3. Apply operations
  onProgress?.("run_whatif_scenario", `Применение операций (${operations.length})...`);
  const opResults: Array<{ action: string; result: string }> = [];
  for (const op of operations) {
    let result: string;
    try {
      switch (op.action) {
        case "create_department":
          result = await createDepartment(
            newScenarioId,
            op.params.name as string,
            op.params.parentId ? mapDeptId(op.params.parentId as string) : undefined,
            op.params.shetilType as ShetilType
          );
          // Update maps with newly created department
          const created = JSON.parse(result);
          if (created.id) {
            newDeptByName.set(created.name, created.id);
          }
          break;
        case "delete_department":
          result = await deleteDepartment(mapDeptId(op.params.departmentId as string));
          break;
        case "move_department":
          result = await moveDepartment(
            mapDeptId(op.params.departmentId as string),
            op.params.newParentId ? mapDeptId(op.params.newParentId as string) : null
          );
          break;
        case "rename_department":
          result = await renameDepartment(
            mapDeptId(op.params.departmentId as string),
            op.params.newName as string
          );
          break;
        case "move_employees": {
          const mappedEmpIds = (op.params.employeeIds as string[]).map(mapEmpId);
          result = await moveEmployees(
            mappedEmpIds,
            mapDeptId(op.params.targetDepartmentId as string)
          );
          break;
        }
        case "merge_departments": {
          const sourceId = mapDeptId(op.params.sourceDepartmentId as string);
          const targetId = mapDeptId(op.params.targetDepartmentId as string);
          result = await mergeDepartments(sourceId, targetId);
          break;
        }
        default:
          result = JSON.stringify({ error: `Неизвестная операция: ${op.action}` });
      }
    } catch (err) {
      result = JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      });
    }
    opResults.push({ action: op.action, result });
  }

  // 4. Get after-metrics
  onProgress?.("run_whatif_scenario", "Расчёт метрик после изменений...");
  const afterMetrics = JSON.parse(await getOrgMetrics(newScenarioId));

  // 5. Compare scenarios
  onProgress?.("run_whatif_scenario", "Сравнение структур...");
  const comparison = JSON.parse(await compareScenarios(sourceScenarioId, newScenarioId));

  // 6. Optionally compare P&L
  let pnlComparison = null;
  if (comparePnl) {
    onProgress?.("run_whatif_scenario", "Расчёт P&L до/после...");
    try {
      const [beforePnl, afterPnl] = await Promise.all([
        calculatePnlTool(sourceScenarioId),
        calculatePnlTool(newScenarioId),
      ]);
      pnlComparison = {
        before: JSON.parse(beforePnl).totals,
        after: JSON.parse(afterPnl).totals,
      };
      if (pnlComparison.before && pnlComparison.after) {
        pnlComparison = {
          ...pnlComparison,
          delta: {
            revenue: pnlComparison.after.revenue - pnlComparison.before.revenue,
            cost: pnlComparison.after.cost - pnlComparison.before.cost,
            pnl: pnlComparison.after.pnl - pnlComparison.before.pnl,
          },
        };
      }
    } catch {
      // P&L comparison optional — may fail if no contracts
    }
  }

  return JSON.stringify(
    {
      whatIfScenario: {
        id: newScenarioId,
        name,
      },
      operationsApplied: opResults.length,
      operations: opResults,
      metricsBefore: {
        totalDepartments: beforeMetrics.totalDepartments,
        totalEmployees: beforeMetrics.totalEmployees,
        totalFte: beforeMetrics.totalFte,
        overheadRatio: beforeMetrics.overheadRatio,
        avgSpanOfControl: beforeMetrics.avgSpanOfControl,
        maxHierarchyDepth: beforeMetrics.maxHierarchyDepth,
      },
      metricsAfter: {
        totalDepartments: afterMetrics.totalDepartments,
        totalEmployees: afterMetrics.totalEmployees,
        totalFte: afterMetrics.totalFte,
        overheadRatio: afterMetrics.overheadRatio,
        avgSpanOfControl: afterMetrics.avgSpanOfControl,
        maxHierarchyDepth: afterMetrics.maxHierarchyDepth,
      },
      structuralChanges: comparison.summary,
      changedDepartments: comparison.changes,
      pnlComparison,
    },
    null,
    2
  );
}

async function mergeDepartments(
  sourceDeptId: string,
  targetDeptId: string
): Promise<string> {
  const source = await prisma.department.findUnique({
    where: { id: sourceDeptId },
    select: { name: true },
  });
  const target = await prisma.department.findUnique({
    where: { id: targetDeptId },
    select: { name: true },
  });
  if (!source || !target) {
    return JSON.stringify({ error: "Подразделение не найдено" });
  }

  // Move all employees from source to target
  await prisma.employee.updateMany({
    where: { departmentId: sourceDeptId },
    data: { departmentId: targetDeptId },
  });

  // Move all child departments from source to target
  await prisma.department.updateMany({
    where: { parentId: sourceDeptId },
    data: { parentId: targetDeptId },
  });

  // Delete source department
  await prisma.department.delete({ where: { id: sourceDeptId } });

  return JSON.stringify({
    message: `Подразделение «${source.name}» объединено с «${target.name}»: сотрудники и дочерние подразделения перемещены`,
  });
}

async function addEmployee(input: ToolInput): Promise<string> {
  const dept = await prisma.department.findUnique({
    where: { id: input.departmentId as string },
    select: { scenarioId: true, name: true },
  });
  if (!dept) return JSON.stringify({ error: "Подразделение не найдено" });

  const emp = await prisma.employee.create({
    data: {
      scenarioId: dept.scenarioId,
      departmentId: input.departmentId as string,
      fullName: input.fullName as string,
      position: input.position as string,
      category: input.category as "PP" | "OPP" | "AUP",
      fte: input.fte ? Number(input.fte) : 1.0,
    },
  });

  return JSON.stringify({
    id: emp.id,
    fullName: emp.fullName,
    message: `Сотрудник «${emp.fullName}» добавлен в подразделение «${dept.name}»`,
  });
}

async function removeEmployees(employeeIds: string[]): Promise<string> {
  const deleted = await prisma.employee.deleteMany({
    where: { id: { in: employeeIds } },
  });
  return JSON.stringify({
    message: `Удалено ${deleted.count} сотрудник(ов)`,
    count: deleted.count,
  });
}

function getBenchmarksTool(input: ToolInput): string {
  const category = input.category as BenchmarkCategory | undefined;
  const metric = input.metric as string | undefined;
  const industry = input.industry as string | undefined;
  const companySize = input.companySize as string | undefined;

  const benchmarks = getBenchmarks({ category, metric, industry, companySize });

  if (benchmarks.length === 0) {
    return JSON.stringify({
      message: "Бенчмарки не найдены по заданным фильтрам",
      availableMetrics: listAvailableMetrics(),
      availableIndustries: listAvailableIndustries(),
    });
  }

  return JSON.stringify({
    count: benchmarks.length,
    benchmarks,
    note: "Источник: OSINT-бенчмарки (Уровень 1). Для более точных данных загрузите отраслевые отчёты в Knowledge Base.",
  });
}

async function getProcesses(scenarioId: string): Promise<string> {
  const processes = await prisma.process.findMany({
    where: { scenarioId },
    include: {
      kpis: true,
      participants: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return JSON.stringify(
    processes.map((p) => ({
      id: p.id,
      name: p.name,
      level: p.level,
      status: p.status,
      parentId: p.parentId,
      ownerDeptId: p.ownerDeptId,
      description: p.description,
      kpis: p.kpis.map((k) => ({ name: k.name, target: k.targetValue, current: k.currentValue, unit: k.unit })),
      raci: p.participants.map((pp) => ({ deptId: pp.departmentId, role: pp.role })),
    })),
    null,
    2
  );
}

async function analyzeProcesses(scenarioId: string): Promise<string> {
  const processes = await prisma.process.findMany({
    where: { scenarioId },
    include: { participants: true, kpis: true },
  });

  const departments = await prisma.department.findMany({
    where: { scenarioId },
    select: { id: true, name: true },
  });

  if (processes.length === 0) {
    return JSON.stringify({ message: "В сценарии нет бизнес-процессов. Создайте процессы на странице «Процессы»." });
  }

  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  // Analysis
  const noOwner = processes.filter((p) => !p.ownerDeptId);
  const noRaci = processes.filter((p) => p.participants.length === 0);
  const noKpi = processes.filter((p) => p.kpis.length === 0);
  const noAccountable = processes.filter(
    (p) => p.participants.length > 0 && !p.participants.some((pp) => pp.role === "ACCOUNTABLE")
  );

  // Departments not participating in any process
  const participatingDepts = new Set(processes.flatMap((p) => p.participants.map((pp) => pp.departmentId)));
  const uncoveredDepts = departments.filter((d) => !participatingDepts.has(d.id));

  // Departments with too many R roles
  const rCountByDept = new Map<string, number>();
  for (const p of processes) {
    for (const pp of p.participants) {
      if (pp.role === "RESPONSIBLE") {
        rCountByDept.set(pp.departmentId, (rCountByDept.get(pp.departmentId) || 0) + 1);
      }
    }
  }
  const overloadedDepts = Array.from(rCountByDept.entries())
    .filter(([, count]) => count > 5)
    .map(([deptId, count]) => ({ dept: deptMap.get(deptId) || deptId, count }));

  const result = {
    summary: {
      totalProcesses: processes.length,
      byLevel: {
        MACRO: processes.filter((p) => p.level === "MACRO").length,
        PROCESS: processes.filter((p) => p.level === "PROCESS").length,
        SUBPROCESS: processes.filter((p) => p.level === "SUBPROCESS").length,
      },
      totalDepartments: departments.length,
      departmentsInProcesses: participatingDepts.size,
    },
    issues: {
      processesWithoutOwner: noOwner.map((p) => ({ id: p.id, name: p.name, level: p.level })),
      processesWithoutRaci: noRaci.map((p) => ({ id: p.id, name: p.name })),
      processesWithoutKpi: noKpi.map((p) => ({ id: p.id, name: p.name })),
      processesWithoutAccountable: noAccountable.map((p) => ({ id: p.id, name: p.name })),
      uncoveredDepartments: uncoveredDepts.map((d) => ({ id: d.id, name: d.name })),
      overloadedDepartments: overloadedDepts,
    },
    issueCount:
      noOwner.length + noRaci.length + noKpi.length + noAccountable.length + uncoveredDepts.length + overloadedDepts.length,
  };

  return JSON.stringify(result);
}

async function getCompetencies(): Promise<string> {
  const competencies = await prisma.competency.findMany({
    include: {
      _count: { select: { roleCompetencies: true, employeeCompetencies: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return JSON.stringify(
    competencies.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      description: c.description,
      roleRequirements: c._count.roleCompetencies,
      employeeAssessments: c._count.employeeCompetencies,
    })),
    null,
    2
  );
}

async function analyzeSkillGaps(scenarioId: string, departmentId?: string): Promise<string> {
  const empWhere: Record<string, unknown> = { scenarioId };
  if (departmentId) empWhere.departmentId = departmentId;

  const employees = await prisma.employee.findMany({
    where: empWhere,
    select: { id: true, fullName: true, position: true, departmentId: true },
  });

  const competencies = await prisma.competency.findMany();
  const roleComps = await prisma.roleCompetency.findMany();
  const empComps = await prisma.employeeCompetency.findMany({
    where: { employee: empWhere },
  });

  const departments = await prisma.department.findMany({
    where: { scenarioId },
    select: { id: true, name: true },
  });
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));
  const compMap = new Map(competencies.map((c) => [c.id, c]));

  // Build role requirements: position → competencyId → requiredLevel
  const roleReqMap = new Map<string, Map<string, number>>();
  for (const rc of roleComps) {
    if (!roleReqMap.has(rc.position)) roleReqMap.set(rc.position, new Map());
    roleReqMap.get(rc.position)!.set(rc.competencyId, rc.requiredLevel);
  }

  // Build employee levels: employeeId → competencyId → currentLevel
  const empLevelMap = new Map<string, Map<string, number>>();
  for (const ec of empComps) {
    if (!empLevelMap.has(ec.employeeId)) empLevelMap.set(ec.employeeId, new Map());
    empLevelMap.get(ec.employeeId)!.set(ec.competencyId, ec.currentLevel);
  }

  if (roleComps.length === 0) {
    return JSON.stringify({
      message: "Требования к позициям (RoleCompetency) не заполнены. Заполните их для проведения gap-анализа.",
      totalEmployees: employees.length,
      competencies: competencies.length,
    });
  }

  // Calculate gaps
  const gaps: Array<{
    employee: string;
    position: string;
    department: string;
    competency: string;
    category: string;
    required: number;
    current: number;
    gap: number;
  }> = [];

  for (const emp of employees) {
    const reqs = roleReqMap.get(emp.position);
    if (!reqs) continue;
    const levels = empLevelMap.get(emp.id) || new Map();

    for (const [compId, required] of reqs) {
      const current = levels.get(compId) || 0;
      if (current < required) {
        const comp = compMap.get(compId);
        gaps.push({
          employee: emp.fullName,
          position: emp.position,
          department: deptMap.get(emp.departmentId) || "",
          competency: comp?.name || compId,
          category: comp?.category || "HARD",
          required,
          current,
          gap: required - current,
        });
      }
    }
  }

  // Aggregate
  const byDept: Record<string, number> = {};
  const byComp: Record<string, number> = {};
  for (const g of gaps) {
    byDept[g.department] = (byDept[g.department] || 0) + g.gap;
    byComp[g.competency] = (byComp[g.competency] || 0) + g.gap;
  }

  return JSON.stringify({
    summary: {
      totalEmployees: employees.length,
      employeesWithGaps: new Set(gaps.map((g) => g.employee)).size,
      totalGapPoints: gaps.reduce((s, g) => s + g.gap, 0),
      criticalGaps: gaps.filter((g) => g.gap >= 3).length,
    },
    topGapsByDepartment: Object.entries(byDept).sort(([, a], [, b]) => b - a).slice(0, 10),
    topGapsByCompetency: Object.entries(byComp).sort(([, a], [, b]) => b - a).slice(0, 10),
    details: gaps.sort((a, b) => b.gap - a.gap).slice(0, 30),
    recommendations: {
      hiring: `Рассмотрите найм специалистов с компетенциями: ${Object.entries(byComp).sort(([, a], [, b]) => b - a).slice(0, 3).map(([name]) => name).join(", ")}`,
      training: `Приоритетное обучение для подразделений: ${Object.entries(byDept).sort(([, a], [, b]) => b - a).slice(0, 3).map(([name]) => name).join(", ")}`,
    },
  });
}

async function queryKnowledgeBaseTool(input: ToolInput): Promise<string> {
  const query = input.query as string;
  const topK = (input.topK as number) || 5;
  const category = input.category as string | undefined;

  try {
    const results = await retrieveChunks(query, topK, category);

    if (results.length === 0) {
      return JSON.stringify({
        message: "В базе знаний не найдено релевантных документов по запросу.",
        query,
      });
    }

    const context = formatRetrievalContext(results);

    return JSON.stringify({
      count: results.length,
      context,
      sources: results.map((r) => ({
        document: r.documentTitle,
        category: r.category,
        similarity: `${(r.similarity * 100).toFixed(1)}%`,
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // If pgvector not available or no documents, return graceful message
    if (msg.includes("does not exist") || msg.includes("vector")) {
      return JSON.stringify({
        message: "База знаний пока пуста или pgvector не настроен. Загрузите документы через раздел «База знаний».",
      });
    }
    return JSON.stringify({ error: msg });
  }
}

// --- Strategic Goals ---

async function getGoals(
  scenarioId: string,
  type?: string,
  status?: string
): Promise<string> {
  const goals = await prisma.goal.findMany({
    where: {
      scenarioId,
      ...(type && { type: type as never }),
      ...(status && { status: status as never }),
    },
    include: {
      kpis: true,
      departments: { include: { department: { select: { id: true, name: true } } } },
      owner: { select: { id: true, fullName: true, position: true } },
      _count: { select: { children: true } },
    },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
  });

  return JSON.stringify({
    total: goals.length,
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      status: g.status,
      progress: g.progress,
      weight: g.weight,
      period: g.period,
      parentId: g.parentId,
      owner: g.owner ? `${g.owner.fullName} (${g.owner.position})` : null,
      departments: g.departments.map((d) => d.department.name),
      kpis: g.kpis.map((k) => ({
        name: k.name,
        current: k.currentValue,
        target: k.targetValue,
        unit: k.unit,
        progress: k.targetValue > 0 ? Math.round((k.currentValue / k.targetValue) * 100) : 0,
      })),
      childrenCount: g._count.children,
    })),
  });
}

async function analyzeStrategy(scenarioId: string): Promise<string> {
  const goals = await prisma.goal.findMany({
    where: { scenarioId },
    include: {
      kpis: true,
      departments: { include: { department: { select: { id: true, name: true } } } },
      owner: { select: { id: true, fullName: true } },
    },
  });

  const departments = await prisma.department.findMany({
    where: { scenarioId },
    select: { id: true, name: true },
  });

  const typeLabels: Record<string, string> = {
    BSC_FINANCIAL: "Финансы",
    BSC_CLIENT: "Клиенты",
    BSC_PROCESS: "Процессы",
    BSC_LEARNING: "Обучение и рост",
    OKR: "OKR",
  };

  // 1. Coverage by perspective
  const perspectiveCoverage: Record<string, { count: number; avgProgress: number }> = {};
  for (const type of ["BSC_FINANCIAL", "BSC_CLIENT", "BSC_PROCESS", "BSC_LEARNING", "OKR"]) {
    const typed = goals.filter((g) => g.type === type);
    perspectiveCoverage[typeLabels[type]] = {
      count: typed.length,
      avgProgress: typed.length > 0
        ? Math.round(typed.reduce((s, g) => s + g.progress, 0) / typed.length)
        : 0,
    };
  }

  // 2. Goals without KPIs
  const goalsWithoutKpis = goals
    .filter((g) => g.kpis.length === 0)
    .map((g) => ({ name: g.name, type: typeLabels[g.type] }));

  // 3. Goals at risk
  const goalsAtRisk = goals
    .filter((g) => g.status === "AT_RISK" || g.status === "FAILED")
    .map((g) => ({ name: g.name, type: typeLabels[g.type], status: g.status, progress: g.progress }));

  // 4. Goals without owner
  const goalsWithoutOwner = goals
    .filter((g) => !g.ownerId)
    .map((g) => ({ name: g.name, type: typeLabels[g.type] }));

  // 5. Department involvement
  const deptGoalCount = new Map<string, number>();
  for (const g of goals) {
    for (const d of g.departments) {
      deptGoalCount.set(d.department.name, (deptGoalCount.get(d.department.name) || 0) + 1);
    }
  }
  const deptsWithoutGoals = departments
    .filter((d) => !deptGoalCount.has(d.name))
    .map((d) => d.name);

  // 6. Empty perspectives
  const emptyPerspectives = Object.entries(perspectiveCoverage)
    .filter(([, v]) => v.count === 0)
    .map(([k]) => k);

  // Summary
  const issues: string[] = [];
  if (emptyPerspectives.length > 0) {
    issues.push(`${emptyPerspectives.length} перспектив без целей: ${emptyPerspectives.join(", ")}`);
  }
  if (goalsWithoutKpis.length > 0) {
    issues.push(`${goalsWithoutKpis.length} целей без KPI`);
  }
  if (goalsAtRisk.length > 0) {
    issues.push(`${goalsAtRisk.length} целей под угрозой/провалены`);
  }
  if (goalsWithoutOwner.length > 0) {
    issues.push(`${goalsWithoutOwner.length} целей без владельца`);
  }
  if (deptsWithoutGoals.length > 0) {
    issues.push(`${deptsWithoutGoals.length} подразделений не участвуют в целях`);
  }

  return JSON.stringify({
    totalGoals: goals.length,
    perspectiveCoverage,
    goalsWithoutKpis,
    goalsAtRisk,
    goalsWithoutOwner,
    departmentInvolvement: Object.fromEntries(deptGoalCount),
    deptsWithoutGoals,
    issues: issues.length > 0 ? issues : ["Стратегическое выравнивание в порядке"],
  });
}

// --- OHI ---

async function getOhi(scenarioId: string): Promise<string> {
  const result = await calculateOhi(scenarioId);
  return JSON.stringify(result);
}

async function generateBoardReport(scenarioId: string): Promise<string> {
  const ohi = await calculateOhi(scenarioId);

  const statusLabel = ohi.overallScore >= 70 ? "ЗДОРОВАЯ" : ohi.overallScore >= 40 ? "ТРЕБУЕТ ВНИМАНИЯ" : "КРИТИЧЕСКОЕ СОСТОЯНИЕ";

  const lines: string[] = [
    `# Отчёт о здоровье организации`,
    ``,
    `## Общая оценка: ${ohi.overallScore}/100 — ${statusLabel}`,
    ``,
    `### Сводка`,
    `- Сотрудников: ${ohi.summary.employees} (${ohi.summary.totalFte} FTE)`,
    `- Подразделений: ${ohi.summary.departments}`,
    `- Процессов: ${ohi.summary.processes}`,
    `- Стратегических целей: ${ohi.summary.goals}`,
    ``,
    `### Компоненты OHI`,
  ];

  for (const comp of ohi.components) {
    const scoreText = comp.score !== null ? `${comp.score}/100` : "N/A";
    const status = comp.score === null ? "⚪" : comp.score >= 70 ? "🟢" : comp.score >= 40 ? "🟡" : "🔴";
    lines.push(``, `#### ${status} ${comp.name} (${Math.round(comp.weight * 100)}%) — ${scoreText}`);

    for (const [k, v] of Object.entries(comp.metrics)) {
      if (v !== null && k !== "note") {
        lines.push(`- ${k}: ${v}`);
      }
    }
  }

  // Recommendations
  lines.push(``, `### Рекомендации`);
  const weak = ohi.components.filter((c) => c.score !== null && c.score < 50);
  if (weak.length > 0) {
    for (const c of weak) {
      lines.push(`- **${c.name}** (${c.score}/100): требуется улучшение`);
    }
  } else {
    lines.push(`- Все доступные компоненты в удовлетворительном состоянии`);
  }

  const na = ohi.components.filter((c) => c.score === null);
  if (na.length > 0) {
    lines.push(``, `### Нет данных`);
    for (const c of na) {
      lines.push(`- ${c.name}: данные недоступны для расчёта`);
    }
  }

  return lines.join("\n");
}

// --- Clients & Pipeline ---

async function getClients(status?: string): Promise<string> {
  const clients = await prisma.client.findMany({
    where: status ? { status: status as never } : undefined,
    include: {
      contracts: { select: { id: true, name: true, type: true, amount: true, status: true } },
      _count: { select: { contracts: true, deals: true } },
    },
    orderBy: { name: "asc" },
  });

  return JSON.stringify({
    total: clients.length,
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      industry: c.industry,
      status: c.status,
      contracts: c._count.contracts,
      deals: c._count.deals,
      revenue: c.contracts
        .filter((ct) => ct.type === "REVENUE")
        .reduce((s, ct) => s + Number(ct.amount || 0), 0),
    })),
  });
}

async function analyzePortfolio(scenarioId: string): Promise<string> {
  const clients = await prisma.client.findMany({
    include: {
      contracts: { select: { type: true, amount: true } },
    },
  });

  const deals = await prisma.pipelineDeal.findMany({
    where: { scenarioId },
    include: { client: { select: { name: true } } },
  });

  // Revenue by client
  const clientRevenues = clients.map((c) => ({
    name: c.name,
    status: c.status,
    revenue: c.contracts
      .filter((ct) => ct.type === "REVENUE")
      .reduce((s, ct) => s + Number(ct.amount || 0), 0),
  })).sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = clientRevenues.reduce((s, c) => s + c.revenue, 0);
  const top3 = clientRevenues.slice(0, 3);
  const top3Revenue = top3.reduce((s, c) => s + c.revenue, 0);
  const concentrationPct = totalRevenue > 0 ? Math.round((top3Revenue / totalRevenue) * 100) : 0;

  // Pipeline summary
  const stageGroups: Record<string, { count: number; value: number }> = {};
  for (const d of deals) {
    if (!stageGroups[d.stage]) stageGroups[d.stage] = { count: 0, value: 0 };
    stageGroups[d.stage].count++;
    stageGroups[d.stage].value += d.amount;
  }

  const weightedPipeline = deals
    .filter((d) => d.stage !== "LOST" && d.stage !== "WON")
    .reduce((s, d) => s + d.amount * (d.probability / 100), 0);

  const issues: string[] = [];
  if (concentrationPct > 60) issues.push(`Высокая концентрация: ${concentrationPct}% выручки от top-3 клиентов`);
  if (clients.filter((c) => c.status === "ACTIVE").length < 3) issues.push("Мало активных клиентов");
  if (deals.filter((d) => d.stage === "PROPOSAL" || d.stage === "NEGOTIATION").length === 0) issues.push("Нет сделок на стадии предложения/переговоров");

  return JSON.stringify({
    totalClients: clients.length,
    activeClients: clients.filter((c) => c.status === "ACTIVE").length,
    totalRevenue: Math.round(totalRevenue),
    concentrationTop3: concentrationPct,
    top3Clients: top3.map((c) => ({ name: c.name, revenue: Math.round(c.revenue) })),
    pipeline: {
      totalDeals: deals.length,
      byStage: stageGroups,
      weightedValue: Math.round(weightedPipeline),
    },
    issues: issues.length > 0 ? issues : ["Портфель в хорошем состоянии"],
  });
}

async function getPipeline(scenarioId: string, stage?: string, clientId?: string): Promise<string> {
  const deals = await prisma.pipelineDeal.findMany({
    where: {
      scenarioId,
      ...(stage && { stage: stage as never }),
      ...(clientId && { clientId }),
    },
    include: { client: { select: { id: true, name: true } } },
    orderBy: [{ stage: "asc" }, { amount: "desc" }],
  });

  return JSON.stringify({
    total: deals.length,
    deals: deals.map((d) => ({
      id: d.id,
      name: d.name,
      client: d.client.name,
      amount: d.amount,
      probability: d.probability,
      stage: d.stage,
      expectedCloseDate: d.expectedCloseDate,
      weightedValue: Math.round(d.amount * (d.probability / 100)),
    })),
  });
}

// --- Budget & Unit Economics ---

async function analyzeBudget(scenarioId: string): Promise<string> {
  const budgets = await prisma.budget.findMany({
    where: { scenarioId },
    include: {
      lines: { include: { department: { select: { name: true } } } },
    },
  });

  const summary = budgets.map((b) => {
    const totalPlanned = b.lines.reduce((s, l) => s + l.plannedAmount, 0);
    const totalActual = b.lines.reduce((s, l) => s + l.actualAmount, 0);
    return {
      name: b.name,
      type: b.type,
      status: b.status,
      period: `${b.periodStart.toISOString().slice(0, 10)} — ${b.periodEnd.toISOString().slice(0, 10)}`,
      totalPlanned: Math.round(totalPlanned),
      totalActual: Math.round(totalActual),
      variance: Math.round(totalPlanned - totalActual),
      lines: b.lines.map((l) => ({
        department: l.department.name,
        category: l.category,
        planned: l.plannedAmount,
        actual: l.actualAmount,
        variance: Math.round(l.plannedAmount - l.actualAmount),
      })),
    };
  });

  const totalPlanned = summary.reduce((s, b) => s + b.totalPlanned, 0);
  const totalActual = summary.reduce((s, b) => s + b.totalActual, 0);
  const capex = summary.filter((b) => b.type === "CAPEX");
  const opex = summary.filter((b) => b.type === "OPEX");

  const issues: string[] = [];
  for (const b of summary) {
    if (b.variance < 0) issues.push(`${b.name}: перерасход ${Math.abs(b.variance)}`);
  }

  return JSON.stringify({
    totalBudgets: budgets.length,
    totalPlanned,
    totalActual,
    totalVariance: totalPlanned - totalActual,
    capex: { count: capex.length, planned: capex.reduce((s, b) => s + b.totalPlanned, 0) },
    opex: { count: opex.length, planned: opex.reduce((s, b) => s + b.totalPlanned, 0) },
    budgets: summary,
    issues: issues.length > 0 ? issues : ["Бюджеты в рамках плана"],
  });
}

async function getUnitEconomics(scenarioId: string): Promise<string> {
  const employees = await prisma.employee.findMany({
    where: { scenarioId },
    include: {
      department: { select: { id: true, name: true, shetilType: true } },
      contracts: { include: { contract: { select: { type: true, amount: true } } } },
    },
  });

  const totalFte = employees.reduce((s, e) => s + Number(e.fte), 0);
  const ppEmployees = employees.filter((e) => e.category === "PP");
  const ppWithContracts = ppEmployees.filter((e) => e.contracts.length > 0);

  // Revenue from contracts linked to PP employees
  const totalRevenue = employees.reduce((s, e) => {
    return s + e.contracts
      .filter((c) => c.contract.type === "REVENUE")
      .reduce((ss, c) => ss + Number(c.contract.amount || 0) * (Number(e.fte) / totalFte), 0);
  }, 0);

  const totalCost = employees.reduce((s, e) => s + Number(e.costRate || 0) * Number(e.fte), 0);

  // Per-department breakdown
  const deptMap = new Map<string, { name: string; fte: number; revenue: number; cost: number; ppCount: number; ppUtilized: number }>();
  for (const e of employees) {
    const key = e.departmentId;
    if (!deptMap.has(key)) deptMap.set(key, { name: e.department.name, fte: 0, revenue: 0, cost: 0, ppCount: 0, ppUtilized: 0 });
    const d = deptMap.get(key)!;
    d.fte += Number(e.fte);
    d.cost += Number(e.costRate || 0) * Number(e.fte);
    if (e.category === "PP") {
      d.ppCount++;
      if (e.contracts.length > 0) d.ppUtilized++;
    }
  }

  return JSON.stringify({
    summary: {
      totalEmployees: employees.length,
      totalFte: Math.round(totalFte * 10) / 10,
      revenuePerFte: totalFte > 0 ? Math.round(totalRevenue / totalFte) : 0,
      costPerFte: totalFte > 0 ? Math.round(totalCost / totalFte) : 0,
      utilization: ppEmployees.length > 0 ? Math.round((ppWithContracts.length / ppEmployees.length) * 100) : 0,
    },
    departments: Array.from(deptMap.values()).map((d) => ({
      department: d.name,
      fte: Math.round(d.fte * 10) / 10,
      costPerFte: d.fte > 0 ? Math.round(d.cost / d.fte) : 0,
      ppUtilization: d.ppCount > 0 ? Math.round((d.ppUtilized / d.ppCount) * 100) : null,
    })),
  });
}

// --- Proactive AI ---

async function runHealthCheckTool(scenarioId: string): Promise<string> {
  const result = await runHealthCheck(scenarioId);
  const summary = result.insights.map((i) => ({
    severity: i.severity,
    title: i.title,
    recommendations: i.recommendations.length,
  }));

  return JSON.stringify({
    totalInsights: result.created,
    critical: summary.filter((i) => i.severity === "CRITICAL").length,
    warnings: summary.filter((i) => i.severity === "WARNING").length,
    positive: summary.filter((i) => i.severity === "POSITIVE").length,
    insights: summary,
  });
}

async function getInsightsTool(scenarioId: string): Promise<string> {
  const insights = await prisma.aIInsight.findMany({
    where: { scenarioId, resolved: false },
    include: { recommendations: { orderBy: { priority: "asc" } } },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
  });

  return JSON.stringify({
    total: insights.length,
    insights: insights.map((i) => ({
      severity: i.severity,
      category: i.category,
      title: i.title,
      description: i.description,
      metric: i.metricKey ? { key: i.metricKey, current: i.currentValue, benchmark: i.benchmarkValue } : null,
      recommendations: i.recommendations.map((r) => r.title),
    })),
  });
}
