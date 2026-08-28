/**
 * Document chunking — разбиение текста на чанки для RAG
 * Стратегия: ~500 токенов (~2000 символов) с overlap 50 токенов (~200 символов)
 */

const CHUNK_SIZE = 2000; // ~500 токенов
const CHUNK_OVERLAP = 200; // ~50 токенов

export interface Chunk {
  content: string;
  index: number;
  metadata?: Record<string, unknown>;
}

/**
 * Разбивает текст на семантические чанки.
 * Сначала пытается разбить по заголовкам (##), затем по абзацам, затем по размеру.
 */
export function chunkText(text: string, sourceFile?: string): Chunk[] {
  const sections = splitBySections(text);
  const chunks: Chunk[] = [];
  let index = 0;

  for (const section of sections) {
    if (section.length <= CHUNK_SIZE) {
      chunks.push({
        content: section.trim(),
        index: index++,
        metadata: sourceFile ? { sourceFile } : undefined,
      });
    } else {
      // Split large sections by paragraphs
      const subChunks = splitBySize(section, CHUNK_SIZE, CHUNK_OVERLAP);
      for (const sub of subChunks) {
        chunks.push({
          content: sub.trim(),
          index: index++,
          metadata: sourceFile ? { sourceFile } : undefined,
        });
      }
    }
  }

  // Filter empty chunks
  return chunks.filter((c) => c.content.length > 20);
}

/**
 * Разбивает markdown по заголовкам ## и ###
 */
function splitBySections(text: string): string[] {
  const sections: string[] = [];
  const lines = text.split("\n");
  let current = "";

  for (const line of lines) {
    if (/^#{1,3}\s/.test(line) && current.trim().length > 0) {
      sections.push(current);
      current = line + "\n";
    } else {
      current += line + "\n";
    }
  }

  if (current.trim().length > 0) {
    sections.push(current);
  }

  return sections;
}

/**
 * Разбивает текст на чанки фиксированного размера с overlap
 */
function splitBySize(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > size && current.length > 0) {
      chunks.push(current);
      // Overlap: keep last portion
      const overlapStart = Math.max(0, current.length - overlap);
      current = current.slice(overlapStart) + "\n\n" + para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current);
  }

  return chunks;
}
