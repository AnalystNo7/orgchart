import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { RaciRole } from "@prisma/client";

// GET — get RACI participants for a process
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const participants = await prisma.processParticipant.findMany({
    where: { processId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ participants });
}

// PUT — set RACI for a process (replace all participants)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { participants } = body as {
    participants: Array<{ departmentId: string; role: RaciRole }>;
  };

  if (!participants || !Array.isArray(participants)) {
    return NextResponse.json({ error: "participants array required" }, { status: 400 });
  }

  // Replace all participants in a transaction
  await prisma.$transaction([
    prisma.processParticipant.deleteMany({ where: { processId: id } }),
    ...participants.map((p) =>
      prisma.processParticipant.create({
        data: {
          processId: id,
          departmentId: p.departmentId,
          role: p.role,
        },
      })
    ),
  ]);

  const updated = await prisma.processParticipant.findMany({
    where: { processId: id },
  });

  return NextResponse.json({ participants: updated });
}
