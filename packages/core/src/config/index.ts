import type { TelemetryClientConfig } from "../telemetry";

export type CoreRuntimeConfig = {
  telemetry: TelemetryClientConfig;
};

const defaultConfig: CoreRuntimeConfig = {
  telemetry: {
    enabled: process.env.SELDON_TELEMETRY_ENABLED === "true",
    endpoint: process.env.SELDON_TELEMETRY_ENDPOINT ?? null,
    batchSize: Number(process.env.SELDON_TELEMETRY_BATCH_SIZE ?? 50),
    flushIntervalMs: Number(process.env.SELDON_TELEMETRY_FLUSH_MS ?? 5000),
  },
};

let runtimeConfig: CoreRuntimeConfig = defaultConfig;

export function getCoreRuntimeConfig() {
  return runtimeConfig;
}

export function setCoreRuntimeConfig(nextConfig: Partial<CoreRuntimeConfig>) {
  runtimeConfig = {
    ...runtimeConfig,
    ...nextConfig,
    telemetry: {
      ...runtimeConfig.telemetry,
      ...(nextConfig.telemetry ?? {}),
    },
  };

  return runtimeConfig;
}
