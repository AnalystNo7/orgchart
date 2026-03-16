import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversation = await prisma.aiConversation.findUnique({
    where: { id },
  });
  if (!conversation) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(conversation);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.aiConversation.delete({ where: { id } });
  return Response.json({ ok: true });
}
