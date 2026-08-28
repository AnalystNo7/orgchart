import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const scenarioId = req.nextUrl.searchParams.get("scenarioId");
  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
  }

  const canUndo = await prisma.actionLog.count({
    where: { scenarioId, undone: false },
  });
  const canRedo = await prisma.actionLog.count({
    where: { scenarioId, undone: true },
  });

  return NextResponse.json({ canUndo: canUndo > 0, canRedo: canRedo > 0 });
}
