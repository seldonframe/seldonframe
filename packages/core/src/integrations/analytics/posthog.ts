import type { IntegrationAdapter } from "../types";
import { hasEnv, simpleHealthCheck } from "../helpers";

export type PostHogConfig = {
  host?: string;
};

let activeConfig: PostHogConfig | null = null;

export const posthogAdapter: IntegrationAdapter<PostHogConfig> = {
  name: "posthog",
  isConfigured() {
    return hasEnv("POSTHOG_API_KEY");
  },
  initialize(config) {
    activeConfig = config;
  },
  async healthCheck() {
    return simpleHealthCheck(Boolean(activeConfig) || this.isConfigured());
  },
};
