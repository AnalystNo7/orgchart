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
    isActive: s.isActive,
    keyMask: "••••" + s.apiKey.slice(-4),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export type LlmSettingDto = ReturnType<typeof toLlmSettingDto>;
