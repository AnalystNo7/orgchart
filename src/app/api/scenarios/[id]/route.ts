import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { updateScenarioSchema } from "@/lib/validations/scenario";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const scenario = await prisma.scenario.findUnique({
    where: { id },
    include: {
      _count: { select: { departments: true, employees: true } },
      createdFrom: { select: { id: true, name: true } },
    },
  });

  if (!scenario) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(scenario);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = updateScenarioSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { columnNames, ...rest } = parsed.data;
  const data: Prisma.ScenarioUpdateInput = { ...rest };
  if (columnNames !== undefined) {
    data.columnNames = columnNames === null ? Prisma.JsonNull : columnNames;
  }

  const scenario = await prisma.scenario.update({
    where: { id },
    data,
  });

  return NextResponse.json(scenario);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const scenario = await prisma.scenario.findUnique({ where: { id } });

  if (!scenario) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (scenario.isBaseline) {
    return NextResponse.json(
      { error: "Нельзя удалить базовый сценарий" },
      { status: 400 }
    );
  }

  await prisma.scenario.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
