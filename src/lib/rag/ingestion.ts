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

  // 4. Save chunks with embeddings as JSON arrays
  for (let i = 0; i < chunks.length; i++) {
    await prisma.knowledgeChunk.create({
      data: {
        documentId: document.id,
        content: chunks[i].content,
        embedding: embeddings[i] as unknown as undefined,
        chunkIndex: chunks[i].index,
        metadata: chunks[i].metadata || null,
      },
    });
  }

  return { documentId: document.id, chunksCount: chunks.length };
}

export async function deleteDocument(documentId: string): Promise<void> {
  await prisma.knowledgeDocument.delete({
    where: { id: documentId },
  });
}
