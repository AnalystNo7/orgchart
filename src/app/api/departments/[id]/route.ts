import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateDepartmentSchema } from "@/lib/validations/department";
import { logAction } from "@/lib/action-logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const department = await prisma.department.findUnique({
    where: { id },
    include: {
      head: { select: { id: true, fullName: true } },
      employees: {
        orderBy: { fullName: "asc" },
      },
      children: {
        select: { id: true, name: true },
        orderBy: { sortOrder: "asc" },
      },
      _count: { select: { employees: true, children: true } },
    },
  });

  if (!department) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Compute metrics
  const metrics = await prisma.employee.groupBy({
    by: ["category"],
    where: { departmentId: id },
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

  return NextResponse.json({
    ...department,
    metrics: { pp, opp, aup, totalFte },
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = updateDepartmentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Snapshot current state for undo
  const previous = await prisma.department.findUnique({
    where: { id },
    select: { name: true, cfo: true, shetilType: true, headId: true, parentId: true },
  });

  const department = await prisma.department.update({
    where: { id },
    data: parsed.data,
    include: {
      head: { select: { id: true, fullName: true } },
      _count: { select: { employees: true, children: true } },
    },
  });

  // Log action for undo
  if (previous) {
    await logAction(
      department.scenarioId,
      "update_department",
      { departmentId: id, changes: parsed.data },
      { departmentId: id, previousValues: previous }
    );
  }

  return NextResponse.json(department);
}

// Helper: collect all descendants (departments + employees) for snapshot
async function collectSubtreeSnapshot(rootId: string) {
  const departments: Array<Record<string, unknown>> = [];
  const employees: Array<Record<string, unknown>> = [];

  async function collect(deptId: string) {
    const dept = await prisma.department.findUnique({
      where: { id: deptId },
      include: { employees: true },
    });
    if (!dept) return;

    departments.push({
      id: dept.id,
      scenarioId: dept.scenarioId,
      parentId: dept.parentId,
      name: dept.name,
      cfo: dept.cfo,
      shetilType: dept.shetilType,
      headId: dept.headId,
      sortOrder: dept.sortOrder,
      originId: dept.originId,
    });

    for (const emp of dept.employees) {
      employees.push({
        id: emp.id,
        scenarioId: emp.scenarioId,
        departmentId: emp.departmentId,
        fullName: emp.fullName,
        position: emp.position,
        category: emp.category,
        fte: emp.fte.toString(),
        originId: emp.originId,
      });
    }

    const children = await prisma.department.findMany({
      where: { parentId: deptId },
      select: { id: true },
    });
    for (const child of children) {
      await collect(child.id);
    }
  }

  await collect(rootId);
  return { departments, employees };
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cascade = req.nextUrl.searchParams.get("cascade") === "true";
  const reparent = req.nextUrl.searchParams.get("reparent") === "true";

  // Get the department to find its parentId and scenarioId
  const dept = await prisma.department.findUnique({
    where: { id },
    select: { parentId: true, scenarioId: true },
  });
  if (!dept) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (reparent) {
    // Snapshot the department being deleted (not its children - they survive)
    const snapshot = await prisma.department.findUnique({
      where: { id },
      include: { employees: true },
    });
    const childIds = (
      await prisma.department.findMany({
        where: { parentId: id },
        select: { id: true },
      })
    ).map((c) => c.id);

    // Reparent: move children up to deleted node's parent, then delete
    await prisma.department.updateMany({
      where: { parentId: id },
      data: { parentId: dept.parentId },
    });

    // Clear headId and delete
    await prisma.department
      .update({ where: { id }, data: { headId: null } })
      .catch(() => {});
    await prisma.department.delete({ where: { id } });

    // Log action
    if (snapshot) {
      await logAction(
        dept.scenarioId,
        "delete_department_reparent",
        { departmentId: id },
        {
          departments: [
            {
              id: snapshot.id,
              scenarioId: snapshot.scenarioId,
              parentId: snapshot.parentId,
              name: snapshot.name,
              cfo: snapshot.cfo,
              shetilType: snapshot.shetilType,
              headId: snapshot.headId,
              sortOrder: snapshot.sortOrder,
              originId: snapshot.originId,
            },
          ],
          employees: snapshot.employees.map((e) => ({
            id: e.id,
            scenarioId: e.scenarioId,
            departmentId: e.departmentId,
            fullName: e.fullName,
            position: e.position,
            category: e.category,
            fte: e.fte.toString(),
            originId: e.originId,
          })),
          childIds,
        }
      );
    }

    return NextResponse.json({ success: true });
  }

  if (cascade) {
    // Snapshot entire subtree before deleting
    const snapshot = await collectSubtreeSnapshot(id);

    // Cascade: recursively delete all descendants depth-first
    async function deleteDescendants(parentId: string) {
      const children = await prisma.department.findMany({
        where: { parentId },
        select: { id: true },
      });
      for (const child of children) {
        await deleteDescendants(child.id);
        await prisma.department
          .update({ where: { id: child.id }, data: { headId: null } })
          .catch(() => {});
        await prisma.department.delete({ where: { id: child.id } });
      }
    }
    await deleteDescendants(id);

    // Clear headId and delete
    await prisma.department
      .update({ where: { id }, data: { headId: null } })
      .catch(() => {});
    await prisma.department.delete({ where: { id } });

    // Log action
    await logAction(
      dept.scenarioId,
      "delete_department_cascade",
      { departmentId: id },
      snapshot
    );

    return NextResponse.json({ success: true });
  }

  // Simple delete (no children)
  const childCount = await prisma.department.count({ where: { parentId: id } });
  if (childCount > 0) {
    return NextResponse.json(
      { error: "Нельзя удалить подразделение с дочерними элементами", childCount },
      { status: 400 }
    );
  }

  // Snapshot for undo
  const snapshot = await collectSubtreeSnapshot(id);

  // Clear headId and delete
  await prisma.department
    .update({ where: { id }, data: { headId: null } })
    .catch(() => {});
  await prisma.department.delete({ where: { id } });

  // Log action
  await logAction(
    dept.scenarioId,
    "delete_department",
    { departmentId: id },
    snapshot
  );

  return NextResponse.json({ success: true });
}
