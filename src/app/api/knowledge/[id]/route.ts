import { NextResponse } from "next/server";
import { deleteDocument } from "@/lib/rag";
import { prisma } from "@/lib/db";

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
