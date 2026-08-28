import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET — list employee competencies (filter by employeeId, competencyId, departmentId, scenarioId)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId");
  const competencyId = searchParams.get("competencyId");
  const departmentId = searchParams.get("departmentId");
  const scenarioId = searchParams.get("scenarioId");

  const where: Record<string, unknown> = {};
  if (employeeId) where.employeeId = employeeId;
  if (competencyId) where.competencyId = competencyId;
  if (departmentId || scenarioId) {
    const empWhere: Record<string, unknown> = {};
    if (departmentId) empWhere.departmentId = departmentId;
    if (scenarioId) empWhere.scenarioId = scenarioId;
    where.employee = empWhere;
  }

  const records = await prisma.employeeCompetency.findMany({
    where,
    include: {
      employee: { select: { id: true, fullName: true, position: true, departmentId: true } },
      competency: { select: { id: true, name: true, category: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ records });
}

// POST — set employee competency level (upsert)
export async function POST(request: Request) {
  const body = await request.json();
  const { employeeId, competencyId, currentLevel } = body;

  if (!employeeId || !competencyId || currentLevel === undefined) {
    return NextResponse.json({ error: "employeeId, competencyId, currentLevel required" }, { status: 400 });
  }

  const record = await prisma.employeeCompetency.upsert({
    where: {
      employeeId_competencyId: { employeeId, competencyId },
    },
    create: {
      employeeId,
      competencyId,
      currentLevel: Math.min(5, Math.max(1, currentLevel)),
    },
    update: {
      currentLevel: Math.min(5, Math.max(1, currentLevel)),
      assessedAt: new Date(),
    },
  });

  return NextResponse.json({ record });
}

// PUT — bulk update employee competencies
export async function PUT(request: Request) {
  const body = await request.json();
  const { updates } = body as {
    updates: Array<{ employeeId: string; competencyId: string; currentLevel: number }>;
  };

  if (!updates || !Array.isArray(updates)) {
    return NextResponse.json({ error: "updates array required" }, { status: 400 });
  }

  const results = [];
  for (const u of updates) {
    const record = await prisma.employeeCompetency.upsert({
      where: {
        employeeId_competencyId: { employeeId: u.employeeId, competencyId: u.competencyId },
      },
      create: {
        employeeId: u.employeeId,
        competencyId: u.competencyId,
        currentLevel: Math.min(5, Math.max(1, u.currentLevel)),
      },
      update: {
        currentLevel: Math.min(5, Math.max(1, u.currentLevel)),
        assessedAt: new Date(),
      },
    });
    results.push(record);
  }

  return NextResponse.json({ updated: results.length });
}
