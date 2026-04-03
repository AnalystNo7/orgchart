import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET — list pipeline deals
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenarioId");
  const stage = searchParams.get("stage");
  const clientId = searchParams.get("clientId");

  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId required" }, { status: 400 });
  }

  const deals = await prisma.pipelineDeal.findMany({
    where: {
      scenarioId,
      ...(stage && { stage: stage as never }),
      ...(clientId && { clientId }),
    },
    include: {
      client: { select: { id: true, name: true, status: true } },
    },
    orderBy: [{ stage: "asc" }, { amount: "desc" }],
  });

  return NextResponse.json({ deals });
}

// POST — create pipeline deal
export async function POST(request: Request) {
  const body = await request.json();
  const { scenarioId, clientId, name, amount, probability, stage, expectedCloseDate, description } = body;

  if (!scenarioId || !clientId || !name) {
    return NextResponse.json(
      { error: "scenarioId, clientId, and name are required" },
      { status: 400 }
    );
  }

  const deal = await prisma.pipelineDeal.create({
    data: {
      scenarioId,
      clientId,
      name,
      amount: amount ?? 0,
      probability: probability ?? 50,
      stage: stage || "LEAD",
      expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
      description: description || null,
    },
    include: {
      client: { select: { id: true, name: true, status: true } },
    },
  });

  return NextResponse.json({ deal }, { status: 201 });
}
