import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createContractSchema } from "@/lib/validations/contract";
import { logAction } from "@/lib/action-logger";

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
    },
  });

  return NextResponse.json(contracts);
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
        periodStart: contract.periodStart.toISOString(),
        periodEnd: contract.periodEnd.toISOString(),
        description: contract.description,
      },
    },
    { contractId: contract.id }
  );

  return NextResponse.json(contract, { status: 201 });
}
