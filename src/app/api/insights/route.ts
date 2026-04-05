import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runHealthCheck } from "@/lib/org-analyzer";

// GET — list insights for a scenario
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenarioId");
  const resolved = searchParams.get("resolved");

  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId required" }, { status: 400 });
  }

  const insights = await prisma.aIInsight.findMany({
    where: {
      scenarioId,
      ...(resolved !== null && { resolved: resolved === "true" }),
    },
    include: { recommendations: { orderBy: { priority: "asc" } } },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ insights });
}

// POST — run health check (generate new insights)
export async function POST(request: Request) {
  const body = await request.json();
  const { scenarioId } = body;

  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId required" }, { status: 400 });
  }

  const result = await runHealthCheck(scenarioId);
  return NextResponse.json(result, { status: 201 });
}
