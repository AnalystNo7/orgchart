import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const department = await prisma.department.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!department) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const metrics = await prisma.employee.groupBy({
    by: ["category"],
    where: { departmentId: id },
    _count: true,
    _sum: { fte: true },
  });

  const pp = metrics.find((m) => m.category === "PP")?._count ?? 0;
  const opp = metrics.find((m) => m.category === "OPP")?._count ?? 0;
  const aup = metrics.find((m) => m.category === "AUP")?._count ?? 0;
  const totalFte = metrics.reduce(
    (sum, m) => sum + (Number(m._sum.fte) || 0),
    0
  );
  const total = pp + opp + aup;

  return NextResponse.json({ pp, opp, aup, total, totalFte });
}
