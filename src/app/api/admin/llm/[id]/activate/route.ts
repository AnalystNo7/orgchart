import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toLlmSettingDto } from "@/lib/llm-settings";

/**
 * POST /api/admin/llm/[id]/activate — make this preset the single active one.
 * Takes effect immediately: getLlm() reads the DB per request, no redeploy.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const [, activated] = await prisma.$transaction([
      prisma.llmSetting.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      }),
      prisma.llmSetting.update({
        where: { id },
        data: { isActive: true },
      }),
    ]);
    return NextResponse.json(toLlmSettingDto(activated));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Настройка не найдена" }, { status: 404 });
    }
    throw e;
  }
}
