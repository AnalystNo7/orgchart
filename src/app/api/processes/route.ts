import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET — list processes for a scenario
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenarioId");

  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId required" }, { status: 400 });
  }

  const processes = await prisma.process.findMany({
    where: { scenarioId },
    include: {
      kpis: true,
      participants: true,
      _count: { select: { children: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ processes });
}

// POST — create a process
export async function POST(request: Request) {
  const body = await request.json();
  const { scenarioId, parentId, name, description, level, status, ownerDeptId, sortOrder } = body;

  if (!scenarioId || !name || !level) {
    return NextResponse.json(
      { error: "scenarioId, name, and level are required" },
      { status: 400 }
    );
  }

  const process = await prisma.process.create({
    data: {
      scenarioId,
      parentId: parentId || null,
      name,
      description: description || null,
      level,
      status: status || "ACTIVE",
      ownerDeptId: ownerDeptId || null,
      sortOrder: sortOrder || 0,
    },
    include: { kpis: true, participants: true },
  });

  return NextResponse.json({ process }, { status: 201 });
}
