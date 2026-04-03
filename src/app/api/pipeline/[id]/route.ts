import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// PUT — update pipeline deal
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, clientId, amount, probability, stage, expectedCloseDate, description } = body;

  const deal = await prisma.pipelineDeal.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(clientId !== undefined && { clientId }),
      ...(amount !== undefined && { amount }),
      ...(probability !== undefined && { probability }),
      ...(stage !== undefined && { stage }),
      ...(expectedCloseDate !== undefined && { expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null }),
      ...(description !== undefined && { description: description || null }),
    },
    include: {
      client: { select: { id: true, name: true, status: true } },
    },
  });

  return NextResponse.json({ deal });
}

// DELETE — delete pipeline deal
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.pipelineDeal.delete({ where: { id } });
  return NextResponse.json({ message: "Сделка удалена" });
}
