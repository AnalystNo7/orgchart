import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// DELETE — remove employee competency
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.employeeCompetency.delete({ where: { id } });
  return NextResponse.json({ message: "Удалено" });
}
