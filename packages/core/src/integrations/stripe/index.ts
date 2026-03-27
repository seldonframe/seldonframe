import type { IntegrationAdapter } from "../types";
import { hasEnv, simpleHealthCheck } from "../helpers";

export type StripeConfig = {
  webhookSecret?: string;
  apiVersion?: string;
};

let activeConfig: StripeConfig | null = null;

export const stripeAdapter: IntegrationAdapter<StripeConfig> = {
  name: "stripe",
  isConfigured() {
    return hasEnv("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET");
  },
  initialize(config) {
    activeConfig = config;
  },
  async healthCheck() {
    return simpleHealthCheck(Boolean(activeConfig) || this.isConfigured());
  },
};
