import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET — competency with role requirements and employee assessments
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const competency = await prisma.competency.findUnique({
    where: { id },
    include: {
      roleCompetencies: { orderBy: { position: "asc" } },
      employeeCompetencies: {
        include: { employee: { select: { id: true, fullName: true, position: true, departmentId: true } } },
      },
    },
  });

  if (!competency) {
    return NextResponse.json({ error: "Компетенция не найдена" }, { status: 404 });
  }

  return NextResponse.json({ competency });
}

// PUT — update competency
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, category, description } = body;

  const competency = await prisma.competency.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(category !== undefined && { category }),
      ...(description !== undefined && { description }),
    },
  });

  return NextResponse.json({ competency });
}

// DELETE — delete competency
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.competency.delete({ where: { id } });
  return NextResponse.json({ message: "Компетенция удалена" });
}
