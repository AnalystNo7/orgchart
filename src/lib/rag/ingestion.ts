/**
 * RAG Ingestion — загрузка документов, чанкинг, embedding, сохранение в БД
 */

import { prisma } from "@/lib/db";
import { chunkText } from "./chunking";
import { getEmbeddings } from "./embeddings";
import type { KnowledgeCategory, KnowledgeOrigin } from "@prisma/client";

export interface IngestOptions {
  title: string;
  content: string;
  category: KnowledgeCategory;
  origin?: KnowledgeOrigin;
  sourceFile?: string;
  metadata?: Record<string, unknown>;
}

export async function ingestDocument(options: IngestOptions): Promise<{
  documentId: string;
  chunksCount: number;
}> {
  const { title, content, category, origin = "MANUAL", sourceFile, metadata } = options;

  // 1. Create document
  const document = await prisma.knowledgeDocument.create({
    data: {
      title,
      content,
      category,
      origin,
      sourceFile: sourceFile || null,
      metadata: metadata || null,
    },
  });

  // 2. Chunk text
  const chunks = chunkText(content, sourceFile);

  if (chunks.length === 0) {
    return { documentId: document.id, chunksCount: 0 };
  }

  // 3. Get embeddings for all chunks
  const chunkTexts = chunks.map((c) => c.content);
  const embeddings = await getEmbeddings(chunkTexts);

  // 4. Save chunks with embeddings using raw SQL (pgvector)
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];
    const embeddingStr = `[${embedding.join(",")}]`;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "KnowledgeChunk" (id, "documentId", content, embedding, "chunkIndex", metadata, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3::vector, $4, $5, NOW())`,
      document.id,
      chunk.content,
      embeddingStr,
      chunk.index,
      JSON.stringify(chunk.metadata || null)
    );
  }

  return { documentId: document.id, chunksCount: chunks.length };
}

export async function deleteDocument(documentId: string): Promise<void> {
  await prisma.knowledgeDocument.delete({
    where: { id: documentId },
  });
}
