import type { IntegrationAdapter } from "../types";
import { hasEnv, simpleHealthCheck } from "../helpers";

export type TwilioConfig = {
  fromNumber?: string;
};

let activeConfig: TwilioConfig | null = null;

export const twilioAdapter: IntegrationAdapter<TwilioConfig> = {
  name: "twilio",
  isConfigured() {
    return hasEnv("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN");
  },
  initialize(config) {
    activeConfig = config;
  },
  async healthCheck() {
    return simpleHealthCheck(Boolean(activeConfig) || this.isConfigured());
  },
};
