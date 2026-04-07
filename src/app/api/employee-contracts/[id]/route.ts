import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateEmployeeContractSchema } from "@/lib/validations/employee-contract";
import { logAction } from "@/lib/action-logger";
import { recalcContractAmount } from "@/lib/contract-auto-calc";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = updateEmployeeContractSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const previous = await prisma.employeeContract.findUnique({
    where: { id },
    include: { contract: true, employee: { select: { scenarioId: true } } },
  });

  if (!previous) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Validate period against contract
  const periodStart = parsed.data.periodStart
    ? new Date(parsed.data.periodStart)
    : previous.periodStart;
  const periodEnd = parsed.data.periodEnd
    ? new Date(parsed.data.periodEnd)
    : previous.periodEnd;

  if (periodStart < previous.contract.periodStart || periodEnd > previous.contract.periodEnd) {
    return NextResponse.json(
      { error: "Период обеспечения не должен выходить за срок договора" },
      { status: 400 }
    );
  }

  // Check for overlapping periods (exclude current record)
  const overlapping = await prisma.employeeContract.findFirst({
    where: {
      id: { not: id },
      employeeId: previous.employeeId,
      contractId: previous.contractId,
      OR: [
        { periodStart: { lt: periodEnd }, periodEnd: { gt: periodStart } },
      ],
    },
  });

  if (overlapping) {
    return NextResponse.json(
      { error: "Периоды не должны пересекаться" },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.periodStart) data.periodStart = new Date(parsed.data.periodStart);
  if (parsed.data.periodEnd) data.periodEnd = new Date(parsed.data.periodEnd);

  const employeeContract = await prisma.employeeContract.update({
    where: { id },
    data,
    include: { contract: true },
  });

  await logAction(
    previous.employee.scenarioId,
    "update_employee_contract",
    { employeeContractId: id, changes: parsed.data },
    {
      employeeContractId: id,
      previousValues: {
        revenueStatus: previous.revenueStatus,
        fte: previous.fte.toString(),
        periodStart: previous.periodStart.toISOString(),
        periodEnd: previous.periodEnd.toISOString(),
      },
    }
  );

  // Recalculate contract amount if auto-calc is enabled
  await recalcContractAmount(previous.contractId);

  return NextResponse.json(employeeContract);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const ec = await prisma.employeeContract.findUnique({
    where: { id },
    include: { employee: { select: { scenarioId: true } } },
  });

  if (!ec) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contractId = ec.contractId;
  await prisma.employeeContract.delete({ where: { id } });

  // Recalculate contract amount if auto-calc is enabled
  await recalcContractAmount(contractId);

  await logAction(
    ec.employee.scenarioId,
    "delete_employee_contract",
    { employeeContractId: id },
    {
      employeeContract: {
        id: ec.id,
        employeeId: ec.employeeId,
        contractId: ec.contractId,
        revenueStatus: ec.revenueStatus,
        fte: ec.fte.toString(),
        periodStart: ec.periodStart.toISOString(),
        periodEnd: ec.periodEnd.toISOString(),
      },
    }
  );

  return NextResponse.json({ success: true });
}
