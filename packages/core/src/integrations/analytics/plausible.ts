import type { IntegrationAdapter } from "../types";
import { hasEnv, simpleHealthCheck } from "../helpers";

export type PlausibleConfig = {
  siteId?: string;
};

let activeConfig: PlausibleConfig | null = null;

export const plausibleAdapter: IntegrationAdapter<PlausibleConfig> = {
  name: "plausible",
  isConfigured() {
    return hasEnv("PLAUSIBLE_API_KEY");
  },
  initialize(config) {
    activeConfig = config;
  },
  async healthCheck() {
    return simpleHealthCheck(Boolean(activeConfig) || this.isConfigured());
  },
};
