import type { IntegrationAdapter } from "../types";
import { hasEnv, simpleHealthCheck } from "../helpers";

export type ZoomConfig = {
  userId?: string;
};

let activeConfig: ZoomConfig | null = null;

export const zoomAdapter: IntegrationAdapter<ZoomConfig> = {
  name: "zoom",
  isConfigured() {
    return hasEnv("ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET", "ZOOM_ACCOUNT_ID");
  },
  initialize(config) {
    activeConfig = config;
  },
  async healthCheck() {
    return simpleHealthCheck(Boolean(activeConfig) || this.isConfigured());
  },
};
