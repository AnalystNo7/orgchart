import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const goalInclude = {
  kpis: true,
  departments: { include: { department: { select: { id: true, name: true } } } },
  owner: { select: { id: true, fullName: true, position: true } },
  _count: { select: { children: true } },
};

// GET — list goals for a scenario
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenarioId");

  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId required" }, { status: 400 });
  }

  const type = searchParams.get("type");
  const status = searchParams.get("status");

  const goals = await prisma.goal.findMany({
    where: {
      scenarioId,
      ...(type && { type: type as never }),
      ...(status && { status: status as never }),
    },
    include: goalInclude,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ goals });
}

// POST — create a goal
export async function POST(request: Request) {
  const body = await request.json();
  const {
    scenarioId, parentId, name, description, type,
    status, weight, progress, ownerId, deadline,
    period, sortOrder, kpis, departmentIds,
  } = body;

  if (!scenarioId || !name || !type) {
    return NextResponse.json(
      { error: "scenarioId, name, and type are required" },
      { status: 400 }
    );
  }

  const goal = await prisma.goal.create({
    data: {
      scenarioId,
      parentId: parentId || null,
      name,
      description: description || null,
      type,
      status: status || "NOT_STARTED",
      weight: weight ?? 1.0,
      progress: progress ?? 0,
      ownerId: ownerId || null,
      deadline: deadline ? new Date(deadline) : null,
      period: period || null,
      sortOrder: sortOrder ?? 0,
      ...(kpis?.length && {
        kpis: {
          create: kpis.map((k: { name: string; unit: string; targetValue: number; currentValue?: number; weight?: number }) => ({
            name: k.name,
            unit: k.unit,
            targetValue: k.targetValue,
            currentValue: k.currentValue ?? 0,
            weight: k.weight ?? 1.0,
          })),
        },
      }),
      ...(departmentIds?.length && {
        departments: {
          create: departmentIds.map((dId: string) => ({ departmentId: dId })),
        },
      }),
    },
    include: goalInclude,
  });

  return NextResponse.json({ goal }, { status: 201 });
}
