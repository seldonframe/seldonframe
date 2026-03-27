import type { IntegrationAdapter } from "../types";
import { hasEnv, simpleHealthCheck } from "../helpers";

export type UploadthingConfig = {
  region?: string;
};

let activeConfig: UploadthingConfig | null = null;

export const uploadthingAdapter: IntegrationAdapter<UploadthingConfig> = {
  name: "uploadthing",
  isConfigured() {
    return hasEnv("UPLOADTHING_TOKEN");
  },
  initialize(config) {
    activeConfig = config;
  },
  async healthCheck() {
    return simpleHealthCheck(Boolean(activeConfig) || this.isConfigured());
  },
};
