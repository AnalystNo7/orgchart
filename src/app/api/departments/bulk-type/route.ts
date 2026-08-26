import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { bulkUpdateTypeSchema } from "@/lib/validations/department";
import { logAction } from "@/lib/action-logger";

/**
 * Массовая смена типа ШЕТИЛ для выделенных на дашборде подразделений.
 * Одна запись в журнале действий — вся пачка откатывается одним Ctrl+Z.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const parsed = bulkUpdateTypeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { scenarioId, departmentIds, shetilType } = parsed.data;

  const previous = await prisma.department.findMany({
    where: { id: { in: departmentIds }, scenarioId },
    select: { id: true, shetilType: true },
  });

  if (previous.length === 0) {
    return NextResponse.json(
      { error: "Подразделения не найдены в сценарии" },
      { status: 404 }
    );
  }

  const foundIds = previous.map((d) => d.id);

  await prisma.department.updateMany({
    where: { id: { in: foundIds } },
    data: { shetilType },
  });

  await logAction(
    scenarioId,
    "bulk_update_department_type",
    { departmentIds: foundIds, shetilType },
    { previous }
  );

  return NextResponse.json({ updated: previous.length, shetilType });
}
