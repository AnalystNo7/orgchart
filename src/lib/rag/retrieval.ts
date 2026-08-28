/**
 * RAG Retrieval — поиск релевантных чанков по cosine similarity (in-memory)
 * Для MVP — загружаем все embeddings из БД и считаем similarity в коде.
 * При переходе на pgvector — заменить на SQL-запрос с оператором <=>.
 */

import { prisma } from "@/lib/db";
import { getQueryEmbedding } from "./embeddings";

export interface RetrievalResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  category: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown> | null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

/**
 * Поиск top-K чанков по семантической близости к запросу
 */
export async function retrieveChunks(
  query: string,
  topK: number = 5,
  categoryFilter?: string
): Promise<RetrievalResult[]> {
  const queryEmbedding = await getQueryEmbedding(query);

  // Load all chunks with embeddings
  const whereClause: Record<string, unknown> = {
    embedding: { not: null },
  };
  if (categoryFilter) {
    whereClause.document = { category: categoryFilter };
  }

  const chunks = await prisma.knowledgeChunk.findMany({
    where: whereClause,
    select: {
      id: true,
      documentId: true,
      content: true,
      embedding: true,
      metadata: true,
      document: {
        select: {
          title: true,
          category: true,
        },
      },
    },
  });

  if (chunks.length === 0) {
    return [];
  }

  // Calculate cosine similarity for each chunk
  const scored = chunks
    .map((chunk) => {
      const embedding = chunk.embedding as number[] | null;
      if (!embedding || embedding.length === 0) return null;
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      return {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        documentTitle: chunk.document.title,
        category: chunk.document.category,
        content: chunk.content,
        similarity,
        metadata: chunk.metadata as Record<string, unknown> | null,
      };
    })
    .filter((r): r is RetrievalResult => r !== null);

  // Sort by similarity descending, take top-K
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

/**
 * Форматирует результаты RAG для вставки в prompt
 */
export function formatRetrievalContext(results: RetrievalResult[]): string {
  if (results.length === 0) return "";

  const sections = results.map(
    (r, i) =>
      `[Источник ${i + 1}: ${r.documentTitle} (${r.category}, similarity: ${(r.similarity * 100).toFixed(1)}%)]\n${r.content}`
  );

  return `\n---\nРелевантные данные из базы знаний:\n\n${sections.join("\n\n")}\n---\n`;
}
