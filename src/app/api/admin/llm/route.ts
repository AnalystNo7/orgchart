import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createLlmSettingSchema } from "@/lib/validations/llm-setting";
import { toLlmSettingDto } from "@/lib/llm-settings";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await prisma.llmSetting.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(settings.map(toLlmSettingDto));
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createLlmSettingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Некорректные данные" },
      { status: 400 }
    );
  }

  const { name, provider, baseUrl, apiKey, model, temperature, maxOutputTokens, timeoutSec } =
    parsed.data;

  // Created inactive on purpose: env-fallback keeps working until the admin
  // explicitly activates the preset.
  const setting = await prisma.llmSetting.create({
    data: {
      name,
      provider,
      baseUrl: baseUrl ?? null,
      apiKey,
      model,
      temperature: temperature ?? null,
      maxOutputTokens: maxOutputTokens ?? null,
      timeoutSec,
      isActive: false,
    },
  });

  return NextResponse.json(toLlmSettingDto(setting), { status: 201 });
}
