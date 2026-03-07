import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEmployeeContractSchema } from "@/lib/validations/employee-contract";
import { logAction } from "@/lib/action-logger";

export async function GET(req: NextRequest) {
  const employeeId = req.nextUrl.searchParams.get("employeeId");

  if (!employeeId) {
    return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
  }

  const contracts = await prisma.employeeContract.findMany({
    where: { employeeId },
    include: {
      contract: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(contracts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createEmployeeContractSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Validate period is within contract period
  const contract = await prisma.contract.findUnique({
    where: { id: parsed.data.contractId },
  });

  if (!contract) {
    return NextResponse.json({ error: "Договор не найден" }, { status: 404 });
  }

  const periodStart = new Date(parsed.data.periodStart);
  const periodEnd = new Date(parsed.data.periodEnd);

  if (periodStart < contract.periodStart || periodEnd > contract.periodEnd) {
    return NextResponse.json(
      { error: "Период обеспечения не должен выходить за срок договора" },
      { status: 400 }
    );
  }

  const employeeContract = await prisma.employeeContract.create({
    data: {
      employeeId: parsed.data.employeeId,
      contractId: parsed.data.contractId,
      revenueStatus: parsed.data.revenueStatus,
      fte: parsed.data.fte,
      periodStart,
      periodEnd,
    },
    include: {
      contract: true,
    },
  });

  // Get employee's scenarioId for action log
  const employee = await prisma.employee.findUnique({
    where: { id: parsed.data.employeeId },
    select: { scenarioId: true },
  });

  await logAction(
    employee?.scenarioId ?? null,
    "create_employee_contract",
    {
      employeeContract: {
        id: employeeContract.id,
        employeeId: employeeContract.employeeId,
        contractId: employeeContract.contractId,
        revenueStatus: employeeContract.revenueStatus,
        fte: employeeContract.fte.toString(),
        periodStart: employeeContract.periodStart.toISOString(),
        periodEnd: employeeContract.periodEnd.toISOString(),
      },
    },
    { employeeContractId: employeeContract.id }
  );

  return NextResponse.json(employeeContract, { status: 201 });
}
