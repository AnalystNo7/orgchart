import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateContractSchema } from "@/lib/validations/contract";
import { logAction } from "@/lib/action-logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      employees: {
        include: {
          employee: { select: { id: true, fullName: true, position: true } },
        },
      },
    },
  });

  if (!contract) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(contract);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = updateContractSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const previous = await prisma.contract.findUnique({ where: { id } });
  if (!previous) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.periodStart) data.periodStart = new Date(parsed.data.periodStart);
  if (parsed.data.periodEnd) data.periodEnd = new Date(parsed.data.periodEnd);

  const contract = await prisma.contract.update({
    where: { id },
    data,
  });

  await logAction(
    null,
    "update_contract",
    { contractId: id, changes: parsed.data },
    {
      contractId: id,
      previousValues: {
        name: previous.name,
        type: previous.type,
        status: previous.status,
        amount: previous.amount?.toString(),
        expectedAmount: previous.expectedAmount?.toString(),
        amountAutoCalc: previous.amountAutoCalc,
        periodStart: previous.periodStart.toISOString(),
        periodEnd: previous.periodEnd.toISOString(),
        description: previous.description,
      },
    }
  );

  return NextResponse.json(contract);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get associated employee contracts for undo
  const employeeContracts = await prisma.employeeContract.findMany({
    where: { contractId: id },
  });

  await prisma.contract.delete({ where: { id } });

  await logAction(
    null,
    "delete_contract",
    { contractId: id },
    {
      contract: {
        id: contract.id,
        name: contract.name,
        type: contract.type,
        status: contract.status,
        amount: contract.amount?.toString(),
        expectedAmount: contract.expectedAmount?.toString(),
        periodStart: contract.periodStart.toISOString(),
        periodEnd: contract.periodEnd.toISOString(),
        description: contract.description,
      },
      employeeContracts: employeeContracts.map((ec) => ({
        id: ec.id,
        employeeId: ec.employeeId,
        contractId: ec.contractId,
        revenueStatus: ec.revenueStatus,
        fte: ec.fte.toString(),
        periodStart: ec.periodStart.toISOString(),
        periodEnd: ec.periodEnd.toISOString(),
      })),
    }
  );

  return NextResponse.json({ success: true });
}
