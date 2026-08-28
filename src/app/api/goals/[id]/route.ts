import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const goalInclude = {
  kpis: true,
  departments: { include: { department: { select: { id: true, name: true } } } },
  owner: { select: { id: true, fullName: true, position: true } },
  children: {
    include: { kpis: true },
    orderBy: { sortOrder: "asc" as const },
  },
  _count: { select: { children: true } },
};

// GET — goal details
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const goal = await prisma.goal.findUnique({
    where: { id },
    include: goalInclude,
  });

  if (!goal) {
    return NextResponse.json({ error: "Цель не найдена" }, { status: 404 });
  }

  return NextResponse.json({ goal });
}

// PUT — update goal
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const {
    name, description, type, status, weight, progress,
    ownerId, deadline, period, parentId, sortOrder,
    kpis, departmentIds,
  } = body;

  const result = await prisma.$transaction(async (tx) => {
    await tx.goal.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(type !== undefined && { type }),
        ...(status !== undefined && { status }),
        ...(weight !== undefined && { weight }),
        ...(progress !== undefined && { progress }),
        ...(ownerId !== undefined && { ownerId: ownerId || null }),
        ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
        ...(period !== undefined && { period: period || null }),
        ...(parentId !== undefined && { parentId: parentId || null }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });

    if (kpis !== undefined) {
      await tx.goalKpi.deleteMany({ where: { goalId: id } });
      if (kpis.length) {
        await tx.goalKpi.createMany({
          data: kpis.map((k: { name: string; unit: string; targetValue: number; currentValue?: number; weight?: number }) => ({
            goalId: id,
            name: k.name,
            unit: k.unit,
            targetValue: k.targetValue,
            currentValue: k.currentValue ?? 0,
            weight: k.weight ?? 1.0,
          })),
        });
      }
    }

    if (departmentIds !== undefined) {
      await tx.goalDepartmentLink.deleteMany({ where: { goalId: id } });
      if (departmentIds.length) {
        await tx.goalDepartmentLink.createMany({
          data: departmentIds.map((dId: string) => ({ goalId: id, departmentId: dId })),
        });
      }
    }

    return tx.goal.findUnique({
      where: { id },
      include: {
        kpis: true,
        departments: { include: { department: { select: { id: true, name: true } } } },
        owner: { select: { id: true, fullName: true, position: true } },
        _count: { select: { children: true } },
      },
    });
  });

  return NextResponse.json({ goal: result });
}

// DELETE — delete goal
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.goal.delete({ where: { id } });
  return NextResponse.json({ message: "Цель удалена" });
}
