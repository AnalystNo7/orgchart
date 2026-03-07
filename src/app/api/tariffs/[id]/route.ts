import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateTariffSchema } from "@/lib/validations/tariff";
import { logAction } from "@/lib/action-logger";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = updateTariffSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const previous = await prisma.tariff.findUnique({ where: { id } });
  if (!previous) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tariff = await prisma.tariff.update({
    where: { id },
    data: parsed.data,
  });

  await logAction(
    null,
    "update_tariff",
    { tariffId: id, changes: parsed.data },
    {
      tariffId: id,
      previousValues: {
        rate: previous.rate.toString(),
        description: previous.description,
      },
    }
  );

  return NextResponse.json(tariff);
}
