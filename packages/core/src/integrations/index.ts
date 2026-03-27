import { tier1Adapters } from "./tier1";
import { loadTier2Adapters } from "./tier2";
import type { AdapterDescriptor, IntegrationAdapter } from "./types";

export * from "./types";
export { tier1Adapters, loadTier2Adapters };

export async function loadAllAdapters() {
  const tier2Adapters = await loadTier2Adapters();
  return [...tier1Adapters, ...tier2Adapters];
}

export async function findAdapterById(id: string) {
  const adapters = await loadAllAdapters();
  return adapters.find((descriptor) => descriptor.id === id) ?? null;
}

export function getConfiguredTier1Adapters() {
  return tier1Adapters.filter((descriptor) => descriptor.adapter.isConfigured());
}

export async function getConfiguredAdapters() {
  const adapters = await loadAllAdapters();
  return adapters.filter((descriptor) => descriptor.adapter.isConfigured());
}

export async function healthCheckAdapters(adapters: AdapterDescriptor[]) {
  const results = await Promise.all(
    adapters.map(async (descriptor) => ({
      id: descriptor.id,
      healthy: await descriptor.adapter.healthCheck(),
    }))
  );

  return results;
}

export function initializeAdapter<TConfig>(adapter: IntegrationAdapter<TConfig>, config: TConfig) {
  adapter.initialize(config);
  return adapter;
}
