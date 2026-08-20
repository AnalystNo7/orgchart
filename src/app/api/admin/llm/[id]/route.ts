import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateLlmSettingSchema } from "@/lib/validations/llm-setting";
import { toLlmSettingDto, llmDbErrorMessage } from "@/lib/llm-settings";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateLlmSettingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Некорректные данные" },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.llmSetting.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Настройка не найдена" }, { status: 404 });
    }

    const { name, provider, baseUrl, apiKey, model, temperature, maxOutputTokens, timeoutSec, toolResultMaxBytes } =
      parsed.data;

    const setting = await prisma.llmSetting.update({
      where: { id },
      data: {
        name,
        provider,
        baseUrl: baseUrl ?? null,
        model,
        temperature: temperature ?? null,
        maxOutputTokens: maxOutputTokens ?? null,
        timeoutSec,
        toolResultMaxBytes: toolResultMaxBytes ?? null,
        // Empty/missing key = keep the stored one
        ...(apiKey ? { apiKey } : {}),
      },
    });

    return NextResponse.json(toLlmSettingDto(setting));
  } catch (e) {
    return NextResponse.json({ error: llmDbErrorMessage(e) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.llmSetting.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Настройка не найдена" }, { status: 404 });
  }

  if (existing.isActive) {
    return NextResponse.json(
      { error: "Нельзя удалить активную настройку. Сначала активируйте другую." },
      { status: 409 }
    );
  }

  await prisma.llmSetting.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
