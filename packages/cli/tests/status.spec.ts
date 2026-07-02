// runStatusCommand — renders the builder lifecycle honestly off GET
// /api/v1/workspace-state's `builder` block. T10 review, F3 adds a two-line
// additive render for `builder.voice_deployments[]` (suspended / low_balance)
// — mirrors the EXISTING `for (const a of b.agents ?? [])` loop pattern
// already in status.ts, so this is additive, not a restructuring.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ApiClient } from "../src/lib/api-client.js";
import { runStatusCommand } from "../src/commands/status.js";
import type { ParsedArgs } from "../src/lib/args.js";

function fakeClient(payload: unknown) {
  return new ApiClient({
    baseUrl: "https://app.seldonframe.com",
    apiKey: "wst_test",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    }),
  });
}

function capture() {
  const lines: string[] = [];
  const errs: string[] = [];
  return { writer: { out: (s: string) => lines.push(s), err: (s: string) => errs.push(s) }, lines, errs };
}

function argsWith(json = false): ParsedArgs {
  return { command: "status", subcommand: undefined, positionals: [], flags: {}, json } as unknown as ParsedArgs;
}

test("no active key → login hint, exit 1, no request made", async () => {
  const c = capture();
  const client = new ApiClient({
    baseUrl: "https://app.seldonframe.com",
    apiKey: null,
    fetchImpl: async () => {
      throw new Error("should not be called — hasKey() must short-circuit first");
    },
  });
  const code = await runStatusCommand(argsWith(), client, c.writer);
  assert.equal(code, 1);
  assert.match(c.errs.join("\n"), /seldonframe login/);
});

test("no voice_deployments field at all (pre-existing shape, chat-only builder) → unchanged output, no crash", async () => {
  const c = capture();
  const code = await runStatusCommand(
    argsWith(),
    fakeClient({ ok: true, builder: { agents: [], wallet_balance_usd: 12.5 } }),
    c.writer,
  );
  assert.equal(code, 0);
  const out = c.lines.join("\n");
  assert.match(out, /balance:\s+\$12\.50/);
  assert.doesNotMatch(out, /voice/i);
});

test("voice_deployments: [] (successfully computed, zero active sf_managed deployments) → no extra lines", async () => {
  const c = capture();
  const code = await runStatusCommand(
    argsWith(),
    fakeClient({ ok: true, builder: { agents: [], wallet_balance_usd: 12.5, voice_deployments: [] } }),
    c.writer,
  );
  assert.equal(code, 0);
  assert.doesNotMatch(c.lines.join("\n"), /suspended|low balance/i);
});

test("a healthy voice deployment (suspended:false, low_balance:false) → no warning line for it", async () => {
  const c = capture();
  const code = await runStatusCommand(
    argsWith(),
    fakeClient({
      ok: true,
      builder: {
        agents: [],
        wallet_balance_usd: 12.5,
        voice_deployments: [
          { deployment_id: "dep_healthy", voice_billing: { suspended: false, low_balance: false } },
        ],
      },
    }),
    c.writer,
  );
  assert.equal(code, 0);
  assert.doesNotMatch(c.lines.join("\n"), /dep_healthy/);
});

test("a suspended voice deployment → prints a suspended warning line naming it", async () => {
  const c = capture();
  const code = await runStatusCommand(
    argsWith(),
    fakeClient({
      ok: true,
      builder: {
        agents: [],
        wallet_balance_usd: 0,
        voice_deployments: [
          { deployment_id: "dep_suspended", voice_billing: { suspended: true, low_balance: false } },
        ],
      },
    }),
    c.writer,
  );
  assert.equal(code, 0);
  const out = c.lines.join("\n");
  assert.match(out, /dep_suspended/);
  assert.match(out, /suspended/i);
});

test("a low-balance (not suspended) voice deployment → prints a low-balance warning line naming it", async () => {
  const c = capture();
  const code = await runStatusCommand(
    argsWith(),
    fakeClient({
      ok: true,
      builder: {
        agents: [],
        wallet_balance_usd: 0.1,
        voice_deployments: [
          { deployment_id: "dep_low", voice_billing: { suspended: false, low_balance: true } },
        ],
      },
    }),
    c.writer,
  );
  assert.equal(code, 0);
  const out = c.lines.join("\n");
  assert.match(out, /dep_low/);
  assert.match(out, /low balance|low_balance/i);
});

test("--json relays the raw voice_deployments payload byte-for-byte", async () => {
  const c = capture();
  const payload = {
    ok: true,
    builder: {
      agents: [],
      voice_deployments: [{ deployment_id: "dep_1", voice_billing: { suspended: true, low_balance: true } }],
    },
  };
  const code = await runStatusCommand(argsWith(true), fakeClient(payload), c.writer);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(c.lines.join("")), payload.builder);
});
