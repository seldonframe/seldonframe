import type { IntegrationAdapter } from "../types";
import { hasEnv, simpleHealthCheck } from "../helpers";

export type MicrosoftGraphConfig = {
  tenantId?: string;
};

let activeConfig: MicrosoftGraphConfig | null = null;

export const microsoftGraphAdapter: IntegrationAdapter<MicrosoftGraphConfig> = {
  name: "microsoft-graph",
  isConfigured() {
    return hasEnv("MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET", "MS_GRAPH_TENANT_ID");
  },
  initialize(config) {
    activeConfig = config;
  },
  async healthCheck() {
    return simpleHealthCheck(Boolean(activeConfig) || this.isConfigured());
  },
};
