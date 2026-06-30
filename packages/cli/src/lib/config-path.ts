// config-path — where the local key store lives. Pure: resolves the OS config
// directory from an injected env + platform (no real fs, no process reads), so
// it unit-tests deterministically across Windows / macOS / Linux.
//
// Resolution mirrors the XDG / platform conventions:
//   • SELDONFRAME_CONFIG_DIR (explicit override) wins everywhere.
//   • win32              → %APPDATA%\seldonframe        (fallback ~/AppData/Roaming)
//   • darwin             → ~/Library/Application Support/seldonframe
//   • everything else    → $XDG_CONFIG_HOME/seldonframe (fallback ~/.config/seldonframe)
//
// The store file is keys.json inside that directory.

import { join } from "node:path";

export type ConfigEnv = {
  platform: NodeJS.Platform;
  homedir: string;
  env: Record<string, string | undefined>;
};

/** The app's config directory for the given platform/env. Pure. */
export function resolveConfigDir(cfg: ConfigEnv): string {
  const override = cfg.env.SELDONFRAME_CONFIG_DIR?.trim();
  if (override) return override;

  const home = cfg.homedir;

  if (cfg.platform === "win32") {
    const appData = cfg.env.APPDATA?.trim() || join(home, "AppData", "Roaming");
    return join(appData, "seldonframe");
  }

  if (cfg.platform === "darwin") {
    return join(home, "Library", "Application Support", "seldonframe");
  }

  const xdg = cfg.env.XDG_CONFIG_HOME?.trim() || join(home, ".config");
  return join(xdg, "seldonframe");
}

/** The absolute path of the key store file (keys.json) for this platform/env. */
export function resolveKeyStorePath(cfg: ConfigEnv): string {
  return join(resolveConfigDir(cfg), "keys.json");
}
