import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET — list role competency requirements (filter by position)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const position = searchParams.get("position");

  const where: Record<string, unknown> = {};
  if (position) where.position = position;

  const records = await prisma.roleCompetency.findMany({
    where,
    include: {
      competency: { select: { id: true, name: true, category: true } },
    },
    orderBy: { position: "asc" },
  });

  return NextResponse.json({ records });
}

// POST — set role competency requirement (upsert)
export async function POST(request: Request) {
  const body = await request.json();
  const { competencyId, position, requiredLevel } = body;

  if (!competencyId || !position) {
    return NextResponse.json({ error: "competencyId and position required" }, { status: 400 });
  }

  const record = await prisma.roleCompetency.upsert({
    where: {
      competencyId_position: { competencyId, position },
    },
    create: {
      competencyId,
      position,
      requiredLevel: Math.min(5, Math.max(1, requiredLevel || 3)),
    },
    update: {
      requiredLevel: Math.min(5, Math.max(1, requiredLevel || 3)),
    },
  });

  return NextResponse.json({ record });
}
