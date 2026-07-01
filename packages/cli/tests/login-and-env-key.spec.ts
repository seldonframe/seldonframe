// login + env-key — the two zero-friction key paths:
//   • resolveApiKey: SELDONFRAME_API_KEY env var wins over the stored key.
//   • runLoginCommand: paste → verify → store, with every effect injected so the
//     flow is proven without stdin or the network.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EMPTY_STORE, addKey, saveStore, resolveApiKey } from "../src/lib/key-store.js";
import type { ConfigEnv } from "../src/lib/config-path.js";
import { runLoginCommand } from "../src/commands/login.js";
import type { ParsedArgs } from "../src/lib/args.js";
import type { Writer } from "../src/lib/output.js";

function tmpCfg(extraEnv: Record<string, string | undefined> = {}): { cfg: ConfigEnv; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "sf-cli-envkey-"));
  return {
    cfg: { platform: process.platform, homedir: tmpdir(), env: { SELDONFRAME_CONFIG_DIR: dir, ...extraEnv } },
    dir,
  };
}

function capture(): { writer: Writer; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { writer: { out: (l) => out.push(l), err: (l) => err.push(l) }, out, err };
}

function loginArgs(flags: Record<string, string> = {}): ParsedArgs {
  return { command: "login", subcommand: null, flags, positionals: [], json: false, help: false, version: false };
}

describe("resolveApiKey", () => {
  test("SELDONFRAME_API_KEY wins over the stored active key", () => {
    const { cfg, dir } = tmpCfg({ SELDONFRAME_API_KEY: "wst_env" });
    try {
      saveStore(addKey(EMPTY_STORE, "main", "wst_stored"), cfg);
      assert.equal(resolveApiKey(cfg), "wst_env");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the env key is trimmed", () => {
    const { cfg, dir } = tmpCfg({ SELDONFRAME_API_KEY: "  wst_env  " });
    try {
      assert.equal(resolveApiKey(cfg), "wst_env");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("no env var → falls back to the stored active key", () => {
    const { cfg, dir } = tmpCfg({});
    try {
      saveStore(addKey(EMPTY_STORE, "main", "wst_stored"), cfg);
      assert.equal(resolveApiKey(cfg), "wst_stored");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a whitespace-only env var is ignored (falls back)", () => {
    const { cfg, dir } = tmpCfg({ SELDONFRAME_API_KEY: "   " });
    try {
      saveStore(addKey(EMPTY_STORE, "main", "wst_stored"), cfg);
      assert.equal(resolveApiKey(cfg), "wst_stored");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("no env + empty store → null", () => {
    const { cfg, dir } = tmpCfg({});
    try {
      assert.equal(resolveApiKey(cfg), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runLoginCommand", () => {
  test("a valid, verified key is stored active and reports success", async () => {
    const { writer, out } = capture();
    const stored: { label: string; key: string }[] = [];
    const code = await runLoginCommand(loginArgs(), writer, {
      promptKey: async () => "wst_good",
      verifyKey: async () => true,
      storeKey: (label, key) => stored.push({ label, key }),
    });
    assert.equal(code, 0);
    assert.deepEqual(stored, [{ label: "main", key: "wst_good" }]);
    assert.match(out.join("\n"), /Logged in/);
  });

  test("the pasted key is trimmed before storing", async () => {
    const { writer } = capture();
    const stored: { label: string; key: string }[] = [];
    await runLoginCommand(loginArgs(), writer, {
      promptKey: async () => "  wst_x  ",
      verifyKey: async () => true,
      storeKey: (label, key) => stored.push({ label, key }),
    });
    assert.equal(stored[0]?.key, "wst_x");
  });

  test("--label overrides the stored label", async () => {
    const { writer } = capture();
    const stored: { label: string; key: string }[] = [];
    await runLoginCommand(loginArgs({ label: "ci" }), writer, {
      promptKey: async () => "wst_good",
      verifyKey: async () => true,
      storeKey: (label, key) => stored.push({ label, key }),
    });
    assert.equal(stored[0]?.label, "ci");
  });

  test("a non-wst_ paste is rejected and NOTHING is stored (no verify call)", async () => {
    const { writer, err } = capture();
    let stored = 0;
    let verified = 0;
    const code = await runLoginCommand(loginArgs(), writer, {
      promptKey: async () => "npm_t20c_wrong",
      verifyKey: async () => {
        verified += 1;
        return true;
      },
      storeKey: () => {
        stored += 1;
      },
    });
    assert.equal(code, 1);
    assert.equal(stored, 0);
    assert.equal(verified, 0, "a shape failure must short-circuit before verify");
    assert.match(err.join("\n"), /wst_/);
  });

  test("a key that fails verification is not stored", async () => {
    const { writer, err } = capture();
    let stored = 0;
    const code = await runLoginCommand(loginArgs(), writer, {
      promptKey: async () => "wst_good_shape_bad_auth",
      verifyKey: async () => false,
      storeKey: () => {
        stored += 1;
      },
    });
    assert.equal(code, 1);
    assert.equal(stored, 0);
    assert.match(err.join("\n"), /authenticate/);
  });

  test("a verifyKey that throws is treated as a failure (never stored)", async () => {
    const { writer } = capture();
    let stored = 0;
    const code = await runLoginCommand(loginArgs(), writer, {
      promptKey: async () => "wst_good",
      verifyKey: async () => {
        throw new Error("network down");
      },
      storeKey: () => {
        stored += 1;
      },
    });
    assert.equal(code, 1);
    assert.equal(stored, 0);
  });
});
