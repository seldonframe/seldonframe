import type { IntegrationAdapter } from "../types";
import { hasEnv, simpleHealthCheck } from "../helpers";

export type S3R2Config = {
  bucket?: string;
};

let activeConfig: S3R2Config | null = null;

export const s3R2Adapter: IntegrationAdapter<S3R2Config> = {
  name: "s3-r2",
  isConfigured() {
    return hasEnv("S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET");
  },
  initialize(config) {
    activeConfig = config;
  },
  async healthCheck() {
    return simpleHealthCheck(Boolean(activeConfig) || this.isConfigured());
  },
};
