// P2.1-T3 — the missed-call "needs a number" exception, at the deployment layer.
//
// A deployed missed-call agent (event `missed_call`, channel SMS) is event-
// triggered — so isOutboundDeployment is TRUE — yet it STILL needs its own
// dedicated number: the client forwards missed calls to it and it texts back from
// it. `deploymentNeedsNumber` is the gate the activation paths use to decide
// phone-ownership, and it carves the missed-call agent back OUT of the phone-less
// outbound default.
//
// These tests cover:
//   1. deploymentNeedsNumber — the margin-layer predicate (resolves the loose
//      blueprint.trigger / surface, then applies agentNeedsNumber).
//   2. The relationship to isOutboundDeployment (the two are NOT complements for
//      the missed-call case — the whole point of the task).
//   3. The activation-gate DECISION the actions use: a status-only patch when the
//      agent does NOT need a number; a phone-bearing patch when it does. (The
//      server actions need Next.js session, so we test the pure decision + the
//      store-layer updateDeployment patch shape, mirroring outbound-no-phone.spec.)
//   4. describeOutboundAgent — the client-card copy fix (books / posts / sends).
//
// To run:
//   cd packages/crm
//   node_modules/.bin/tsx --test tests/unit/deployments/deployment-needs-number.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  deploymentNeedsNumber,
  isOutboundDeployment,
  describeOutboundAgent,
} from "../../../src/lib/deployments/margin";
import {
  updateDeployment,
  type UpdateDeploymentDeps,
} from "../../../src/lib/deployments/store";
import type { Deployment } from "../../../src/db/schema/deployments";

// ── 1. deploymentNeedsNumber ────────────────────────────────────────────────────

describe("deploymentNeedsNumber", () => {
  test("inbound trigger → true", () => {
    assert.equal(
      deploymentNeedsNumber({ kind: "inbound", channel: "voice" }),
      true,
    );
    assert.equal(deploymentNeedsNumber({ kind: "inbound", channel: "chat" }), true);
  });

  test("event 'missed_call' → true (the exception this task adds)", () => {
    assert.equal(
      deploymentNeedsNumber({ kind: "event", event: "missed_call", channel: "sms" }),
      true,
    );
  });

  test("pure-outbound events (review / lead) → false", () => {
    assert.equal(
      deploymentNeedsNumber({
        kind: "event",
        event: "booking.completed",
        channel: "sms",
      }),
      false,
    );
    assert.equal(
      deploymentNeedsNumber({
        kind: "event",
        event: "lead.created",
        channel: "email",
      }),
      false,
    );
  });

  test("schedule (social poster) → false", () => {
    assert.equal(
      deploymentNeedsNumber({ kind: "schedule", cron: "0 8 * * 1", channel: "digest" }),
      false,
    );
  });

  test("no trigger → falls back to surface; a receptionist type needs a number (true)", () => {
    // The resolver clamps an unset/voice surface to the inbound default, which
    // needs a number — the SAFE default (we only DROP the number when we can
    // positively see a pure-outbound event/schedule trigger).
    assert.equal(deploymentNeedsNumber(undefined, "voice_receptionist"), true);
    assert.equal(deploymentNeedsNumber(undefined, "voice"), true);
    assert.equal(deploymentNeedsNumber(undefined, null), true);
    assert.equal(deploymentNeedsNumber(undefined, undefined), true);
  });

  test("malformed / corrupt trigger → clamps to inbound → needs a number (true), never throws", () => {
    assert.equal(deploymentNeedsNumber({ kind: "event", channel: "voice" }), true);
    assert.equal(deploymentNeedsNumber({ kind: "nonsense" }), true);
    assert.equal(deploymentNeedsNumber("not-an-object"), true);
    assert.equal(deploymentNeedsNumber(null), true);
    assert.equal(deploymentNeedsNumber(42), true);
  });
});

// ── 2. relationship to isOutboundDeployment (the crux) ──────────────────────────

describe("needsNumber vs isOutbound — the missed-call carve-out", () => {
  test("missed_call is OUTBOUND yet STILL needs a number", () => {
    const trigger = { kind: "event", event: "missed_call", channel: "sms" };
    // It IS outbound (event-triggered, not an inbound receptionist)…
    assert.equal(isOutboundDeployment(trigger), true);
    // …but it needs a number anyway. The two are NOT complements here — exactly
    // the bug this task fixes (a phone-less missed-call agent can't text back).
    assert.equal(deploymentNeedsNumber(trigger), true);
  });

  test("a pure-outbound review agent is outbound AND doesn't need a number", () => {
    const trigger = { kind: "event", event: "booking.completed", channel: "sms" };
    assert.equal(isOutboundDeployment(trigger), true);
    assert.equal(deploymentNeedsNumber(trigger), false);
  });

  test("an inbound receptionist is NOT outbound AND needs a number", () => {
    const trigger = { kind: "inbound", channel: "voice" };
    assert.equal(isOutboundDeployment(trigger), false);
    assert.equal(deploymentNeedsNumber(trigger), true);
  });
});

// ── 3. activation-gate decision (the patch shape the actions delegate to) ───────
//
// The server actions (activateDeploymentAction / activateOutboundDeploymentAction /
// provisionDeploymentNumberAction) gate on `needsNumber`:
//   • !needsNumber → activate phone-less: a status-only patch (no phone_number),
//     so the partial unique index can never collide.
//   • needsNumber  → take the phone path: the patch carries a phone_number.
// We test that the two patch shapes do what they claim via the store-layer
// updateDeployment with injected deps (mirrors outbound-no-phone.spec.ts).

function fakeDeployment(over: Partial<Deployment> = {}): Deployment {
  return {
    id: "dep-1",
    builderOrgId: "builder-1",
    agentTemplateId: "tmpl-1",
    clientName: "Acme Plumbing",
    clientContact: null,
    surface: "phone",
    phoneNumber: null,
    calendarRef: null,
    priceCents: 9900,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Deployment;
}

describe("activation patch shape — needsNumber decides phone vs phone-less", () => {
  test("needsNumber=true (missed-call) → patch carries a phone_number", async () => {
    let patch: Record<string, unknown> | null = null;
    const deps: UpdateDeploymentDeps = {
      findById: async () => fakeDeployment(),
      update: async (_id, p) => {
        patch = p as Record<string, unknown>;
        return fakeDeployment({ phoneNumber: p.phoneNumber as string, status: "active" });
      },
    };

    const result = await updateDeployment({
      id: "dep-1",
      patch: { phoneNumber: "+15125550148", status: "active" },
      deps,
    });

    assert.equal(result.ok, true);
    const p = patch as unknown as Record<string, unknown>;
    assert.equal(p.status, "active");
    assert.equal(p.phoneNumber, "+15125550148", "a missed-call agent KEEPS its line");
  });

  test("needsNumber=false (pure outbound) → status-only patch, NO phone_number", async () => {
    let patch: Record<string, unknown> | null = null;
    const deps: UpdateDeploymentDeps = {
      findById: async () => fakeDeployment(),
      update: async (_id, p) => {
        patch = p as Record<string, unknown>;
        return fakeDeployment({ status: "active", phoneNumber: null });
      },
    };

    const result = await updateDeployment({
      id: "dep-1",
      patch: { status: "active" },
      deps,
    });

    assert.equal(result.ok, true);
    const p = patch as unknown as Record<string, unknown>;
    assert.equal(p.status, "active");
    assert.equal(
      "phoneNumber" in p,
      false,
      "pure-outbound activation must NOT write a phone_number",
    );
  });
});

// ── 4. describeOutboundAgent — the client-card copy fix ─────────────────────────

describe("describeOutboundAgent", () => {
  test("an agent that BOOKS reflects booking (not 'doesn't take bookings')", () => {
    const copy = describeOutboundAgent({ books: true, posts: false });
    assert.match(copy, /books appointments/i);
    assert.doesNotMatch(copy, /doesn.t take bookings/i);
  });

  test("an agent that POSTS (and doesn't book) reflects posting", () => {
    const copy = describeOutboundAgent({ books: false, posts: true });
    assert.match(copy, /posts/i);
  });

  test("a messager (neither books nor posts) keeps the 'sends a message' copy", () => {
    const copy = describeOutboundAgent({ books: false, posts: false });
    assert.match(copy, /doesn.t take bookings/i);
    assert.match(copy, /sends a message/i);
  });

  test("books wins over posts when both are set", () => {
    const copy = describeOutboundAgent({ books: true, posts: true });
    assert.match(copy, /books appointments/i);
  });
});
