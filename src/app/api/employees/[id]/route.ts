import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateEmployeeSchema } from "@/lib/validations/employee";
import { logAction } from "@/lib/action-logger";

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

  // Snapshot current state for undo
  const previous = await prisma.employee.findUnique({
    where: { id },
    select: { fullName: true, position: true, category: true, fte: true, scenarioId: true },
  });

  const employee = await prisma.employee.update({
    where: { id },
    data: parsed.data,
    include: {
      department: { select: { id: true, name: true } },
    },
  });

  // Log action for undo
  if (previous) {
    await logAction(
      previous.scenarioId,
      "update_employee",
      { employeeId: id, changes: parsed.data },
      {
        employeeId: id,
        previousValues: {
          fullName: previous.fullName,
          position: previous.position,
          category: previous.category,
          fte: previous.fte.toString(),
        },
      }
    );
  }

  return NextResponse.json(employee);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Snapshot for undo
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check if employee is head of any department
  const headOfDepts = await prisma.department.findMany({
    where: { headId: id },
    select: { id: true },
  });
  for (const dept of headOfDepts) {
    await prisma.department.update({
      where: { id: dept.id },
      data: { headId: null },
    });
  }

  await prisma.employee.delete({ where: { id } });

  // Log action for undo
  await logAction(
    employee.scenarioId,
    "delete_employee",
    { employeeId: id },
    {
      employee: {
        id: employee.id,
        scenarioId: employee.scenarioId,
        departmentId: employee.departmentId,
        fullName: employee.fullName,
        position: employee.position,
        category: employee.category,
        fte: employee.fte.toString(),
        originId: employee.originId,
      },
      wasHeadOf: headOfDepts.map((d) => d.id),
    }
  );

  return NextResponse.json({ success: true });
}
