import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET — budget details
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const budget = await prisma.budget.findUnique({
    where: { id },
    include: {
      lines: {
        include: { department: { select: { id: true, name: true } } },
        orderBy: { category: "asc" },
      },
    },
  });

  if (!budget) {
    return NextResponse.json({ error: "Бюджет не найден" }, { status: 404 });
  }

  return NextResponse.json({ budget });
}

// PUT — update budget + lines
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, type, status, periodStart, periodEnd, description, lines } = body;

  const result = await prisma.$transaction(async (tx) => {
    await tx.budget.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(status !== undefined && { status }),
        ...(periodStart !== undefined && { periodStart: new Date(periodStart) }),
        ...(periodEnd !== undefined && { periodEnd: new Date(periodEnd) }),
        ...(description !== undefined && { description: description || null }),
      },
    });

    if (lines !== undefined) {
      await tx.budgetLine.deleteMany({ where: { budgetId: id } });
      if (lines.length) {
        await tx.budgetLine.createMany({
          data: lines.map((l: { departmentId: string; category: string; plannedAmount?: number; actualAmount?: number; description?: string }) => ({
            budgetId: id,
            departmentId: l.departmentId,
            category: l.category,
            plannedAmount: l.plannedAmount ?? 0,
            actualAmount: l.actualAmount ?? 0,
            description: l.description || null,
          })),
        });
      }
    }

    return tx.budget.findUnique({
      where: { id },
      include: {
        lines: {
          include: { department: { select: { id: true, name: true } } },
          orderBy: { category: "asc" },
        },
      },
    });
  });

  return NextResponse.json({ budget: result });
}

// DELETE — delete budget
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.budget.delete({ where: { id } });
  return NextResponse.json({ message: "Бюджет удалён" });
}
