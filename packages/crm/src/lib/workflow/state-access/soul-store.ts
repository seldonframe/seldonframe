// SoulStore — workspace-scoped state read/write abstraction used by
// the `read_state` and `write_state` step dispatchers.
//
// Shipped in SLICE 3 PR 1 C1 per audit §4.3.
//
// Path semantics:
//   - Paths prefixed with `workspace.soul.` address the Soul slice.
//   - Paths prefixed with `workspace.theme.` address the theme slice.
//   - SoulStore.readPath / writePath take the path WITHOUT the
//     `workspace.<slice>.` prefix — the dispatcher strips it before
//     calling. Callers who hit this interface directly pass the
//     "inside soul" portion (e.g., "businessName", "pipeline.stages").
//   - Empty path returns the full slice object.
//
// Implementations:
//   - InMemorySoulStore: test double (soul-store-memory.ts).
//   - DrizzleSoulStore: production; wraps organizations.soul JSONB.

export interface SoulStore {
  /**
   * Read the value at the given path inside the org's Soul slice.
   * Missing paths return undefined (not an error). Empty path returns
   * the full slice.
   */
  readPath(orgId: string, path: string, slice?: SoulSlice): Promise<unknown>;

  /**
   * Write a value at the given path inside the org's Soul slice.
   * Intermediate objects are created as needed. Existing siblings
   * are preserved.
   */
  writePath(
    orgId: string,
    path: string,
    value: unknown,
    slice?: SoulSlice,
  ): Promise<void>;
}

/** Which sub-object of the workspace's state to address. */
export type SoulSlice = "soul" | "theme";

// ---------------------------------------------------------------------
// Path helpers — used by both the in-memory and Drizzle impls to walk
// nested objects.
// ---------------------------------------------------------------------

/** Walk a dotted path through an object. Returns undefined on miss. */
export function walkPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const segments = path.split(".");
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

/**
 * Write `value` at the dotted path in `obj`, creating intermediate
 * objects as needed. Returns a NEW root object — the original is not
 * mutated. If any existing intermediate segment is a non-object,
 * it's replaced with an object (preferring the path write over the
 * legacy non-object). Empty path replaces the whole object.
 */
export function writePath(obj: unknown, path: string, value: unknown): unknown {
  if (!path) return value;
  const segments = path.split(".");
  const root: Record<string, unknown> =
    obj && typeof obj === "object" ? { ...(obj as Record<string, unknown>) } : {};

  let current: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    const existing = current[seg];
    const cloned: Record<string, unknown> =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    current[seg] = cloned;
    current = cloned;
  }
  current[segments[segments.length - 1]] = value;
  return root;
}

/**
 * Strip the `workspace.<slice>.` prefix from a full path and return
 * `{ slice, innerPath }`. Returns null when the path isn't
 * workspace-scoped. Dispatchers use this to route to the right slice
 * before calling SoulStore.
 */
export function splitWorkspacePath(
  fullPath: string,
): { slice: SoulSlice; innerPath: string } | null {
  if (fullPath.startsWith("workspace.soul.")) {
    return { slice: "soul", innerPath: fullPath.slice("workspace.soul.".length) };
  }
  if (fullPath === "workspace.soul") {
    return { slice: "soul", innerPath: "" };
  }
  if (fullPath.startsWith("workspace.theme.")) {
    return { slice: "theme", innerPath: fullPath.slice("workspace.theme.".length) };
  }
  if (fullPath === "workspace.theme") {
    return { slice: "theme", innerPath: "" };
  }
  return null;
}
