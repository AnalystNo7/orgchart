import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildModel } from "@/lib/ai/provider";
import { formatAIError } from "@/lib/ai/orchestrator";
import { testLlmSchema } from "@/lib/validations/llm-setting";

/**
 * POST /api/admin/llm/test — probe a connection with the form values.
 * When apiKey is empty and presetId is given (edit form), the stored key is used.
 * Always returns HTTP 200: {ok, latencyMs, text} | {ok:false, error} —
 * a failed probe is a result, not an API error.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = testLlmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Некорректные данные" },
      { status: 400 }
    );
  }

  const { provider, baseUrl, model, presetId } = parsed.data;
  let apiKey = parsed.data.apiKey || null;

  if (!apiKey && presetId) {
    const preset = await prisma.llmSetting.findUnique({ where: { id: presetId } });
    apiKey = preset?.apiKey ?? null;
  }

  if (!apiKey && provider === "openai_compatible") {
    return NextResponse.json(
      { error: "API-ключ не задан — введите ключ или сохраните настройку" },
      { status: 400 }
    );
  }

  const startedAt = Date.now();
  try {
    const result = await generateText({
      model: buildModel({ provider, baseUrl, apiKey, model }),
      prompt: "Ответь одним словом: ok",
      maxOutputTokens: 16,
      timeout: 20_000,
      maxRetries: 0,
    });
    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - startedAt,
      text: result.text.trim().slice(0, 100),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: formatAIError(e) });
  }
}
