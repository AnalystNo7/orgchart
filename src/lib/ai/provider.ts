import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export type AIProvider = "anthropic" | "openai" | "google";

const PROVIDER_DEFAULTS: Record<AIProvider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
};

function getProvider(): AIProvider {
  const raw = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  if (raw === "openai" || raw === "google" || raw === "anthropic") return raw;
  return "anthropic";
}

export function getModel(): LanguageModel {
  const provider = getProvider();
  const modelId = process.env.AI_MODEL || PROVIDER_DEFAULTS[provider];

  // Diagnostic: check API key for non-ASCII characters
  const keyEnvMap: Record<AIProvider, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    google: "GOOGLE_GENERATIVE_AI_API_KEY",
  };
  const keyVal = process.env[keyEnvMap[provider]] ?? "";
  for (let i = 0; i < keyVal.length; i++) {
    if (keyVal.charCodeAt(i) > 127) {
      console.error(
        `[AI_KEY_ERROR] ${keyEnvMap[provider]} contains non-ASCII char at index ${i}: ` +
        `U+${keyVal.charCodeAt(i).toString(16).toUpperCase()} "${keyVal[i]}". ` +
        `Key starts with: "${keyVal.slice(0, 10).replace(/[^\x20-\x7E]/g, "?")}..."`
      );
      break;
    }
  }

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
