import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET — list all competencies
export async function GET() {
  const competencies = await prisma.competency.findMany({
    include: {
      _count: { select: { roleCompetencies: true, employeeCompetencies: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ competencies });
}

// POST — create competency
export async function POST(request: Request) {
  const body = await request.json();
  const { name, category, description } = body;

  if (!name || !category) {
    return NextResponse.json({ error: "name and category required" }, { status: 400 });
  }

  const competency = await prisma.competency.create({
    data: { name, category, description: description || null },
  });

  return NextResponse.json({ competency }, { status: 201 });
}
