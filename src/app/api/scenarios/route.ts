import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createScenarioSchema } from "@/lib/validations/scenario";

export async function GET() {
  const scenarios = await prisma.scenario.findMany({
    orderBy: [{ isBaseline: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { departments: true, employees: true } },
      createdFrom: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(scenarios);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createScenarioSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const scenario = await prisma.scenario.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      status: "DRAFT",
    },
  });

  return NextResponse.json(scenario, { status: 201 });
}
