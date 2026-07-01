// runPayoutCommand — renders each PayoutResult status honestly (no money math in
// the CLI; it relays the server's verdict). Uses a real ApiClient with a fake
// fetch so the request wiring is exercised too.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ApiClient } from "../src/lib/api-client.js";
import { runPayoutCommand } from "../src/commands/payout.js";
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

const ARGS = { command: "payout", subcommand: undefined, positionals: [], flags: {}, json: false } as unknown as ParsedArgs;

test("paid → success line with amount", async () => {
  const c = capture();
  const code = await runPayoutCommand(ARGS, fakeClient({ status: "paid", amountUsd: 25, transferId: "tr_1" }), c.writer);
  assert.equal(code, 0);
  assert.match(c.lines.join("\n"), /\$25/);
  assert.match(c.lines.join("\n"), /bank/i);
});

test("connect_required → prints the onboarding link", async () => {
  const c = capture();
  const code = await runPayoutCommand(
    ARGS,
    fakeClient({ status: "connect_required", onboardingUrl: "https://app.seldonframe.com/build/wallet" }),
    c.writer,
  );
  assert.equal(code, 0);
  assert.match(c.lines.join("\n"), /build\/wallet/);
});

test("below_min → explains the minimum", async () => {
  const c = capture();
  const code = await runPayoutCommand(ARGS, fakeClient({ status: "below_min", withdrawableUsd: 4, minUsd: 10 }), c.writer);
  assert.equal(code, 0);
  assert.match(c.lines.join("\n"), /\$10/);
});

test("disabled → honest not-enabled line, exit 1", async () => {
  const c = capture();
  const code = await runPayoutCommand(ARGS, fakeClient({ status: "disabled" }), c.writer);
  assert.equal(code, 1);
});
