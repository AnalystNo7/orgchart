/**
 * PDF parser — извлечение текста из PDF
 */

export async function parsePdf(buffer: Buffer): Promise<string> {
  // Dynamic import to avoid bundling issues
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return data.text;
}
