import type { IntegrationAdapter } from "../types";
import { hasEnv, simpleHealthCheck } from "../helpers";

export type PostmarkConfig = {
  fromEmail?: string;
};

let activeConfig: PostmarkConfig | null = null;

export const postmarkAdapter: IntegrationAdapter<PostmarkConfig> = {
  name: "postmark",
  isConfigured() {
    return hasEnv("POSTMARK_SERVER_TOKEN");
  },
  initialize(config) {
    activeConfig = config;
  },
  async healthCheck() {
    return simpleHealthCheck(Boolean(activeConfig) || this.isConfigured());
  },
};
