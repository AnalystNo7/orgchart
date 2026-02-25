import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateEmployeeSchema } from "@/lib/validations/employee";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
    },
  });

  if (!employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(employee);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = updateEmployeeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const employee = await prisma.employee.update({
    where: { id },
    data: parsed.data,
    include: {
      department: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(employee);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Check if employee is head of any department
  const headOf = await prisma.department.findFirst({ where: { headId: id } });
  if (headOf) {
    // Remove headId reference before deleting
    await prisma.department.update({
      where: { id: headOf.id },
      data: { headId: null },
    });
  }

  await prisma.employee.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
