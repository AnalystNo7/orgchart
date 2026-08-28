import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestDocument } from "@/lib/rag";
import { parsePdf } from "@/lib/rag/pdf-parser";
import { parseDocx } from "@/lib/rag/docx-parser";
import type { KnowledgeCategory } from "@prisma/client";

// GET — list all documents
export async function GET() {
  const documents = await prisma.knowledgeDocument.findMany({
    select: {
      id: true,
      title: true,
      category: true,
      origin: true,
      sourceFile: true,
      includeInPrompt: true,
      content: true,
      createdAt: true,
      _count: { select: { chunks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Полный текст в списке не нужен — только его вес для счётчика бюджета.
  return NextResponse.json({
    documents: documents.map(({ content, ...doc }) => ({
      ...doc,
      contentBytes: Buffer.byteLength(content, "utf8"),
    })),
  });
}

// POST — upload and ingest a document
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string | null;
    const category = (formData.get("category") as KnowledgeCategory) || "CLIENT_DOC";
    const textContent = formData.get("content") as string | null;

    let content: string;
    let sourceFile: string | undefined;

    if (file) {
      sourceFile = file.name;
      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "pdf") {
        const buffer = Buffer.from(await file.arrayBuffer());
        content = await parsePdf(buffer);
      } else if (ext === "docx" || ext === "doc") {
        const buffer = Buffer.from(await file.arrayBuffer());
        content = await parseDocx(buffer);
      } else if (ext === "md" || ext === "txt" || ext === "markdown") {
        content = await file.text();
      } else {
        return NextResponse.json(
          { error: `Формат .${ext} не поддерживается. Допустимые: .md, .txt, .pdf, .docx, .doc` },
          { status: 400 }
        );
      }
    } else if (textContent) {
      content = textContent;
    } else {
      return NextResponse.json(
        { error: "Необходимо загрузить файл или передать текст" },
        { status: 400 }
      );
    }

    if (!title && !sourceFile) {
      return NextResponse.json(
        { error: "Укажите название документа" },
        { status: 400 }
      );
    }

    const result = await ingestDocument({
      title: title || sourceFile || "Без названия",
      content,
      category,
      origin: "MANUAL",
      sourceFile,
    });

    return NextResponse.json({
      message: `Документ загружен: ${result.chunksCount} чанков создано`,
      documentId: result.documentId,
      chunksCount: result.chunksCount,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
