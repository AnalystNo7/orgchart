import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const budgetInclude = {
  lines: {
    include: { department: { select: { id: true, name: true } } },
    orderBy: { category: "asc" as const },
  },
  _count: { select: { lines: true } },
};

// GET — list budgets for a scenario
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenarioId");

  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId required" }, { status: 400 });
  }

  const type = searchParams.get("type");
  const status = searchParams.get("status");

  const budgets = await prisma.budget.findMany({
    where: {
      scenarioId,
      ...(type && { type: type as never }),
      ...(status && { status: status as never }),
    },
    include: budgetInclude,
    orderBy: [{ periodStart: "desc" }, { name: "asc" }],
  });

  // Compute totals per budget
  const enriched = budgets.map((b) => {
    const totalPlanned = b.lines.reduce((s, l) => s + l.plannedAmount, 0);
    const totalActual = b.lines.reduce((s, l) => s + l.actualAmount, 0);
    return { ...b, totalPlanned, totalActual, variance: totalPlanned - totalActual };
  });

  return NextResponse.json({ budgets: enriched });
}

// POST — create budget with lines
export async function POST(request: Request) {
  const body = await request.json();
  const { scenarioId, name, type, status, periodStart, periodEnd, description, lines } = body;

  if (!scenarioId || !name || !type || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "scenarioId, name, type, periodStart, periodEnd are required" },
      { status: 400 }
    );
  }

  const budget = await prisma.budget.create({
    data: {
      scenarioId,
      name,
      type,
      status: status || "DRAFT",
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      description: description || null,
      ...(lines?.length && {
        lines: {
          create: lines.map((l: { departmentId: string; category: string; plannedAmount?: number; actualAmount?: number; description?: string }) => ({
            departmentId: l.departmentId,
            category: l.category,
            plannedAmount: l.plannedAmount ?? 0,
            actualAmount: l.actualAmount ?? 0,
            description: l.description || null,
          })),
        },
      }),
    },
    include: budgetInclude,
  });

  return NextResponse.json({ budget }, { status: 201 });
}
