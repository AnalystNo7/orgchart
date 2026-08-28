import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const gap = await prisma.gapPassport.findUnique({ where: { id } });
  if (!gap) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(gap);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const gap = await prisma.gapPassport.update({
    where: { id },
    data: body,
  });

  return Response.json(gap);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.gapPassport.delete({ where: { id } });
  return Response.json({ ok: true });
}
