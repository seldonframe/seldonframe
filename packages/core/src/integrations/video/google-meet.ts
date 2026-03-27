import type { IntegrationAdapter } from "../types";
import { hasEnv, simpleHealthCheck } from "../helpers";

export type GoogleMeetConfig = {
  defaultDurationMinutes?: number;
};

let activeConfig: GoogleMeetConfig | null = null;

export const googleMeetAdapter: IntegrationAdapter<GoogleMeetConfig> = {
  name: "google-meet",
  isConfigured() {
    return hasEnv("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
  },
  initialize(config) {
    activeConfig = config;
  },
  async healthCheck() {
    return simpleHealthCheck(Boolean(activeConfig) || this.isConfigured());
  },
};
