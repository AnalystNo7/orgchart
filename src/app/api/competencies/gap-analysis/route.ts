import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET — compute skill gap analysis for a scenario
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenarioId");
  const departmentId = searchParams.get("departmentId");

  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId required" }, { status: 400 });
  }

  // Get employees (optionally filtered by department)
  const empWhere: Record<string, unknown> = { scenarioId };
  if (departmentId) empWhere.departmentId = departmentId;

  const employees = await prisma.employee.findMany({
    where: empWhere,
    select: { id: true, fullName: true, position: true, departmentId: true },
  });

  // Get all competencies
  const competencies = await prisma.competency.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  // Get role requirements
  const roleComps = await prisma.roleCompetency.findMany({
    include: { competency: { select: { id: true, name: true, category: true } } },
  });

  // Get employee assessments
  const empComps = await prisma.employeeCompetency.findMany({
    where: { employee: empWhere },
  });

  // Build maps
  const roleReqMap = new Map<string, Map<string, number>>(); // position → competencyId → requiredLevel
  for (const rc of roleComps) {
    if (!roleReqMap.has(rc.position)) roleReqMap.set(rc.position, new Map());
    roleReqMap.get(rc.position)!.set(rc.competencyId, rc.requiredLevel);
  }

  const empCompMap = new Map<string, Map<string, number>>(); // employeeId → competencyId → currentLevel
  for (const ec of empComps) {
    if (!empCompMap.has(ec.employeeId)) empCompMap.set(ec.employeeId, new Map());
    empCompMap.get(ec.employeeId)!.set(ec.competencyId, ec.currentLevel);
  }

  // Departments
  const departments = await prisma.department.findMany({
    where: { scenarioId },
    select: { id: true, name: true },
  });
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  // Compute gaps per employee
  const employeeGaps: Array<{
    employeeId: string;
    employeeName: string;
    position: string;
    departmentId: string;
    departmentName: string;
    gaps: Array<{
      competencyId: string;
      competencyName: string;
      category: string;
      required: number;
      current: number;
      gap: number;
    }>;
    totalGap: number;
  }> = [];

  for (const emp of employees) {
    const reqs = roleReqMap.get(emp.position);
    if (!reqs || reqs.size === 0) continue;

    const empLevels = empCompMap.get(emp.id) || new Map();
    const gaps: typeof employeeGaps[0]["gaps"] = [];

    for (const [compId, required] of reqs) {
      const current = empLevels.get(compId) || 0;
      if (current < required) {
        const comp = competencies.find((c) => c.id === compId);
        gaps.push({
          competencyId: compId,
          competencyName: comp?.name || compId,
          category: comp?.category || "HARD",
          required,
          current,
          gap: required - current,
        });
      }
    }

    if (gaps.length > 0) {
      employeeGaps.push({
        employeeId: emp.id,
        employeeName: emp.fullName,
        position: emp.position,
        departmentId: emp.departmentId,
        departmentName: deptMap.get(emp.departmentId) || "",
        gaps,
        totalGap: gaps.reduce((s, g) => s + g.gap, 0),
      });
    }
  }

  // Aggregate by department
  const deptGaps: Record<string, { name: string; totalGap: number; employeeCount: number; gapsByCompetency: Record<string, number> }> = {};
  for (const eg of employeeGaps) {
    if (!deptGaps[eg.departmentId]) {
      deptGaps[eg.departmentId] = { name: eg.departmentName, totalGap: 0, employeeCount: 0, gapsByCompetency: {} };
    }
    deptGaps[eg.departmentId].totalGap += eg.totalGap;
    deptGaps[eg.departmentId].employeeCount++;
    for (const g of eg.gaps) {
      deptGaps[eg.departmentId].gapsByCompetency[g.competencyName] =
        (deptGaps[eg.departmentId].gapsByCompetency[g.competencyName] || 0) + g.gap;
    }
  }

  // Aggregate by competency
  const compGaps: Record<string, { name: string; category: string; totalGap: number; employeeCount: number }> = {};
  for (const eg of employeeGaps) {
    for (const g of eg.gaps) {
      if (!compGaps[g.competencyId]) {
        compGaps[g.competencyId] = { name: g.competencyName, category: g.category, totalGap: 0, employeeCount: 0 };
      }
      compGaps[g.competencyId].totalGap += g.gap;
      compGaps[g.competencyId].employeeCount++;
    }
  }

  return NextResponse.json({
    summary: {
      totalEmployees: employees.length,
      employeesWithGaps: employeeGaps.length,
      totalGapPoints: employeeGaps.reduce((s, e) => s + e.totalGap, 0),
      competenciesAnalyzed: competencies.length,
    },
    employeeGaps: employeeGaps.sort((a, b) => b.totalGap - a.totalGap),
    departmentGaps: Object.entries(deptGaps)
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => b.totalGap - a.totalGap),
    competencyGaps: Object.entries(compGaps)
      .map(([id, c]) => ({ id, ...c }))
      .sort((a, b) => b.totalGap - a.totalGap),
  });
}
