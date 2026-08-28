/**
 * DOCX/DOC parser — извлечение текста из Word-документов
 * Требует установки: npm install mammoth
 */

export async function parseDocx(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Cannot find module") || error.message.includes("mammoth"))
    ) {
      throw new Error(
        "Для загрузки DOCX необходимо установить пакет mammoth: npm install mammoth"
      );
    }
    throw error;
  }
}
