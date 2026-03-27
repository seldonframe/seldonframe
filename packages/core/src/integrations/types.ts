export interface IntegrationAdapter<TConfig> {
  name: string;
  isConfigured(): boolean;
  initialize(config: TConfig): void;
  healthCheck(): Promise<boolean>;
}

export type AdapterMap = Record<string, IntegrationAdapter<unknown>>;

export type IntegrationTier = "tier1" | "tier2";

export type AdapterDescriptor = {
  id: string;
  tier: IntegrationTier;
  adapter: IntegrationAdapter<unknown>;
};
