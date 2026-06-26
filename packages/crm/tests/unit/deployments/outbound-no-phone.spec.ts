// Bug fix — attaching a SECOND (outbound) agent to a client must not 500 on the
// `deployments_phone_number_uniq` index.
//
// The model: INBOUND agents (voice/chat receptionist) OWN a unique phone — they
// RECEIVE there. OUTBOUND agents (event/schedule — review-requester,
// speed-to-lead, digests) only SEND, from the client org's existing number via
// sendSmsFromApi (keyed by orgId, NOT the deployment's phone_number). So an
// outbound deployment must activate with phone_number = NULL, which the partial
// unique index (non-null only) can never collide with — letting many agents
// share one client number.
//
// These tests cover:
//   1. isOutboundDeployment — the pure inbound/outbound predicate (the rule that
//      decides phone ownership), resolved from the template's blueprint.trigger.
//   2. The activation contract: an outbound deployment is activated WITHOUT a
//      phone_number in the patch (status:'active' only), so no unique-index
//      collision is possible; an inbound deployment still gets its number.
//
// No DB, no Next.js "use server" machinery — pure helper + store-layer
// updateDeployment with injected deps (mirrors activate.spec.ts).
//
// To run:
//   cd packages/crm
//   node_modules/.bin/tsx --test tests/unit/deployments/outbound-no-phone.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { isOutboundDeployment } from "../../../src/lib/deployments/margin";
import {
  updateDeployment,
  type UpdateDeploymentDeps,
} from "../../../src/lib/deployments/store";
import type { Deployment } from "../../../src/db/schema/deployments";

// ── 1. isOutboundDeployment ─────────────────────────────────────────────────────

describe("isOutboundDeployment", () => {
  test("event trigger → outbound (true)", () => {
    assert.equal(
      isOutboundDeployment({ kind: "event", event: "booking.completed", channel: "sms" }),
      true,
    );
    assert.equal(
      isOutboundDeployment({ kind: "event", event: "lead.created", channel: "email" }),
      true,
    );
  });

  test("schedule trigger → outbound (true)", () => {
    assert.equal(
      isOutboundDeployment({ kind: "schedule", cron: "0 8 * * 1", channel: "digest" }),
      true,
    );
  });

  test("inbound trigger → NOT outbound (false)", () => {
    assert.equal(isOutboundDeployment({ kind: "inbound", channel: "voice" }), false);
    assert.equal(isOutboundDeployment({ kind: "inbound", channel: "chat" }), false);
  });

  test("no trigger → falls back to surface; a receptionist type is inbound (false)", () => {
    // No explicit blueprint.trigger → resolveAgentTrigger uses the surface, and an
    // unknown/voice surface clamps to the inbound default. This is the SAFE
    // default: we only skip the phone when we can POSITIVELY see event/schedule.
    assert.equal(isOutboundDeployment(undefined, "voice_receptionist"), false);
    assert.equal(isOutboundDeployment(undefined, "voice"), false);
    assert.equal(isOutboundDeployment(undefined, null), false);
    assert.equal(isOutboundDeployment(undefined, undefined), false);
  });

  test("malformed / corrupt trigger → clamps to inbound (false) — never throws", () => {
    // A stored channel the kind can't speak (event+voice) or junk shapes must NOT
    // be treated as outbound — they clamp to the inbound default (phone-owning).
    assert.equal(isOutboundDeployment({ kind: "event", channel: "voice" }), false);
    assert.equal(isOutboundDeployment({ kind: "nonsense" }), false);
    assert.equal(isOutboundDeployment("not-an-object"), false);
    assert.equal(isOutboundDeployment(null), false);
    assert.equal(isOutboundDeployment(42), false);
  });
});

// ── 2. activation contract — outbound activates phone-less ──────────────────────

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

describe("outbound activation — updateDeployment with status only (no phone)", () => {
  test("outbound: patch carries status:'active' and NO phone_number", async () => {
    // This mirrors what activateOutboundDeploymentAction /
    // activateDeploymentAction(outbound) delegate to: a status-only patch. A
    // patch with no phoneNumber key can never write a duplicate non-null number,
    // so the partial unique index `deployments_phone_number_uniq` can't collide —
    // even when the client already has an inbound receptionist holding a number.
    let updateArgs: { id: string; patch: Record<string, unknown> } | null = null;
    const deps: UpdateDeploymentDeps = {
      findById: async () => fakeDeployment(),
      update: async (id, patch) => {
        updateArgs = { id, patch: patch as Record<string, unknown> };
        return fakeDeployment({ status: "active", phoneNumber: null });
      },
    };

    const result = await updateDeployment({
      id: "dep-1",
      patch: { status: "active" },
      deps,
    });

    assert.equal(result.ok, true);
    assert.ok(updateArgs, "update must be called");
    const args = updateArgs as { id: string; patch: Record<string, unknown> };
    assert.equal(args.patch.status, "active");
    // The crux: phoneNumber must be ABSENT from the patch (it was never set), so
    // the row's phone_number stays null and the unique index is untouched.
    assert.equal(
      "phoneNumber" in args.patch,
      false,
      "outbound activation must NOT write phone_number",
    );
  });

  test("a second outbound deployment never touches the number a sibling already holds", async () => {
    // Sibling receptionist owns +1512… ; the outbound row is activated with a
    // status-only patch and so cannot collide on the partial unique index.
    let wrotePhone = false;
    const deps: UpdateDeploymentDeps = {
      findById: async () => fakeDeployment({ agentTemplateId: "tmpl-review" }),
      update: async (_id, patch) => {
        if ("phoneNumber" in patch) wrotePhone = true;
        return fakeDeployment({ status: "active" });
      },
    };

    const result = await updateDeployment({
      id: "dep-1",
      patch: { status: "active" },
      deps,
    });

    assert.equal(result.ok, true);
    assert.equal(wrotePhone, false, "outbound activation must not write any phone_number");
  });
});
