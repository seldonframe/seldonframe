// config-path — the OS config dir resolution. Pinned per-platform with an
// injected env/home so it's deterministic regardless of where the suite runs.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { resolveConfigDir, resolveKeyStorePath } from "../src/lib/config-path.js";

describe("resolveConfigDir", () => {
  test("an explicit SELDONFRAME_CONFIG_DIR override wins on every platform", () => {
    for (const platform of ["win32", "darwin", "linux"] as NodeJS.Platform[]) {
      const dir = resolveConfigDir({
        platform,
        homedir: "/home/x",
        env: { SELDONFRAME_CONFIG_DIR: "/custom/cfg" },
      });
      assert.equal(dir, "/custom/cfg");
    }
  });

  test("win32 uses %APPDATA%\\seldonframe", () => {
    const dir = resolveConfigDir({
      platform: "win32",
      homedir: "C:/Users/x",
      env: { APPDATA: "C:/Users/x/AppData/Roaming" },
    });
    assert.equal(dir, join("C:/Users/x/AppData/Roaming", "seldonframe"));
  });

  test("win32 falls back to ~/AppData/Roaming when APPDATA is unset", () => {
    const dir = resolveConfigDir({ platform: "win32", homedir: "C:/Users/x", env: {} });
    assert.equal(dir, join("C:/Users/x", "AppData", "Roaming", "seldonframe"));
  });

  test("darwin uses ~/Library/Application Support/seldonframe", () => {
    const dir = resolveConfigDir({ platform: "darwin", homedir: "/Users/x", env: {} });
    assert.equal(dir, join("/Users/x", "Library", "Application Support", "seldonframe"));
  });

  test("linux honors XDG_CONFIG_HOME, else ~/.config", () => {
    const withXdg = resolveConfigDir({
      platform: "linux",
      homedir: "/home/x",
      env: { XDG_CONFIG_HOME: "/home/x/.cfg" },
    });
    assert.equal(withXdg, join("/home/x/.cfg", "seldonframe"));

    const noXdg = resolveConfigDir({ platform: "linux", homedir: "/home/x", env: {} });
    assert.equal(noXdg, join("/home/x", ".config", "seldonframe"));
  });
});

describe("resolveKeyStorePath", () => {
  test("appends keys.json to the config dir", () => {
    const file = resolveKeyStorePath({ platform: "linux", homedir: "/home/x", env: {} });
    assert.equal(file, join("/home/x", ".config", "seldonframe", "keys.json"));
  });
});
