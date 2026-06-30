// args — a tiny, pure argv parser (no dependency). Pure: argv array in, a
// structured ParsedArgs out. The CLI keeps deps minimal, so we parse by hand:
//
//   seldonframe [--json] <command> [<subcommand>] [--flag value | --flag=value | -x value] [positional…]
//
// Rules:
//   • `--json` is a global boolean flag, valid anywhere; it sets json=true and is
//     NOT recorded as a command/positional.
//   • `--help` / `-h` and `--version` / `-V` set their booleans (so they work
//     with or without a command).
//   • The FIRST non-flag token is the command; the SECOND non-flag token is the
//     subcommand ONLY for commands that take one (keys, wallet); otherwise the
//     second non-flag token is a positional.
//   • Long flags: `--name value` or `--name=value`. A long flag with no following
//     value (end of argv, or followed by another flag) is treated as a boolean true.
//   • Short flags map to long names via SHORT_ALIASES; they always consume the
//     next token as their value.
//
// Never throws; unknown flags are still captured (the command layer validates).

/** Commands whose second positional token is a subcommand, not a value. */
const SUBCOMMAND_OWNERS = new Set(["keys", "wallet"]);

/** Short flag → canonical long name. */
const SHORT_ALIASES: Record<string, string> = {
  q: "query",
  i: "input",
  h: "help",
  V: "version",
};

export type ParsedArgs = {
  command: string | null;
  subcommand: string | null;
  /** Named flags, canonicalized to their long name. Boolean flags map to "true". */
  flags: Record<string, string>;
  /** Leftover non-flag tokens (after command/subcommand). */
  positionals: string[];
  json: boolean;
  help: boolean;
  version: boolean;
};

function isFlag(tok: string): boolean {
  return tok.startsWith("-") && tok !== "-";
}

/** Canonical long name for a raw flag token (already stripped of leading dashes). */
function canonical(name: string): string {
  return SHORT_ALIASES[name] ?? name;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    command: null,
    subcommand: null,
    flags: {},
    positionals: [],
    json: false,
    help: false,
    version: false,
  };

  const tokens = Array.isArray(argv) ? argv.filter((t) => typeof t === "string") : [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (isFlag(tok)) {
      // Long flag, possibly --name=value.
      if (tok.startsWith("--")) {
        const body = tok.slice(2);
        const eq = body.indexOf("=");
        if (eq >= 0) {
          const name = canonical(body.slice(0, eq));
          const value = body.slice(eq + 1);
          setFlag(out, name, value);
          continue;
        }
        const name = canonical(body);
        // boolean unless a value token follows.
        const next = tokens[i + 1];
        if (next !== undefined && !isFlag(next) && !isBooleanFlag(name)) {
          setFlag(out, name, next);
          i++;
        } else {
          setFlag(out, name, "true");
        }
        continue;
      }

      // Short flag (-q, -i, -h, -V). Always consumes the next token as value
      // unless it's a known boolean (-h, -V) or no value follows.
      const name = canonical(tok.slice(1));
      const next = tokens[i + 1];
      if (!isBooleanFlag(name) && next !== undefined && !isFlag(next)) {
        setFlag(out, name, next);
        i++;
      } else {
        setFlag(out, name, "true");
      }
      continue;
    }

    // Non-flag token → command, then subcommand (for owners), then positionals.
    if (out.command === null) {
      out.command = tok;
    } else if (out.subcommand === null && SUBCOMMAND_OWNERS.has(out.command)) {
      out.subcommand = tok;
    } else {
      out.positionals.push(tok);
    }
  }

  return out;
}

/** Flags that are always booleans (never consume a following value). */
function isBooleanFlag(name: string): boolean {
  return name === "json" || name === "help" || name === "version";
}

function setFlag(out: ParsedArgs, name: string, value: string): void {
  if (name === "json") {
    out.json = true;
    return;
  }
  if (name === "help") {
    out.help = true;
    return;
  }
  if (name === "version") {
    out.version = true;
    return;
  }
  out.flags[name] = value;
}
