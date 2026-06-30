// commands — integration of the handlers with a fake Writer, a fake fetch, and a
// temp config dir. Verifies the wiring: keys never print raw, discover/inspect/
// run/wallet print + relay honestly, and run's exit code tracks status.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseArgs } from "../src/lib/args.js";
import type { Writer } from "../src/lib/output.js";
import type { ConfigEnv } from "../src/lib/config-path.js";
import { ApiClient, type FetchLike } from "../src/lib/api-client.js";
import { loadActiveKey } from "../src/lib/key-store.js";
import { runKeysCommand } from "../src/commands/keys.js";
import {
  runDiscoverCommand,
  runInspectCommand,
  runRunCommand,
  runWalletCommand,
} from "../src/commands/marketplace.js";

function capture(): { writer: Writer; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { writer: { out: (l) => out.push(l), err: (l) => err.push(l) }, out, err };
}

function tmpCfg(): { cfg: ConfigEnv; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "sf-cli-cmd-"));
  return {
    cfg: { platform: process.platform, homedir: dir, env: { SELDONFRAME_CONFIG_DIR: dir } },
    dir,
  };
}

function fixedFetch(json: unknown, status = 200): FetchLike {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    text: async () => JSON.stringify(json),
  });
}

function clientWith(fetchImpl: FetchLike, apiKey: string | null = "wst_x"): ApiClient {
  return new ApiClient({ baseUrl: "https://app.seldonframe.com", apiKey, fetchImpl });
}

describe("keys command", () => {
  test("add stores the key, marks it active, and prints it MASKED (not raw)", () => {
    const { cfg, dir } = tmpCfg();
    try {
      const { writer, out, err } = capture();
      const code = runKeysCommand(
        parseArgs(["keys", "add", "--label", "main", "--key", "wst_SUPERSECRET1234"]),
        writer,
        cfg,
      );
      assert.equal(code, 0);
      assert.equal(err.length, 0);
      const printed = out.join("\n");
      assert.ok(!printed.includes("SUPERSECRET"), "must not print the raw key");
      assert.match(printed, /wst_…1234/);
      assert.match(printed, /now active/);
      // and it really persisted as the active key
      assert.equal(loadActiveKey(cfg), "wst_SUPERSECRET1234");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("add rejects a non-wst key", () => {
    const { cfg, dir } = tmpCfg();
    try {
      const { writer, err } = capture();
      const code = runKeysCommand(
        parseArgs(["keys", "add", "--label", "x", "--key", "bad"]),
        writer,
        cfg,
      );
      assert.equal(code, 1);
      assert.match(err.join("\n"), /wst_/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("list shows masked keys; activate + remove update active", () => {
    const { cfg, dir } = tmpCfg();
    try {
      runKeysCommand(parseArgs(["keys", "add", "--label", "a", "--key", "wst_aaaa1111"]), capture().writer, cfg);
      runKeysCommand(parseArgs(["keys", "add", "--label", "b", "--key", "wst_bbbb2222"]), capture().writer, cfg);

      const list = capture();
      runKeysCommand(parseArgs(["keys", "list"]), list.writer, cfg);
      const listed = list.out.join("\n");
      assert.match(listed, /\* a/); // first added is active
      assert.match(listed, /wst_…1111/);
      assert.ok(!listed.includes("aaaa1111"));

      runKeysCommand(parseArgs(["keys", "activate", "b"]), capture().writer, cfg);
      assert.equal(loadActiveKey(cfg), "wst_bbbb2222");

      runKeysCommand(parseArgs(["keys", "remove", "b"]), capture().writer, cfg);
      // removing active "b" promotes "a"
      assert.equal(loadActiveKey(cfg), "wst_aaaa1111");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--json keys list emits machine JSON with masked keys", () => {
    const { cfg, dir } = tmpCfg();
    try {
      runKeysCommand(parseArgs(["keys", "add", "--label", "a", "--key", "wst_aaaa1111"]), capture().writer, cfg);
      const list = capture();
      runKeysCommand(parseArgs(["keys", "list", "--json"]), list.writer, cfg);
      const parsed = JSON.parse(list.out.join("\n")) as { keys: { masked: string }[] };
      assert.equal(parsed.keys[0].masked, "wst_…1111");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("discover command", () => {
  test("prints ranked results from the API", async () => {
    const fetchImpl = fixedFetch({
      count: 1,
      results: [
        {
          id: "ace",
          type: "agent",
          name: "Receptionist",
          description: "Answers calls.",
          price: { type: "per_call", amountCents: 10 },
          score: 5,
        },
      ],
    });
    const { writer, out } = capture();
    const code = await runDiscoverCommand(parseArgs(["discover", "-q", "calls"]), clientWith(fetchImpl), writer);
    assert.equal(code, 0);
    assert.match(out.join("\n"), /Receptionist/);
  });

  test("rejects a bad --limit", async () => {
    const { writer, err } = capture();
    const code = await runDiscoverCommand(
      parseArgs(["discover", "-q", "x", "--limit", "-3"]),
      clientWith(fixedFetch({})),
      writer,
    );
    assert.equal(code, 1);
    assert.match(err.join("\n"), /positive number/);
  });

  test("a 401 maps to the keys-add hint and exits 1", async () => {
    const { writer, err } = capture();
    const code = await runDiscoverCommand(
      parseArgs(["discover", "-q", "x"]),
      clientWith(fixedFetch({ error: "Unauthorized" }, 401)),
      writer,
    );
    assert.equal(code, 1);
    assert.match(err.join("\n"), /keys add/);
  });
});

describe("inspect command", () => {
  test("requires a valid --type", async () => {
    const { writer, err } = capture();
    const code = await runInspectCommand(
      parseArgs(["inspect", "--id", "x"]),
      clientWith(fixedFetch({})),
      writer,
    );
    assert.equal(code, 1);
    assert.match(err.join("\n"), /agent.*tool/);
  });

  test("prints the schema view", async () => {
    const fetchImpl = fixedFetch({
      id: "GMAIL_SEND_EMAIL",
      type: "tool",
      name: "Gmail — Send Email",
      description: "Send an email.",
      price: { type: "per_call", amountCents: 0 },
      inputSchema: { type: "object", properties: {}, additionalProperties: true },
      docUrl: "https://docs.composio.dev/toolkits/gmail",
    });
    const { writer, out } = capture();
    const code = await runInspectCommand(
      parseArgs(["inspect", "--type", "tool", "--id", "GMAIL_SEND_EMAIL"]),
      clientWith(fetchImpl),
      writer,
    );
    assert.equal(code, 0);
    assert.match(out.join("\n"), /Gmail — Send Email/);
    assert.match(out.join("\n"), /docs\.composio\.dev/);
  });
});

describe("run command", () => {
  test("a completed run prints output + HONEST billing and exits 0", async () => {
    const fetchImpl = fixedFetch({
      runId: "run_1",
      status: "completed",
      output: { reply: "Yes." },
      price: { type: "per_call", amountCents: 10 },
      billing: { calculatedCost: 100000, amountCents: 10, feeCents: 1, netCents: 9, charged: false, recorded: false },
    });
    const { writer, out } = capture();
    const code = await runRunCommand(
      parseArgs(["run", "--type", "agent", "--id", "ace", "-i", '{"message":"hi"}']),
      clientWith(fetchImpl),
      writer,
    );
    assert.equal(code, 0);
    const printed = out.join("\n");
    assert.match(printed, /Yes\./);
    assert.match(printed, /charged:  no/); // relays the API's charged:false honestly
  });

  test("an errored run (200 body, status:error) exits 1", async () => {
    const fetchImpl = fixedFetch({
      runId: "run_e",
      status: "error",
      error: "The agent failed to respond.",
      price: { type: "per_call", amountCents: 0 },
      billing: { calculatedCost: 0, amountCents: 0, feeCents: 0, netCents: 0, charged: false, recorded: false },
    });
    const { writer, out } = capture();
    const code = await runRunCommand(
      parseArgs(["run", "--type", "agent", "--id", "ace", "-i", '{"message":"hi"}']),
      clientWith(fetchImpl),
      writer,
    );
    assert.equal(code, 1);
    assert.match(out.join("\n"), /failed to respond/);
  });

  test("a 402 maps to the top-up hint and exits 1", async () => {
    const fetchImpl = fixedFetch({ status: "insufficient_balance", error: "Insufficient wallet balance." }, 402);
    const { writer, err } = capture();
    const code = await runRunCommand(
      parseArgs(["run", "--type", "agent", "--id", "ace", "-i", '{"message":"hi"}']),
      clientWith(fetchImpl),
      writer,
    );
    assert.equal(code, 1);
    assert.match(err.join("\n"), /top up/i);
  });

  test("invalid --input JSON is rejected before any network call", async () => {
    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
    };
    const { writer, err } = capture();
    const code = await runRunCommand(
      parseArgs(["run", "--type", "tool", "--id", "X", "-i", "{bad"]),
      clientWith(fetchImpl),
      writer,
    );
    assert.equal(code, 1);
    assert.equal(called, false);
    assert.match(err.join("\n"), /not valid JSON/);
  });
});

describe("wallet command", () => {
  test("prints balance + earnings", async () => {
    const fetchImpl = fixedFetch({
      balance: { value: 20, currency: "USD" },
      earnings: { value: 1.25, currency: "USD" },
    });
    const { writer, out } = capture();
    const code = await runWalletCommand(parseArgs(["wallet", "balance"]), clientWith(fetchImpl), writer);
    assert.equal(code, 0);
    assert.match(out.join("\n"), /\$20\.00 USD/);
    assert.match(out.join("\n"), /\$1\.25 USD/);
  });

  test("no active key → the keys-add hint (NoKeyError), exits 1", async () => {
    const { writer, err } = capture();
    const code = await runWalletCommand(
      parseArgs(["wallet", "balance"]),
      clientWith(fixedFetch({}), null),
      writer,
    );
    assert.equal(code, 1);
    assert.match(err.join("\n"), /keys add/);
  });
});
