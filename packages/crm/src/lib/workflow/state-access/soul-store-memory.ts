// In-memory SoulStore — test double. SLICE 3 C1.
//
// Stores per-org Soul + theme objects in a Map. Reads + writes
// operate on cloned copies to simulate the JSONB-round-trip
// semantics of the Drizzle impl (no shared mutable references
// leaking to callers).

import type { SoulSlice, SoulStore } from "./soul-store";
import { walkPath, writePath as writePathImpl } from "./soul-store";

type OrgSlices = {
  soul: Record<string, unknown>;
  theme: Record<string, unknown>;
};

export class InMemorySoulStore implements SoulStore {
  private readonly data = new Map<string, OrgSlices>();

  async readPath(
    orgId: string,
    path: string,
    slice: SoulSlice = "soul",
  ): Promise<unknown> {
    const slices = this.data.get(orgId);
    if (!slices) return undefined;
    return walkPath(slices[slice], path);
  }

  async writePath(
    orgId: string,
    path: string,
    value: unknown,
    slice: SoulSlice = "soul",
  ): Promise<void> {
    const slices = this.data.get(orgId) ?? { soul: {}, theme: {} };
    const updated = writePathImpl(slices[slice], path, value);
    this.data.set(orgId, {
      ...slices,
      [slice]: updated as Record<string, unknown>,
    });
  }

  // -------------------------------------------------------------------
  // Test helpers — underscore-prefixed to keep them off the interface.
  // -------------------------------------------------------------------

  _seed(orgId: string, soul: Record<string, unknown>): void {
    const existing = this.data.get(orgId) ?? { soul: {}, theme: {} };
    this.data.set(orgId, { ...existing, soul });
  }

  _seedTheme(orgId: string, theme: Record<string, unknown>): void {
    const existing = this.data.get(orgId) ?? { soul: {}, theme: {} };
    this.data.set(orgId, { ...existing, theme });
  }

  _clear(): void {
    this.data.clear();
  }
}
