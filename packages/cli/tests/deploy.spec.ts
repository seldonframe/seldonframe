// runDeployCommand — renders each DeployResult status honestly (no deploy logic
// lives in the CLI; it POSTs { source, phone } and relays the server's verdict).
// Uses a real ApiClient with a fake fetch so the request wiring is exercised too.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ApiClient } from "../src/lib/api-client.js";
import { runDeployCommand } from "../src/commands/deploy.js";
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

function erroringClient() {
  return new ApiClient({
    baseUrl: "https://app.seldonframe.com",
    apiKey: "wst_test",
    fetchImpl: async () => {
      throw new Error("connect ECONNREFUSED");
    },
  });
}

function capture() {
  const lines: string[] = [];
  const errs: string[] = [];
  return { writer: { out: (s: string) => lines.push(s), err: (s: string) => errs.push(s) }, lines, errs };
}

function argsWith(flags: Record<string, string>, json = false): ParsedArgs {
  return { command: "deploy", subcommand: undefined, positionals: [], flags, json } as unknown as ParsedArgs;
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
  const code = await runDeployCommand(argsWith({ template: "tmpl_1" }), client, c.writer);
  assert.equal(code, 1);
  assert.match(c.errs.join("\n"), /seldonframe login/);
});

test("needs_connect → prints the missing requirements + wizardUrl", async () => {
  const c = capture();
  const code = await runDeployCommand(
    argsWith({ template: "tmpl_1" }),
    fakeClient({
      ok: true,
      status: "needs_connect",
      deploymentId: "dep_1",
      requirements: [
        { kind: "calendar_oauth", toolkit: "googlecalendar", met: false, label: "Google Calendar" },
        { kind: "telephony", met: false, label: "Phone number" },
      ],
      missing: [
        { kind: "calendar_oauth", toolkit: "googlecalendar", met: false, label: "Google Calendar" },
        { kind: "telephony", met: false, label: "Phone number" },
      ],
      wizardUrl: "https://app.seldonframe.com/agent/dep_1/setup",
    }),
    c.writer,
  );
  assert.equal(code, 0);
  const out = c.lines.join("\n");
  assert.match(out, /Connect these once, then re-run `seldonframe deploy`/);
  assert.match(out, /Google Calendar/);
  assert.match(out, /Phone number/);
  assert.match(out, /https:\/\/app\.seldonframe\.com\/agent\/dep_1\/setup/);
});

test("live → prints the success line with the phone number", async () => {
  const c = capture();
  const code = await runDeployCommand(
    argsWith({ template: "tmpl_1" }),
    fakeClient({ ok: true, status: "live", deploymentId: "dep_1", phoneNumber: "+15551234567" }),
    c.writer,
  );
  assert.equal(code, 0);
  assert.match(c.lines.join("\n"), /✓ deployed — \+15551234567 is answering\./);
});

test("disabled → honest not-enabled line, exit 1", async () => {
  const c = capture();
  const code = await runDeployCommand(
    argsWith({ template: "tmpl_1" }),
    fakeClient({ ok: true, status: "disabled" }),
    c.writer,
  );
  assert.equal(code, 1);
  assert.match(c.errs.join("\n"), /enabled/i);
});

test("{ ok:false, reason } → prints the reason, exit 1", async () => {
  const c = capture();
  const code = await runDeployCommand(
    argsWith({ template: "tmpl_1" }),
    fakeClient({ ok: false, reason: "needs_telephony" }),
    c.writer,
  );
  assert.equal(code, 1);
  assert.match(c.errs.join("\n"), /needs_telephony/);
});

test("a fetch/network error → non-zero exit, honest message", async () => {
  const c = capture();
  const code = await runDeployCommand(argsWith({ template: "tmpl_1" }), erroringClient(), c.writer);
  assert.equal(code, 1);
  assert.ok(c.errs.length > 0);
});

test("no --template and no --listing → usage error, exit 1, no request made", async () => {
  const c = capture();
  const code = await runDeployCommand(
    argsWith({}),
    fakeClient({ ok: true, status: "live", deploymentId: "dep_1", phoneNumber: "+15551234567" }),
    c.writer,
  );
  assert.equal(code, 1);
  assert.match(c.errs.join("\n"), /--template|--listing/);
});

test("--json honors the raw payload for the live status", async () => {
  const c = capture();
  const payload = { ok: true, status: "live", deploymentId: "dep_1", phoneNumber: "+15551234567" };
  const code = await runDeployCommand(argsWith({ template: "tmpl_1" }, true), fakeClient(payload), c.writer);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(c.lines.join("")), payload);
});

test("--forward <e164> passes phone as { mode: forward, number }", async () => {
  let capturedBody: unknown;
  const client = new ApiClient({
    baseUrl: "https://app.seldonframe.com",
    apiKey: "wst_test",
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(init.body ?? "{}");
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, status: "live", deploymentId: "dep_1", phoneNumber: "+15551234567" }),
        text: async () => "",
      };
    },
  });
  const c = capture();
  await runDeployCommand(argsWith({ template: "tmpl_1", forward: "+15551234567" }), client, c.writer);
  assert.deepEqual(capturedBody, {
    source: { templateId: "tmpl_1" },
    phone: { mode: "forward", number: "+15551234567" },
  });
});

test("--area <code> passes phone as { mode: provision, areaCode }", async () => {
  let capturedBody: unknown;
  const client = new ApiClient({
    baseUrl: "https://app.seldonframe.com",
    apiKey: "wst_test",
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(init.body ?? "{}");
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, status: "live", deploymentId: "dep_1", phoneNumber: "+15551234567" }),
        text: async () => "",
      };
    },
  });
  const c = capture();
  await runDeployCommand(argsWith({ template: "tmpl_1", area: "415" }), client, c.writer);
  assert.deepEqual(capturedBody, {
    source: { templateId: "tmpl_1" },
    phone: { mode: "provision", areaCode: "415" },
  });
});

test("--listing <slug> resolves source.listingSlug instead of source.templateId", async () => {
  let capturedBody: unknown;
  const client = new ApiClient({
    baseUrl: "https://app.seldonframe.com",
    apiKey: "wst_test",
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(init.body ?? "{}");
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, status: "live", deploymentId: "dep_1", phoneNumber: null }),
        text: async () => "",
      };
    },
  });
  const c = capture();
  await runDeployCommand(argsWith({ listing: "ace-receptionist" }), client, c.writer);
  assert.deepEqual(capturedBody, { source: { listingSlug: "ace-receptionist" } });
});
