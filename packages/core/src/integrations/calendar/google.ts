import type { IntegrationAdapter } from "../types";
import { hasEnv, simpleHealthCheck } from "../helpers";

export type GoogleCalendarConfig = {
  calendarId?: string;
};

let activeConfig: GoogleCalendarConfig | null = null;

export const googleCalendarAdapter: IntegrationAdapter<GoogleCalendarConfig> = {
  name: "google-calendar",
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
