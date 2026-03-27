import type { IntegrationAdapter } from "../types";
import { hasEnv, simpleHealthCheck } from "../helpers";

export type OpenAIConfig = {
  model?: string;
};

let activeConfig: OpenAIConfig | null = null;

export const openAiAdapter: IntegrationAdapter<OpenAIConfig> = {
  name: "openai",
  isConfigured() {
    return hasEnv("OPENAI_API_KEY");
  },
  initialize(config) {
    activeConfig = config;
  },
  async healthCheck() {
    return simpleHealthCheck(Boolean(activeConfig) || this.isConfigured());
  },
};
