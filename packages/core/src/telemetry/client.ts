import { TelemetryQueue } from "./queue";
import type { AnyTelemetryEnvelope, TelemetryEnvelope, TelemetryEventMap, TelemetryEventName } from "./types";

export type TelemetryClientConfig = {
  enabled: boolean;
  endpoint: string | null;
  batchSize: number;
  flushIntervalMs: number;
};

const defaultTelemetryConfig: TelemetryClientConfig = {
  enabled: false,
  endpoint: null,
  batchSize: 50,
  flushIntervalMs: 5000,
};

export class TelemetryClient {
  private config: TelemetryClientConfig = defaultTelemetryConfig;
  private readonly queue = new TelemetryQueue();

  configure(config: Partial<TelemetryClientConfig>) {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  track<T extends TelemetryEventName>(name: T, payload: TelemetryEventMap[T]) {
    const envelope: TelemetryEnvelope<T> = {
      name,
      payload,
      timestamp: new Date().toISOString(),
    };

    this.queue.enqueue(envelope as AnyTelemetryEnvelope);
  }

  async flush() {
    if (!this.config.enabled || !this.config.endpoint || this.queue.size === 0) {
      return false;
    }

    const batch = this.queue.drain(this.config.batchSize);
    await fetch(this.config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ events: batch }),
    });

    return true;
  }

  getConfig() {
    return { ...this.config };
  }

  getQueueSize() {
    return this.queue.size;
  }
}

let telemetryClient: TelemetryClient | null = null;

export function getTelemetryClient() {
  if (!telemetryClient) {
    telemetryClient = new TelemetryClient();
  }

  return telemetryClient;
}

export function configureTelemetry(config: Partial<TelemetryClientConfig>) {
  const client = getTelemetryClient();
  client.configure(config);
  return client;
}

export function trackTelemetryEvent<T extends TelemetryEventName>(name: T, payload: TelemetryEventMap[T]) {
  const client = getTelemetryClient();
  client.track(name, payload);
}

export async function flushTelemetry() {
  const client = getTelemetryClient();
  return client.flush();
}
