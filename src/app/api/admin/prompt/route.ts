import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  DEFAULT_METHODOLOGY_PROMPT,
  buildTechnicalPrompt,
} from "@/lib/ai/system-prompt";

const updatePromptSchema = z.object({
  content: z
    .string()
    .min(1, "Промпт не может быть пустым")
    .max(50000, "Промпт слишком длинный (максимум 50000 символов)"),
});

function dbErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  const msg = e instanceof Error ? e.message : String(e);
  if (code === "P2021" || msg.includes("does not exist in the current database")) {
    return "Таблица AiPromptSetting отсутствует в БД — выполните `npx prisma migrate dev` и перезапустите dev-сервер.";
  }
  if (msg.includes("Cannot read properties of undefined")) {
    return "Prisma-клиент не знает модель AiPromptSetting — выполните `npx prisma generate` и перезапустите dev-сервер.";
  }
  return `Ошибка базы данных: ${msg.slice(0, 300)}`;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const row = await prisma.aiPromptSetting.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({
      content: row?.content ?? DEFAULT_METHODOLOGY_PROMPT,
      isCustom: row !== null,
      defaultContent: DEFAULT_METHODOLOGY_PROMPT,
      technicalContent: buildTechnicalPrompt(),
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: dbErrorMessage(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updatePromptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Некорректные данные" },
      { status: 400 }
    );
  }

  try {
    // Single-row table: update the existing row if any, else create the first.
    const existing = await prisma.aiPromptSetting.findFirst();
    const row = existing
      ? await prisma.aiPromptSetting.update({
          where: { id: existing.id },
          data: { content: parsed.data.content },
        })
      : await prisma.aiPromptSetting.create({
          data: { content: parsed.data.content },
        });
    return NextResponse.json({ isCustom: true, updatedAt: row.updatedAt });
  } catch (e) {
    return NextResponse.json({ error: dbErrorMessage(e) }, { status: 500 });
  }
}

export async function DELETE() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Reset to default = no row at all.
    await prisma.aiPromptSetting.deleteMany();
    return NextResponse.json({
      content: DEFAULT_METHODOLOGY_PROMPT,
      isCustom: false,
    });
  } catch (e) {
    return NextResponse.json({ error: dbErrorMessage(e) }, { status: 500 });
  }
}
