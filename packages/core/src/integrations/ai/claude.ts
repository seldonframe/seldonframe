import type { IntegrationAdapter } from "../types";
import { hasEnv, simpleHealthCheck } from "../helpers";

export type ClaudeConfig = {
  model?: string;
};

let activeConfig: ClaudeConfig | null = null;

export const claudeAdapter: IntegrationAdapter<ClaudeConfig> = {
  name: "claude",
  isConfigured() {
    return hasEnv("ANTHROPIC_API_KEY");
  },
  initialize(config) {
    activeConfig = config;
  },
  async healthCheck() {
    return simpleHealthCheck(Boolean(activeConfig) || this.isConfigured());
  },
};
