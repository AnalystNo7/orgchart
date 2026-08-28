import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import type { GapCategory, GapPriority } from "@prisma/client";

export async function GET(req: NextRequest) {
  const scenarioId = req.nextUrl.searchParams.get("scenarioId");
  if (!scenarioId) {
    return Response.json({ error: "scenarioId required" }, { status: 400 });
  }

  const gaps = await prisma.gapPassport.findMany({
    where: { scenarioId },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  return Response.json(gaps);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    scenarioId,
    asIsScenarioId,
    toBeScenarioId,
    category,
    title,
    description,
    priority,
    impact,
    affectedDepartmentIds,
    responsibleDeptId,
    estimatedEffort,
  } = body;

  if (!scenarioId || !asIsScenarioId || !toBeScenarioId || !category || !title || !description || !priority) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const gap = await prisma.gapPassport.create({
    data: {
      scenarioId,
      asIsScenarioId,
      toBeScenarioId,
      category: category as GapCategory,
      title,
      description,
      priority: priority as GapPriority,
      impact: impact || null,
      affectedDepartmentIds: affectedDepartmentIds || [],
      responsibleDeptId: responsibleDeptId || null,
      estimatedEffort: estimatedEffort || null,
      aiGenerated: false,
    },
  });

  return Response.json(gap, { status: 201 });
}
