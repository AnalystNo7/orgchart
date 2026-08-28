import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET — list diagrams for a process
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const processId = searchParams.get("processId");

  if (!processId) {
    return NextResponse.json({ error: "processId required" }, { status: 400 });
  }

  const diagrams = await prisma.processDiagram.findMany({
    where: { processId },
    include: {
      _count: { select: { steps: true, links: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ diagrams });
}

// POST — create a new diagram
export async function POST(request: Request) {
  const body = await request.json();
  const { processId, type, name } = body;

  if (!processId || !type) {
    return NextResponse.json({ error: "processId and type required" }, { status: 400 });
  }

  const diagram = await prisma.processDiagram.create({
    data: {
      processId,
      type,
      name: name || null,
    },
    include: { steps: true, links: true },
  });

  return NextResponse.json({ diagram }, { status: 201 });
}
