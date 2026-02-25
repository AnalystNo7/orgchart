import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createScenarioSchema } from "@/lib/validations/scenario";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sourceId } = await params;
  const body = await req.json();
  const parsed = createScenarioSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const source = await prisma.scenario.findUnique({ where: { id: sourceId } });
  if (!source) {
    return NextResponse.json({ error: "Source scenario not found" }, { status: 404 });
  }

  // Deep copy in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create new scenario
    const newScenario = await tx.scenario.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        status: "DRAFT",
        createdFromId: sourceId,
      },
    });

    // 2. Copy departments
    const sourceDepts = await tx.department.findMany({
      where: { scenarioId: sourceId },
      orderBy: { sortOrder: "asc" },
    });

    const deptIdMap = new Map<string, string>();

    // First pass: create departments without parentId
    for (const dept of sourceDepts) {
      const newDept = await tx.department.create({
        data: {
          scenarioId: newScenario.id,
          name: dept.name,
          shetilType: dept.shetilType,
          sortOrder: dept.sortOrder,
          originId: dept.originId ?? dept.id,
        },
      });
      deptIdMap.set(dept.id, newDept.id);
    }

    // Second pass: set parentId
    for (const dept of sourceDepts) {
      if (dept.parentId) {
        const newId = deptIdMap.get(dept.id)!;
        const newParentId = deptIdMap.get(dept.parentId)!;
        await tx.department.update({
          where: { id: newId },
          data: { parentId: newParentId },
        });
      }
    }

    // 3. Copy employees
    const sourceEmployees = await tx.employee.findMany({
      where: { scenarioId: sourceId },
    });

    const empIdMap = new Map<string, string>();

    for (const emp of sourceEmployees) {
      const newDeptId = deptIdMap.get(emp.departmentId);
      if (!newDeptId) continue;

      const newEmp = await tx.employee.create({
        data: {
          scenarioId: newScenario.id,
          departmentId: newDeptId,
          fullName: emp.fullName,
          position: emp.position,
          category: emp.category,
          fte: emp.fte,
          originId: emp.originId ?? emp.id,
        },
      });
      empIdMap.set(emp.id, newEmp.id);
    }

    // 4. Set headId for departments
    for (const dept of sourceDepts) {
      if (dept.headId) {
        const newDeptId = deptIdMap.get(dept.id)!;
        const newHeadId = empIdMap.get(dept.headId);
        if (newHeadId) {
          await tx.department.update({
            where: { id: newDeptId },
            data: { headId: newHeadId },
          });
        }
      }
    }

    return newScenario;
  });

  return NextResponse.json(result, { status: 201 });
}
