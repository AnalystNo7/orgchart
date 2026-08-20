import { z } from "zod";

export const LLM_PROVIDERS = [
  "openai_compatible",
  "anthropic",
  "openai",
  "google",
] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai_compatible: "OpenAI-совместимый (по URL)",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

const baseFields = {
  name: z.string().min(1, "Название обязательно"),
  provider: z.enum(LLM_PROVIDERS),
  baseUrl: z
    .string()
    .url("Некорректный URL")
    .nullable()
    .optional(),
  model: z.string().min(1, "Модель обязательна"),
  temperature: z
    .number()
    .min(0, "Температура не может быть меньше 0")
    .max(2, "Температура не может быть больше 2")
    .nullable()
    .optional(),
  maxOutputTokens: z
    .number()
    .int()
    .min(256, "Лимит ответа — минимум 256 токенов")
    .max(128000, "Лимит ответа — максимум 128000 токенов")
    .nullable()
    .optional(),
  timeoutSec: z
    .number()
    .int()
    .min(30, "Таймаут — минимум 30 секунд")
    .max(600, "Таймаут — максимум 600 секунд")
    .default(300),
  toolResultMaxBytes: z
    .number()
    .int()
    .min(4000, "Лимит результата инструмента — минимум 4000 байт")
    .max(1000000, "Лимит результата инструмента — максимум 1000000 байт")
    .nullable()
    .optional(),
};

function requireBaseUrlForCompatible(
  data: { provider: LlmProvider; baseUrl?: string | null },
  ctx: z.RefinementCtx
) {
  if (data.provider === "openai_compatible" && !data.baseUrl) {
    ctx.addIssue({
      code: "custom",
      path: ["baseUrl"],
      message: "Для OpenAI-совместимого провайдера base URL обязателен",
    });
  }
}

export const createLlmSettingSchema = z
  .object({
    ...baseFields,
    apiKey: z.string().min(1, "API-ключ обязателен"),
  })
  .superRefine(requireBaseUrlForCompatible);

export const updateLlmSettingSchema = z
  .object({
    ...baseFields,
    // Empty / missing key means "keep the stored one"
    apiKey: z.string().optional(),
  })
  .superRefine(requireBaseUrlForCompatible);

export const testLlmSchema = z
  .object({
    ...baseFields,
    apiKey: z.string().optional(),
    // Where to take the stored key from when apiKey is empty (edit form)
    presetId: z.string().uuid().optional(),
  })
  .superRefine(requireBaseUrlForCompatible);
