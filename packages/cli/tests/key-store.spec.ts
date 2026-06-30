// key-store — the pure store operations (add/activate/remove/activeKey/coerce).
// The fs-backed load/save is exercised via a temp SELDONFRAME_CONFIG_DIR.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EMPTY_STORE,
  addKey,
  activateKey,
  removeKey,
  activeKey,
  coerceStore,
  loadStore,
  saveStore,
  loadActiveKey,
} from "../src/lib/key-store.js";
import type { ConfigEnv } from "../src/lib/config-path.js";

describe("addKey", () => {
  test("the first key added becomes active", () => {
    const s = addKey(EMPTY_STORE, "main", "wst_aaa");
    assert.equal(s.keys.length, 1);
    assert.equal(s.active, "main");
    assert.equal(activeKey(s), "wst_aaa");
  });

  test("a second key does NOT steal active from the first", () => {
    let s = addKey(EMPTY_STORE, "main", "wst_aaa");
    s = addKey(s, "alt", "wst_bbb");
    assert.equal(s.keys.length, 2);
    assert.equal(s.active, "main");
  });

  test("re-adding the same label replaces the key, keeps active", () => {
    let s = addKey(EMPTY_STORE, "main", "wst_aaa");
    s = addKey(s, "main", "wst_NEW");
    assert.equal(s.keys.length, 1);
    assert.equal(activeKey(s), "wst_NEW");
    assert.equal(s.active, "main");
  });
});

describe("activateKey", () => {
  test("switches the active key by label", () => {
    let s = addKey(addKey(EMPTY_STORE, "main", "wst_a"), "alt", "wst_b");
    s = activateKey(s, "alt");
    assert.equal(s.active, "alt");
    assert.equal(activeKey(s), "wst_b");
  });

  test("an unknown label is a no-op", () => {
    const s = addKey(EMPTY_STORE, "main", "wst_a");
    const after = activateKey(s, "ghost");
    assert.equal(after.active, "main");
  });
});

describe("removeKey", () => {
  test("removing the active key promotes the first remaining key", () => {
    let s = addKey(addKey(EMPTY_STORE, "main", "wst_a"), "alt", "wst_b");
    s = removeKey(s, "main");
    assert.equal(s.keys.length, 1);
    assert.equal(s.active, "alt");
  });

  test("removing the last key clears active to null", () => {
    let s = addKey(EMPTY_STORE, "main", "wst_a");
    s = removeKey(s, "main");
    assert.equal(s.keys.length, 0);
    assert.equal(s.active, null);
    assert.equal(activeKey(s), null);
  });
});

describe("coerceStore", () => {
  test("junk → empty store", () => {
    assert.deepEqual(coerceStore(null), EMPTY_STORE);
    assert.deepEqual(coerceStore(42), EMPTY_STORE);
    assert.deepEqual(coerceStore({ keys: "nope" }), EMPTY_STORE);
  });

  test("drops malformed key entries, repairs a dangling active", () => {
    const s = coerceStore({
      keys: [{ label: "ok", key: "wst_a" }, { label: 5 }, { key: "x" }],
      active: "missing",
    });
    assert.equal(s.keys.length, 1);
    assert.equal(s.keys[0].label, "ok");
    // active pointed at a missing label → repaired to the first key.
    assert.equal(s.active, "ok");
  });
});

describe("fs-backed load/save", () => {
  function tmpCfg(): { cfg: ConfigEnv; dir: string } {
    const dir = mkdtempSync(join(tmpdir(), "sf-cli-"));
    const cfg: ConfigEnv = {
      platform: process.platform,
      homedir: dir,
      env: { SELDONFRAME_CONFIG_DIR: dir },
    };
    return { cfg, dir };
  }

  test("a missing file loads the empty store", () => {
    const { cfg, dir } = tmpCfg();
    try {
      assert.deepEqual(loadStore(cfg), EMPTY_STORE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("save then load round-trips, and loadActiveKey reads the active key", () => {
    const { cfg, dir } = tmpCfg();
    try {
      const s = addKey(addKey(EMPTY_STORE, "main", "wst_aaa"), "alt", "wst_bbb");
      saveStore(s, cfg);

      const file = join(dir, "keys.json");
      assert.ok(existsSync(file));
      // The raw file contains the keys (plaintext store) — sanity that it wrote.
      assert.match(readFileSync(file, "utf8"), /wst_aaa/);

      const loaded = loadStore(cfg);
      assert.equal(loaded.keys.length, 2);
      assert.equal(loaded.active, "main");
      assert.equal(loadActiveKey(cfg), "wst_aaa");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a corrupt file loads the empty store (no throw)", () => {
    const { cfg, dir } = tmpCfg();
    try {
      const file = join(dir, "keys.json");
      // write garbage
      saveStore(EMPTY_STORE, cfg);
      writeFileSync(file, "{not json");
      assert.deepEqual(loadStore(cfg), EMPTY_STORE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
