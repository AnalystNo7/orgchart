import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET — get process details
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const process = await prisma.process.findUnique({
    where: { id },
    include: {
      kpis: true,
      participants: true,
      children: {
        include: { kpis: true, participants: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!process) {
    return NextResponse.json({ error: "Процесс не найден" }, { status: 404 });
  }

  return NextResponse.json({ process });
}

// PUT — update process
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, description, level, status, ownerDeptId, parentId, sortOrder } = body;

  const process = await prisma.process.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(level !== undefined && { level }),
      ...(status !== undefined && { status }),
      ...(ownerDeptId !== undefined && { ownerDeptId }),
      ...(parentId !== undefined && { parentId }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
    include: { kpis: true, participants: true },
  });

  return NextResponse.json({ process });
}

// DELETE — delete process
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.process.delete({ where: { id } });
  return NextResponse.json({ message: "Процесс удалён" });
}
