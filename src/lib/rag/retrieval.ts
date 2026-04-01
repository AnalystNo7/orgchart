/**
 * RAG Retrieval — поиск релевантных чанков по vector similarity
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

/**
 * Поиск top-K чанков по семантической близости к запросу
 */
export async function retrieveChunks(
  query: string,
  topK: number = 5,
  categoryFilter?: string
): Promise<RetrievalResult[]> {
  const queryEmbedding = await getQueryEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  let categoryClause = "";
  if (categoryFilter) {
    categoryClause = `AND d.category = '${categoryFilter}'`;
  }

  const results = await prisma.$queryRawUnsafe<
    Array<{
      chunk_id: string;
      document_id: string;
      document_title: string;
      category: string;
      content: string;
      similarity: number;
      metadata: string | null;
    }>
  >(
    `SELECT
       c.id as chunk_id,
       d.id as document_id,
       d.title as document_title,
       d.category,
       c.content,
       1 - (c.embedding <=> $1::vector) as similarity,
       c.metadata::text
     FROM "KnowledgeChunk" c
     JOIN "KnowledgeDocument" d ON d.id = c."documentId"
     WHERE c.embedding IS NOT NULL
     ${categoryClause}
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    embeddingStr,
    topK
  );

  return results.map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    documentTitle: r.document_title,
    category: r.category,
    content: r.content,
    similarity: Number(r.similarity),
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
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
