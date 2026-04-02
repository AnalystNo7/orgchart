import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; kpiId: string }> }
) {
  const { kpiId } = await params;

  await prisma.processKpi.delete({ where: { id: kpiId } });
  return NextResponse.json({ message: "KPI удалён" });
}
