import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateDepartmentSchema } from "@/lib/validations/department";

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

  const department = await prisma.department.update({
    where: { id },
    data: parsed.data,
    include: {
      head: { select: { id: true, fullName: true } },
      _count: { select: { employees: true, children: true } },
    },
  });

  return NextResponse.json(department);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cascade = req.nextUrl.searchParams.get("cascade") === "true";

  if (!cascade) {
    const childCount = await prisma.department.count({ where: { parentId: id } });
    if (childCount > 0) {
      return NextResponse.json(
        { error: "Нельзя удалить подразделение с дочерними элементами", childCount },
        { status: 400 }
      );
    }
  } else {
    // Cascade: recursively delete all descendants depth-first
    async function deleteDescendants(parentId: string) {
      const children = await prisma.department.findMany({
        where: { parentId },
        select: { id: true },
      });
      for (const child of children) {
        await deleteDescendants(child.id);
        // Clear headId before deleting (avoids FK constraint)
        await prisma.department
          .update({ where: { id: child.id }, data: { headId: null } })
          .catch(() => {});
        await prisma.department.delete({ where: { id: child.id } });
      }
    }
    await deleteDescendants(id);
  }

  // Clear headId on the department itself before deleting
  await prisma.department
    .update({ where: { id }, data: { headId: null } })
    .catch(() => {});

  await prisma.department.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
