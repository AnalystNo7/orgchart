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
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Check for children
  const childCount = await prisma.department.count({ where: { parentId: id } });
  if (childCount > 0) {
    return NextResponse.json(
      { error: "Нельзя удалить подразделение с дочерними элементами" },
      { status: 400 }
    );
  }

  await prisma.department.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
