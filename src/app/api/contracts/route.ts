import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createContractSchema } from "@/lib/validations/contract";
import { logAction } from "@/lib/action-logger";
import { getWorkingHours } from "@/lib/work-calendar";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const search = req.nextUrl.searchParams.get("search");

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (search) where.name = { contains: search, mode: "insensitive" };

  const contracts = await prisma.contract.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { employees: true } },
      employees: {
        include: {
          employee: {
            include: { tariff: true },
          },
        },
      },
    },
  });

  // Calculate amounts for auto-calc contracts
  const result = contracts.map((contract) => {
    const { employees, ...rest } = contract;

    if (contract.amountAutoCalc && employees.length > 0) {
      const workingHours = getWorkingHours(contract.periodStart, contract.periodEnd);
      let calculatedAmount = 0;

      for (const ec of employees) {
        const tariffRate = ec.employee.tariff?.rate
          ? Number(ec.employee.tariff.rate)
          : null;
        if (tariffRate !== null) {
          calculatedAmount += tariffRate * Number(ec.fte) * workingHours;
        }
      }

      calculatedAmount = Math.round(calculatedAmount * 100) / 100;

      if (contract.status === "CONCLUDED") {
        return { ...rest, amount: calculatedAmount };
      } else {
        return { ...rest, expectedAmount: calculatedAmount };
      }
    }

    return rest;
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createContractSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const contract = await prisma.contract.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      status: parsed.data.status,
      amount: parsed.data.amount,
      expectedAmount: parsed.data.expectedAmount,
      amountAutoCalc: parsed.data.amountAutoCalc,
      periodStart: new Date(parsed.data.periodStart),
      periodEnd: new Date(parsed.data.periodEnd),
      description: parsed.data.description,
    },
  });

  await logAction(
    null,
    "create_contract",
    {
      contract: {
        id: contract.id,
        name: contract.name,
        type: contract.type,
        status: contract.status,
        amount: contract.amount?.toString(),
        expectedAmount: contract.expectedAmount?.toString(),
        amountAutoCalc: contract.amountAutoCalc,
        periodStart: contract.periodStart.toISOString(),
        periodEnd: contract.periodEnd.toISOString(),
        description: contract.description,
      },
    },
    { contractId: contract.id }
  );

  return NextResponse.json(contract, { status: 201 });
}
