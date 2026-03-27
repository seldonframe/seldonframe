import type { AnyTelemetryEnvelope } from "./types";

export class TelemetryQueue {
  private readonly items: AnyTelemetryEnvelope[] = [];

  constructor(private readonly maxSize = 1000) {}

  enqueue(event: AnyTelemetryEnvelope) {
    if (this.items.length >= this.maxSize) {
      this.items.shift();
    }

    this.items.push(event);
  }

  drain(limit: number) {
    return this.items.splice(0, limit);
  }

  get size() {
    return this.items.length;
  }

  clear() {
    this.items.length = 0;
  }
}
