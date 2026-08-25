import { NextResponse } from "next/server";
import { deleteDocument } from "@/lib/rag";
import { prisma } from "@/lib/db";
import { AI_KB_PROMPT_BUDGET_BYTES } from "@/lib/ai/limits";

// GET — get document details with chunks
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const document = await prisma.knowledgeDocument.findUnique({
    where: { id },
    include: {
      chunks: {
        select: {
          id: true,
          content: true,
          chunkIndex: true,
          metadata: true,
        },
        orderBy: { chunkIndex: "asc" },
      },
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  }

  return NextResponse.json({ document });
}

// PATCH — toggle "включён в системный промпт"
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const includeInPrompt = body?.includeInPrompt;
  if (typeof includeInPrompt !== "boolean") {
    return NextResponse.json(
      { error: "Ожидается { includeInPrompt: boolean }" },
      { status: 400 }
    );
  }

  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id },
    select: { id: true, content: true, includeInPrompt: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  }

  // Выключение — всегда; включение — только пока сумма включённых документов
  // помещается в бюджет промпта. Отказ вместо молчаливой обрезки: модель не
  // должна видеть пол-документа, не зная об этом.
  if (includeInPrompt && !doc.includeInPrompt) {
    const enabled = await prisma.knowledgeDocument.findMany({
      where: { includeInPrompt: true, NOT: { id } },
      select: { content: true },
    });
    const usedBytes = enabled.reduce(
      (sum, d) => sum + Buffer.byteLength(d.content, "utf8"),
      0
    );
    const docBytes = Buffer.byteLength(doc.content, "utf8");
    if (usedBytes + docBytes > AI_KB_PROMPT_BUDGET_BYTES) {
      const kb = (n: number) => (n / 1024).toFixed(1);
      return NextResponse.json(
        {
          error:
            `Документ не помещается в бюджет промпта: занято ${kb(usedBytes)} КБ ` +
            `из ${kb(AI_KB_PROMPT_BUDGET_BYTES)} КБ, документ занимает ${kb(docBytes)} КБ. ` +
            "Выключите другие документы или сократите этот.",
        },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.knowledgeDocument.update({
    where: { id },
    data: { includeInPrompt },
    select: { id: true, includeInPrompt: true },
  });
  return NextResponse.json(updated);
}

// DELETE — delete document and all its chunks
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await deleteDocument(id);
    return NextResponse.json({ message: "Документ удалён" });
  } catch {
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  }
}
