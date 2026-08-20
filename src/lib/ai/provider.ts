import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { prisma } from "@/lib/db";
import type { LlmProvider } from "@/lib/validations/llm-setting";

export type AIProvider = "anthropic" | "openai" | "google";

const PROVIDER_DEFAULTS: Record<AIProvider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
};

function getEnvProvider(): AIProvider {
  const raw = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  if (raw === "openai" || raw === "google" || raw === "anthropic") return raw;
  return "anthropic";
}

/** Env-driven model construction — the pre-preset behaviour, kept as fallback. */
function getEnvModel(): LanguageModel {
  const provider = getEnvProvider();
  const modelId = process.env.AI_MODEL || PROVIDER_DEFAULTS[provider];

  switch (provider) {
    case "anthropic": {
      const anthropic = createAnthropic();
      return anthropic(modelId);
    }
    case "openai": {
      const openai = createOpenAI();
      return openai(modelId);
    }
    case "google": {
      const google = createGoogleGenerativeAI();
      return google(modelId);
    }
  }
}

export interface LlmConnectionConfig {
  provider: LlmProvider;
  baseUrl?: string | null;
  /** null/undefined → the SDK reads its conventional env key (official providers only) */
  apiKey?: string | null;
  model: string;
}

/**
 * Pure model factory from an explicit config — used by getLlm() and by the
 * admin "test connection" endpoint. No DB access here.
 */
export function buildModel(config: LlmConnectionConfig): LanguageModel {
  const baseURL = config.baseUrl || undefined;
  const apiKey = config.apiKey || undefined;

  switch (config.provider) {
    case "openai_compatible": {
      // IMPORTANT: default openai(modelId) targets the Responses API;
      // OpenAI-compatible gateways (Gonka, OpenRouter, vLLM, Ollama…)
      // speak Chat Completions — hence .chat().
      const openai = createOpenAI({
        baseURL,
        apiKey,
        name: "openai-compatible",
      });
      return openai.chat(config.model);
    }
    case "anthropic": {
      const anthropic = createAnthropic({ baseURL, apiKey });
      return anthropic(config.model);
    }
    case "openai": {
      const openai = createOpenAI({ baseURL, apiKey });
      return openai(config.model);
    }
    case "google": {
      const google = createGoogleGenerativeAI({ baseURL, apiKey });
      return google(config.model);
    }
  }
}

export interface LlmGenerationSettings {
  /** undefined = don't pass (provider default) */
  temperature?: number;
  /** undefined = don't pass (no cap) */
  maxOutputTokens?: number;
  /** undefined = don't pass (no timeout) — the env-fallback case */
  timeoutMs?: number;
}

export interface LlmRuntime {
  model: LanguageModel;
  settings: LlmGenerationSettings;
}

/**
 * Resolve the LLM for a request: the active admin preset from the DB, or the
 * env-driven fallback when no preset is active. Called per request — no
 * module-level cache, so switching the active preset applies immediately
 * without a redeploy.
 */
export async function getLlm(): Promise<LlmRuntime> {
  let preset = null;
  try {
    preset = await prisma.llmSetting.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });
  } catch (e) {
    // Missing table (migration not applied) or stale client must not take the
    // whole AI subsystem down — fall back to env configuration.
    console.warn("[getLlm] Falling back to env config:", e instanceof Error ? e.message : e);
  }

  if (!preset) {
    // Bit-for-bit the pre-preset behaviour: no temperature/cap/timeout.
    return { model: getEnvModel(), settings: {} };
  }

  return {
    model: buildModel({
      provider: preset.provider as LlmProvider,
      baseUrl: preset.baseUrl,
      apiKey: preset.apiKey,
      model: preset.model,
    }),
    settings: {
      temperature: preset.temperature ?? undefined,
      maxOutputTokens: preset.maxOutputTokens ?? undefined,
      timeoutMs: preset.timeoutSec * 1000,
    },
  };
}
