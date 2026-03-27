import type { IntegrationAdapter } from "../types";
import { hasEnv, simpleHealthCheck } from "../helpers";

export type ResendConfig = {
  fromEmail?: string;
};

let activeConfig: ResendConfig | null = null;

export const resendAdapter: IntegrationAdapter<ResendConfig> = {
  name: "resend",
  isConfigured() {
    return hasEnv("RESEND_API_KEY");
  },
  initialize(config) {
    activeConfig = config;
  },
  async healthCheck() {
    return simpleHealthCheck(Boolean(activeConfig) || this.isConfigured());
  },
};
