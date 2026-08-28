import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const scenarioId = req.nextUrl.searchParams.get("scenarioId");
  if (!scenarioId) {
    return Response.json({ error: "scenarioId required" }, { status: 400 });
  }

  const conversations = await prisma.aiConversation.findMany({
    where: { scenarioId },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return Response.json(conversations);
}
