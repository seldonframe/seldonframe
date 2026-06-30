// args — the pure argv parser. Pins command/subcommand routing, the global
// --json flag, long/short flags, --flag=value, and boolean trailing flags.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { parseArgs } from "../src/lib/args.js";

describe("parseArgs", () => {
  test("no args → all empty/false", () => {
    const a = parseArgs([]);
    assert.equal(a.command, null);
    assert.equal(a.subcommand, null);
    assert.equal(a.json, false);
    assert.equal(a.help, false);
    assert.equal(a.version, false);
    assert.deepEqual(a.positionals, []);
  });

  test("--version / --help set their booleans with no command", () => {
    assert.equal(parseArgs(["--version"]).version, true);
    assert.equal(parseArgs(["-V"]).version, true);
    assert.equal(parseArgs(["--help"]).help, true);
    assert.equal(parseArgs(["-h"]).help, true);
  });

  test("global --json is captured anywhere and is not a command", () => {
    const a = parseArgs(["--json", "discover", "-q", "email"]);
    assert.equal(a.json, true);
    assert.equal(a.command, "discover");
    assert.equal(a.flags.query, "email");

    const b = parseArgs(["wallet", "balance", "--json"]);
    assert.equal(b.json, true);
    assert.equal(b.command, "wallet");
    assert.equal(b.subcommand, "balance");
  });

  test("keys + wallet take a subcommand; other commands do not", () => {
    const keys = parseArgs(["keys", "add", "--label", "main", "--key", "wst_x"]);
    assert.equal(keys.command, "keys");
    assert.equal(keys.subcommand, "add");
    assert.equal(keys.flags.label, "main");
    assert.equal(keys.flags.key, "wst_x");

    // discover does NOT own a subcommand → the 2nd non-flag is a positional.
    const disc = parseArgs(["discover", "foo"]);
    assert.equal(disc.command, "discover");
    assert.equal(disc.subcommand, null);
    assert.deepEqual(disc.positionals, ["foo"]);
  });

  test("short -q maps to query, -i maps to input", () => {
    const a = parseArgs(["discover", "-q", "send email"]);
    assert.equal(a.flags.query, "send email");

    const b = parseArgs(["run", "--type", "agent", "--id", "ace", "-i", "@payload.json"]);
    assert.equal(b.flags.type, "agent");
    assert.equal(b.flags.id, "ace");
    assert.equal(b.flags.input, "@payload.json");
  });

  test("--flag=value form is supported", () => {
    const a = parseArgs(["discover", "--query=hello", "--limit=5"]);
    assert.equal(a.flags.query, "hello");
    assert.equal(a.flags.limit, "5");
  });

  test("a long flag at the end with no value is a boolean true", () => {
    const a = parseArgs(["inspect", "--type", "tool", "--verbose"]);
    assert.equal(a.flags.type, "tool");
    assert.equal(a.flags.verbose, "true");
  });

  test("two flags in a row: the first is boolean, the second takes its value", () => {
    const a = parseArgs(["run", "--dry", "--id", "ace"]);
    assert.equal(a.flags.dry, "true");
    assert.equal(a.flags.id, "ace");
  });
});
