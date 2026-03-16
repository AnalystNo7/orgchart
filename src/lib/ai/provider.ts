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
