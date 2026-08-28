/**
 * PDF parser — извлечение текста из PDF
 * Требует установки: npm install pdf-parse
 */

export async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Cannot find module") || error.message.includes("pdf-parse"))
    ) {
      throw new Error(
        "Для загрузки PDF необходимо установить пакет pdf-parse: npm install pdf-parse"
      );
    }
    throw error;
  }
}
