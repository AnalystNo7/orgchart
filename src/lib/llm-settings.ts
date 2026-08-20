import type { LlmSetting } from "@prisma/client";

/**
 * DTO for /api/admin/llm* responses.
 * The API never returns the key itself — only a mask with the last 4 chars.
 */
export function toLlmSettingDto(s: LlmSetting) {
  return {
    id: s.id,
    name: s.name,
    provider: s.provider,
    baseUrl: s.baseUrl,
    model: s.model,
    temperature: s.temperature,
    maxOutputTokens: s.maxOutputTokens,
    timeoutSec: s.timeoutSec,
    toolResultMaxBytes: s.toolResultMaxBytes,
    isActive: s.isActive,
    keyMask: "••••" + s.apiKey.slice(-4),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export type LlmSettingDto = ReturnType<typeof toLlmSettingDto>;

/**
 * Human-readable (Russian) message for DB failures in the /api/admin/llm*
 * routes. The two setup-related cases get actionable texts:
 * - P2021: the LlmSetting table is missing (migration not applied)
 * - TypeError on prisma.llmSetting: stale generated client (no `prisma generate`)
 */
export function llmDbErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  const msg = e instanceof Error ? e.message : String(e);

  if (code === "P2021" || msg.includes("does not exist in the current database")) {
    return "Таблица LlmSetting отсутствует в БД — выполните `npx prisma migrate dev` и перезапустите dev-сервер.";
  }
  if (msg.includes("Cannot read properties of undefined")) {
    return "Prisma-клиент не знает модель LlmSetting — выполните `npx prisma generate` (или `npx prisma migrate dev`) и перезапустите dev-сервер.";
  }
  return `Ошибка базы данных: ${msg.slice(0, 300)}`;
}
