import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET — list KPIs for a process
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const kpis = await prisma.processKpi.findMany({
    where: { processId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ kpis });
}

// POST — add KPI to process
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, targetValue, currentValue, unit, description } = body;

  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const kpi = await prisma.processKpi.create({
    data: {
      processId: id,
      name,
      targetValue: targetValue || null,
      currentValue: currentValue || null,
      unit: unit || null,
      description: description || null,
    },
  });

  return NextResponse.json({ kpi }, { status: 201 });
}
