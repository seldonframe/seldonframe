// keys — the local key-store command (add / list / activate / remove). Operates
// purely on the on-disk store via key-store.ts; NEVER prints a full key (maskKey
// on every display). Returns an exit code; the CLI prints via the Writer.

import type { ParsedArgs } from "../lib/args.js";
import type { Writer } from "../lib/output.js";
import { emit } from "../lib/output.js";
import type { ConfigEnv } from "../lib/config-path.js";
import {
  loadStore,
  saveStore,
  addKey,
  activateKey,
  removeKey,
} from "../lib/key-store.js";
import { formatKeysList, maskKey, type StoredKeyView } from "../lib/format.js";

/** Build the masked, active-marked view of the store for list/--json output. */
function storeView(cfg: ConfigEnv): { keys: StoredKeyView[] } {
  const store = loadStore(cfg);
  return {
    keys: store.keys.map((k) => ({
      label: k.label,
      masked: maskKey(k.key),
      active: store.active === k.label,
    })),
  };
}

export function runKeysCommand(args: ParsedArgs, writer: Writer, cfg: ConfigEnv): number {
  const sub = args.subcommand;

  switch (sub) {
    case "add": {
      const label = (args.flags.label ?? "").trim();
      const key = (args.flags.key ?? "").trim();
      if (!label) {
        writer.err("keys add: --label <name> is required.");
        return 1;
      }
      if (!key) {
        writer.err("keys add: --key <wst_…> is required.");
        return 1;
      }
      if (!key.startsWith("wst_")) {
        writer.err("keys add: the key should be a workspace bearer that starts with `wst_`.");
        return 1;
      }
      const before = loadStore(cfg);
      const after = addKey(before, label, key);
      saveStore(after, cfg);
      const becameActive = after.active === label;
      if (args.json) {
        emit(writer, true, { added: label, masked: maskKey(key), active: becameActive }, () => "");
      } else {
        writer.out(
          `Added key "${label}" (${maskKey(key)})${becameActive ? " — now active" : ""}.`,
        );
      }
      return 0;
    }

    case "list": {
      const view = storeView(cfg);
      emit(writer, args.json, view, (v) => formatKeysList(v.keys));
      return 0;
    }

    case "activate": {
      const label = (args.positionals[0] ?? args.flags.label ?? "").trim();
      if (!label) {
        writer.err("keys activate <label>: a label is required.");
        return 1;
      }
      const before = loadStore(cfg);
      if (!before.keys.some((k) => k.label === label)) {
        writer.err(`keys activate: no stored key labeled "${label}".`);
        return 1;
      }
      const after = activateKey(before, label);
      saveStore(after, cfg);
      if (args.json) {
        emit(writer, true, { active: after.active }, () => "");
      } else {
        writer.out(`Active key is now "${label}".`);
      }
      return 0;
    }

    case "remove": {
      const label = (args.positionals[0] ?? args.flags.label ?? "").trim();
      if (!label) {
        writer.err("keys remove <label>: a label is required.");
        return 1;
      }
      const before = loadStore(cfg);
      if (!before.keys.some((k) => k.label === label)) {
        writer.err(`keys remove: no stored key labeled "${label}".`);
        return 1;
      }
      const after = removeKey(before, label);
      saveStore(after, cfg);
      if (args.json) {
        emit(writer, true, { removed: label, active: after.active }, () => "");
      } else {
        const note = after.active ? ` Active key is now "${after.active}".` : " No active key.";
        writer.out(`Removed key "${label}".${note}`);
      }
      return 0;
    }

    default:
      writer.err(
        "Usage: seldonframe keys <add|list|activate|remove> …\nSee `seldonframe --help`.",
      );
      return 1;
  }
}
