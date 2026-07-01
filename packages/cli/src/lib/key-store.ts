// key-store — the local, on-disk store for wst_ workspace bearer keys.
//
// Layout: a single JSON file (keys.json) under the OS config dir
// (resolveKeyStorePath). Shape: { keys: [{ label, key }], active: <label> }.
// The FIRST key added becomes active. Keys are stored in plaintext (like most
// CLIs' token stores — npm, gh) but the file is written 0600 where the OS honors
// it; the CLI NEVER prints a full key (always maskKey on display).
//
// The pure store logic (add/list/activate/remove on an in-memory KeyStoreData) is
// separated from the fs I/O so it can be reasoned about; load/save do the disk.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { homedir, platform } from "node:os";
import { resolveKeyStorePath, type ConfigEnv } from "./config-path.js";

export type StoredKey = { label: string; key: string };
export type KeyStoreData = { keys: StoredKey[]; active: string | null };

export const EMPTY_STORE: KeyStoreData = { keys: [], active: null };

// ── pure operations on the in-memory store ────────────────────────────────────

/** Add (or replace by label) a key. The first key in an empty store becomes
 *  active. Returns a NEW store (pure). */
export function addKey(store: KeyStoreData, label: string, key: string): KeyStoreData {
  const trimmedLabel = label.trim();
  const trimmedKey = key.trim();
  const without = store.keys.filter((k) => k.label !== trimmedLabel);
  const keys = [...without, { label: trimmedLabel, key: trimmedKey }];
  // Active stays as-is if still present; otherwise this new key becomes active.
  const active =
    store.active && keys.some((k) => k.label === store.active) ? store.active : trimmedLabel;
  return { keys, active };
}

/** Set the active key by label. No-op (returns input) if the label is unknown. */
export function activateKey(store: KeyStoreData, label: string): KeyStoreData {
  const trimmed = label.trim();
  if (!store.keys.some((k) => k.label === trimmed)) return store;
  return { ...store, active: trimmed };
}

/** Remove a key by label. If it was active, the active key becomes the first
 *  remaining key (or null). Returns a NEW store. */
export function removeKey(store: KeyStoreData, label: string): KeyStoreData {
  const trimmed = label.trim();
  const keys = store.keys.filter((k) => k.label !== trimmed);
  let active = store.active;
  if (active === trimmed) {
    active = keys.length > 0 ? keys[0].label : null;
  }
  return { keys, active };
}

/** The raw active key string, or null when no key is active/stored. */
export function activeKey(store: KeyStoreData): string | null {
  if (!store.active) return null;
  return store.keys.find((k) => k.label === store.active)?.key ?? null;
}

/** Validate/normalize untrusted JSON into a KeyStoreData. Never throws. */
export function coerceStore(raw: unknown): KeyStoreData {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY_STORE };
  const obj = raw as { keys?: unknown; active?: unknown };
  const keys: StoredKey[] = Array.isArray(obj.keys)
    ? obj.keys
        .filter(
          (k): k is StoredKey =>
            typeof k === "object" &&
            k !== null &&
            typeof (k as StoredKey).label === "string" &&
            typeof (k as StoredKey).key === "string",
        )
        .map((k) => ({ label: k.label, key: k.key }))
    : [];
  const active =
    typeof obj.active === "string" && keys.some((k) => k.label === obj.active)
      ? obj.active
      : keys.length > 0
        ? keys[0].label
        : null;
  return { keys, active };
}

// ── fs-backed load / save ─────────────────────────────────────────────────────

/** The default ConfigEnv from the real process (used by the CLI; tests inject
 *  their own). */
export function processConfigEnv(): ConfigEnv {
  return { platform: platform(), homedir: homedir(), env: process.env };
}

/** Read the key store from disk. A missing/corrupt file yields the empty store. */
export function loadStore(cfg: ConfigEnv = processConfigEnv()): KeyStoreData {
  const file = resolveKeyStorePath(cfg);
  if (!existsSync(file)) return { ...EMPTY_STORE };
  try {
    const raw = readFileSync(file, "utf8");
    return coerceStore(JSON.parse(raw));
  } catch {
    return { ...EMPTY_STORE };
  }
}

/** Write the key store to disk (creating the config dir), 0600 where honored. */
export function saveStore(store: KeyStoreData, cfg: ConfigEnv = processConfigEnv()): void {
  const file = resolveKeyStorePath(cfg);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

/** The active key from the on-disk store (the API client's key source). */
export function loadActiveKey(cfg: ConfigEnv = processConfigEnv()): string | null {
  return activeKey(loadStore(cfg));
}

/**
 * The API key the client should actually use. `SELDONFRAME_API_KEY` (explicit,
 * ephemeral — zero-setup, ideal for CI or a one-off shell) takes precedence over
 * the stored active key. This lets a builder run any command with just
 * `SELDONFRAME_API_KEY=wst_… seldonframe …` — no `keys add`, nothing to mangle.
 * Pure over the injected cfg.env.
 */
export function resolveApiKey(cfg: ConfigEnv = processConfigEnv()): string | null {
  const fromEnv = cfg.env.SELDONFRAME_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  return activeKey(loadStore(cfg));
}
