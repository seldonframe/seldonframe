import type { IntegrationAdapter } from "../types";
import { hasEnv, simpleHealthCheck } from "../helpers";

export type SendGridConfig = {
  fromEmail?: string;
};

let activeConfig: SendGridConfig | null = null;

export const sendGridAdapter: IntegrationAdapter<SendGridConfig> = {
  name: "sendgrid",
  isConfigured() {
    return hasEnv("SENDGRID_API_KEY");
  },
  initialize(config) {
    activeConfig = config;
  },
  async healthCheck() {
    return simpleHealthCheck(Boolean(activeConfig) || this.isConfigured());
  },
};
