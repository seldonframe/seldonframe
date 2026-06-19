// Voice Round-1 — MISSED-CALL TEXT-BACK tests (TDD, written first).
//
// The 4th R1 voice-receptionist feature: when a call to the workspace's voice
// number is NOT successfully handled by the OpenAI Realtime agent (it's
// missed / abandoned — no-answer, busy, failed, canceled, or the OpenAI accept
// fails so the SIP leg never engages), fire a speed-to-lead SMS back to the
// caller so the lead never reaches a competitor.
//
// DETECTION SIGNAL: a Twilio call-STATUS callback on the voice number / SIP
// trunk. The OpenAI Realtime topology routes the call leg to OpenAI's SIP
// endpoint (not a TwiML webhook), so the ONLY place Twilio surfaces the call's
// terminal OUTCOME is the StatusCallback. A "missed" terminal status (no-answer
// / busy / failed / canceled) means the agent never engaged → text back. A
// "completed" status means the agent answered (and the engaged-call post-call
// SMS already fired) → do NOT also send a missed-call text (no double-SMS).
//
// PATTERN (matches voice-r1-tools.spec.ts / run-voice-call.spec.ts): the repo
// prefers dependency-injection over node:test module mocking (tsx's CJS interop
// makes mock.module unreliable). So the side-effecting logic lives in an
// exported `runMissedCallTextBack` core that takes an injected deps bag; the
// route wraps it with the real deps. These tests drive the core directly with
// fakes — NO real DB, NO real Twilio.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  MISSED_CALL_STATUSES,
  isMissedCallStatus,
  buildMissedCallSmsBody,
  runMissedCallTextBack,
  type MissedCallTextBackDeps,
  type MissedCallVoiceConfig,
} from "../../../../src/lib/agents/voice/missed-call-textback";

// ─── a recording fake deps bag ──────────────────────────────────────────────
// Captures every SMS send + every idempotency probe so each test asserts the
// exact side effects. Defaults model the happy path (resolved workspace,
// feature ON, not-yet-texted); each test overrides the slice it exercises.

type SentSms = { orgId: string; toNumber: string; body: string };

function makeDeps(
  overrides: Partial<Omit<MissedCallTextBackDeps, "alreadyTexted">> & {
    config?: Partial<MissedCallVoiceConfig> | null;
    orgId?: string | null;
    /** Stub the idempotency probe's return value (true = already texted). */
    alreadyTexted?: boolean;
  } = {},
): { deps: MissedCallTextBackDeps; sent: SentSms[]; probes: Array<{ orgId: string; callSid: string }> } {
  const sent: SentSms[] = [];
  const probes: Array<{ orgId: string; callSid: string }> = [];

  const defaultConfig: MissedCallVoiceConfig = {
    enabled: true,
    message: null, // → builder default copy
    businessName: "Spark Heating & Cooling",
    orgSlug: "spark-heating-cooling",
    baseDomain: "app.seldonframe.com",
    metaPitch: false,
  };

  const deps: MissedCallTextBackDeps = {
    resolveOrgIdByNumber:
      overrides.resolveOrgIdByNumber ??
      (async () => (overrides.orgId === undefined ? "org-1" : overrides.orgId)),
    loadVoiceConfig:
      overrides.loadVoiceConfig ??
      (async () =>
        overrides.config === null
          ? null
          : { ...defaultConfig, ...(overrides.config ?? {}) }),
    alreadyTexted:
      overrides.alreadyTexted !== undefined
        ? async (orgId: string, callSid: string) => {
            probes.push({ orgId, callSid });
            return overrides.alreadyTexted as boolean;
          }
        : async (orgId: string, callSid: string) => {
            probes.push({ orgId, callSid });
            return false;
          },
    sendSms:
      overrides.sendSms ??
      (async (args: { orgId: string; toNumber: string; body: string }) => {
        sent.push({ orgId: args.orgId, toNumber: args.toNumber, body: args.body });
      }),
  };

  return { deps, sent, probes };
}

// Convenience — a well-formed missed-call status callback payload.
function missedEvent(over: Partial<Parameters<typeof runMissedCallTextBack>[0]> = {}) {
  return {
    callSid: "CA_test_001",
    callStatus: "no-answer",
    fromNumber: "+16505551234",
    toNumber: "+18392745430",
    ...over,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 0. status classification — what counts as "missed"
// ───────────────────────────────────────────────────────────────────────────

describe("missed-call status classification", () => {
  test("no-answer / busy / failed / canceled are missed", () => {
    for (const s of ["no-answer", "busy", "failed", "canceled"]) {
      assert.ok(isMissedCallStatus(s), `${s} should be missed`);
      assert.ok(MISSED_CALL_STATUSES.has(s as never), `${s} in the set`);
    }
  });

  test("completed / in-progress / ringing / queued are NOT missed (engaged or pre-terminal)", () => {
    for (const s of ["completed", "in-progress", "ringing", "queued", "initiated", ""]) {
      assert.equal(isMissedCallStatus(s), false, `${s} should not be missed`);
    }
  });

  test("Twilio's British spelling 'cancelled' is also treated as missed", () => {
    // Twilio sends "canceled" (one L) but accept either spelling defensively.
    assert.ok(isMissedCallStatus("cancelled"));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 1. SMS body builder — speed-to-lead copy
// ───────────────────────────────────────────────────────────────────────────

describe("buildMissedCallSmsBody", () => {
  test("default copy names the business, apologizes, and includes the booking link", () => {
    const body = buildMissedCallSmsBody({
      businessName: "Spark Heating & Cooling",
      bookUrl: "https://spark-heating-cooling.app.seldonframe.com/book",
    });
    assert.match(body, /Spark Heating & Cooling/);
    assert.match(body, /missed your call/i);
    assert.match(body, /spark-heating-cooling\.app\.seldonframe\.com\/book/);
  });

  test("an operator-supplied template fills {business} and {link} placeholders", () => {
    const body = buildMissedCallSmsBody({
      businessName: "Acme Plumbing",
      bookUrl: "https://acme.app.seldonframe.com/book",
      template: "Hi! {business} here — sorry we missed you. Book: {link}",
    });
    assert.equal(
      body,
      "Hi! Acme Plumbing here — sorry we missed you. Book: https://acme.app.seldonframe.com/book",
    );
  });

  test("a blank/whitespace template falls back to the default copy (never sends an empty SMS)", () => {
    const body = buildMissedCallSmsBody({
      businessName: "Acme",
      bookUrl: "https://x/book",
      template: "   ",
    });
    assert.ok(body.trim().length > 0);
    assert.match(body, /Acme/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. runMissedCallTextBack — the core (the TDD heart)
// ───────────────────────────────────────────────────────────────────────────

describe("runMissedCallTextBack — fires on a missed terminal status", () => {
  test("a no-answer call sends exactly ONE SMS to the caller, from the workspace, with the right body", async () => {
    const { deps, sent } = makeDeps();
    const result = await runMissedCallTextBack(missedEvent(), deps);

    assert.equal(result.action, "sent");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].orgId, "org-1");
    assert.equal(sent[0].toNumber, "+16505551234"); // the CALLER (From), not the business
    assert.match(sent[0].body, /Spark Heating & Cooling/);
    assert.match(sent[0].body, /missed your call/i);
    // booking link points at the workspace subdomain /book
    assert.match(sent[0].body, /spark-heating-cooling\.app\.seldonframe\.com\/book/);
  });

  test("busy and failed also fire the text-back", async () => {
    for (const callStatus of ["busy", "failed", "canceled"]) {
      const { deps, sent } = makeDeps();
      const result = await runMissedCallTextBack(missedEvent({ callStatus }), deps);
      assert.equal(result.action, "sent", `${callStatus} should send`);
      assert.equal(sent.length, 1, `${callStatus} sends one SMS`);
    }
  });

  test("the meta-pitch workspace links to the brand booking URL, not the subdomain", async () => {
    const { deps, sent } = makeDeps({ config: { metaPitch: true } });
    const result = await runMissedCallTextBack(missedEvent(), deps);
    assert.equal(result.action, "sent");
    assert.match(sent[0].body, /seldonstudio\.com\/book/);
  });

  test("an operator message template is used verbatim (with placeholders filled)", async () => {
    const { deps, sent } = makeDeps({
      config: { message: "Sorry we missed you — this is {business}. Text us back!" },
    });
    await runMissedCallTextBack(missedEvent(), deps);
    assert.equal(
      sent[0].body,
      "Sorry we missed you — this is Spark Heating & Cooling. Text us back!",
    );
  });
});

describe("runMissedCallTextBack — does NOT fire (no double-text / no-op)", () => {
  test("a completed (engaged) call does NOT send — the post-call SMS already covered it", async () => {
    const { deps, sent } = makeDeps();
    const result = await runMissedCallTextBack(missedEvent({ callStatus: "completed" }), deps);
    assert.equal(result.action, "skipped");
    assert.equal(result.reason, "not_missed");
    assert.equal(sent.length, 0);
  });

  test("a pre-terminal status (ringing / in-progress) does NOT send", async () => {
    for (const callStatus of ["ringing", "in-progress", "queued"]) {
      const { deps, sent } = makeDeps();
      const result = await runMissedCallTextBack(missedEvent({ callStatus }), deps);
      assert.equal(result.action, "skipped", `${callStatus} skips`);
      assert.equal(sent.length, 0);
    }
  });

  test("idempotency: the same CallSid seen twice sends only ONE SMS", async () => {
    // First delivery sends. Model the persisted marker by flipping alreadyTexted
    // true on the second delivery (the route's alreadyTexted reads smsMessages,
    // where the first send wrote a row tagged with this callSid).
    const first = makeDeps();
    const r1 = await runMissedCallTextBack(missedEvent(), first.deps);
    assert.equal(r1.action, "sent");
    assert.equal(first.sent.length, 1);

    const second = makeDeps({ alreadyTexted: true });
    const r2 = await runMissedCallTextBack(missedEvent(), second.deps);
    assert.equal(r2.action, "skipped");
    assert.equal(r2.reason, "already_texted");
    assert.equal(second.sent.length, 0);
  });

  test("the idempotency probe is scoped to the resolved org + this CallSid", async () => {
    const { deps, probes } = makeDeps();
    await runMissedCallTextBack(missedEvent({ callSid: "CA_xyz" }), deps);
    assert.equal(probes.length, 1);
    assert.equal(probes[0].orgId, "org-1");
    assert.equal(probes[0].callSid, "CA_xyz");
  });

  test("toggle OFF (blueprint.missedCallTextBack.enabled === false) → no SMS", async () => {
    const { deps, sent } = makeDeps({ config: { enabled: false } });
    const result = await runMissedCallTextBack(missedEvent(), deps);
    assert.equal(result.action, "skipped");
    assert.equal(result.reason, "disabled");
    assert.equal(sent.length, 0);
  });

  test("unknown workspace (number resolves to no org) → safe no-op, no SMS, no config load", async () => {
    let loadedConfig = false;
    const { deps, sent } = makeDeps({
      orgId: null,
      loadVoiceConfig: async () => {
        loadedConfig = true;
        return null;
      },
    });
    const result = await runMissedCallTextBack(missedEvent(), deps);
    assert.equal(result.action, "skipped");
    assert.equal(result.reason, "no_workspace");
    assert.equal(sent.length, 0);
    assert.equal(loadedConfig, false, "must not load config when no workspace matched");
  });

  test("anonymous caller (no From / 'anonymous') → safe no-op (can't text a number we don't have)", async () => {
    for (const fromNumber of ["", "anonymous", "Anonymous", "+"]) {
      const { deps, sent } = makeDeps();
      const result = await runMissedCallTextBack(missedEvent({ fromNumber }), deps);
      assert.equal(result.action, "skipped", `from='${fromNumber}' skips`);
      assert.equal(result.reason, "no_caller_number");
      assert.equal(sent.length, 0);
    }
  });

  test("missing CallSid → safe no-op (can't dedup without it)", async () => {
    const { deps, sent } = makeDeps();
    const result = await runMissedCallTextBack(missedEvent({ callSid: "" }), deps);
    assert.equal(result.action, "skipped");
    assert.equal(result.reason, "missing_call_sid");
    assert.equal(sent.length, 0);
  });

  test("workspace with no Twilio number configured (config null despite org match) → safe no-op", async () => {
    const { deps, sent } = makeDeps({ config: null });
    const result = await runMissedCallTextBack(missedEvent(), deps);
    assert.equal(result.action, "skipped");
    assert.equal(result.reason, "no_config");
    assert.equal(sent.length, 0);
  });
});

describe("runMissedCallTextBack — SMS-send failure is contained", () => {
  test("a Twilio send error does NOT throw out of the core (best-effort) and reports the failure", async () => {
    const { deps } = makeDeps({
      sendSms: async () => {
        throw new Error("twilio gateway 500");
      },
    });
    // Must not reject — the status callback must always 200 so Twilio doesn't retry-storm.
    const result = await runMissedCallTextBack(missedEvent(), deps);
    assert.equal(result.action, "error");
    assert.match(result.reason, /twilio gateway 500/);
  });
});
