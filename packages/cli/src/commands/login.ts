// login — `seldonframe login`: the one-command, foolproof key setup.
//
// Instead of `keys add --label main --key wst_…` (where a shell paste can be
// truncated or a wrong token slipped in), login PROMPTS for the key (paste into
// a prompt survives PowerShell/quoting), VERIFIES it against the live API
// immediately (so you get a ✓ or a clear failure — you never find out later on a
// random command), and stores it as active. Effects are injected (promptKey /
// verifyKey / storeKey), so the whole flow is unit-tested with zero stdin or
// network.

import type { ParsedArgs } from "../lib/args.js";
import type { Writer } from "../lib/output.js";

/** Injected effects so login is testable without a terminal or the network. */
export type LoginDeps = {
  /** Read the pasted key from the user (a prompt). */
  promptKey: (question: string) => Promise<string>;
  /** Verify a key actually authenticates against the live API (true = valid). */
  verifyKey: (key: string) => Promise<boolean>;
  /** Persist the key as the active one (label defaults to "main"). */
  storeKey: (label: string, key: string) => void;
};

export async function runLoginCommand(
  args: ParsedArgs,
  writer: Writer,
  deps: LoginDeps,
): Promise<number> {
  const label = (args.flags.label ?? "main").trim() || "main";

  writer.out("Mint or copy a workspace key at https://app.seldonframe.com/build/keys,");
  writer.out("then paste it here.");
  const raw = (await deps.promptKey("Paste your wst_ key: ")).trim();

  if (!raw.startsWith("wst_")) {
    writer.err(
      "That doesn't look like a workspace key — it should start with `wst_`. " +
        "(Did you paste an npm/other token by mistake?) Nothing was stored.",
    );
    return 1;
  }

  writer.out("Verifying…");
  let ok = false;
  try {
    ok = await deps.verifyKey(raw);
  } catch {
    ok = false;
  }
  if (!ok) {
    writer.err(
      "That key didn't authenticate. Mint a fresh one at " +
        "https://app.seldonframe.com/build/keys and run `seldonframe login` again.",
    );
    return 1;
  }

  deps.storeKey(label, raw);
  writer.out(`✓ Logged in — key stored as "${label}" (active). Try: seldonframe wallet balance`);
  return 0;
}
