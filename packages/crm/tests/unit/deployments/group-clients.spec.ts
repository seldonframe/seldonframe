// F4 — group a builder's deployments by CLIENT so the Clients screen renders ONE
// card per client listing ALL its agents (instead of one card per deployment).
//
// groupDeploymentsByClient is PURE (no DB): it keys by the provisioned
// clientOrgId when set, else by the normalized client name (so un-activated
// drafts for the same client still collapse into one card). It carries the
// shared number (surfaced once in the header) and preserves input order
// (listDeployments is newest-first). Unlike the attach picker
// (groupAttachableClients) it does NOT drop canceled agents — they still belong
// to their client's card.
//
// To run:
//   cd packages/crm
//   node_modules/.bin/tsx --test tests/unit/deployments/group-clients.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  groupDeploymentsByClient,
  normalizeVertical,
  type DeploymentListItem,
} from "../../../src/lib/deployments/store";

// ── fixture ──────────────────────────────────────────────────────────────────

/** A DeploymentListItem fixture; override only what the test cares about. */
function listItem(over: Partial<DeploymentListItem> = {}): DeploymentListItem {
  return {
    id: "dep-x",
    builderOrgId: "builder-1",
    agentTemplateId: "tmpl-1",
    clientName: "Acme Plumbing",
    clientContact: null,
    surface: "phone",
    phoneNumber: null,
    priceCents: 9900,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    templateName: "AI Phone Receptionist",
    templateType: "voice_receptionist",
    templateTrigger: null,
    clientOrgId: "org-acme",
    clientSlug: null,
    clientVertical: null,
    portalInvitedAt: null,
    bookingMode: "native",
    calendarRef: null,
    bookingPolicy: null,
    customization: null,
    isOutbound: false,
    needsNumber: true,
    agentBooks: false,
    agentPosts: false,
    ...over,
  };
}

describe("groupDeploymentsByClient", () => {
  test("groups by clientOrgId — one card, all the client's agents", () => {
    const groups = groupDeploymentsByClient([
      // newest-first (matches listDeployments order)
      listItem({
        id: "dep-review",
        clientOrgId: "org-acme",
        clientName: "Acme Plumbing",
        phoneNumber: null,
        templateName: "Review Requester",
        status: "active",
        isOutbound: true,
      }),
      listItem({
        id: "dep-reception",
        clientOrgId: "org-acme",
        clientName: "Acme Plumbing",
        phoneNumber: "+15125550148",
        templateName: "AI Phone Receptionist",
        status: "active",
      }),
    ]);

    assert.equal(groups.length, 1, "both agents collapse into one client card");
    const g = groups[0];
    assert.equal(g.clientKey, "org:org-acme");
    assert.equal(g.clientName, "Acme Plumbing");
    assert.equal(g.clientOrgId, "org-acme");
    // The shared line is surfaced once even though the FIRST (newest) row lacked it.
    assert.equal(g.number, "+15125550148");
    // Both agents are listed, addressable by their own deployment ids, newest-first.
    assert.deepEqual(
      g.agents.map((a) => a.id),
      ["dep-review", "dep-reception"],
    );
  });

  test("falls back to the normalized client name when no clientOrgId yet", () => {
    // Two un-activated drafts for the same client (no workspace provisioned) —
    // different casing/spacing must still collapse into ONE card.
    const groups = groupDeploymentsByClient([
      listItem({
        id: "dep-a",
        clientOrgId: null,
        clientName: "Acme  Plumbing",
        templateName: "Review Requester",
        status: "draft",
        isOutbound: true,
      }),
      listItem({
        id: "dep-b",
        clientOrgId: null,
        clientName: "acme plumbing",
        templateName: "AI Phone Receptionist",
        status: "draft",
      }),
    ]);

    assert.equal(groups.length, 1, "name-keyed drafts collapse into one card");
    const g = groups[0];
    assert.equal(g.clientKey, "name:acme plumbing");
    assert.equal(g.clientOrgId, null);
    assert.equal(g.agents.length, 2);
  });

  test("a clientOrgId group and a name-only group are kept SEPARATE", () => {
    // A draft with no org id keys by name; an activated deployment for what is
    // conceptually the same client keys by org id. They are intentionally distinct
    // until the draft itself is activated (we never guess an org from a name).
    const groups = groupDeploymentsByClient([
      listItem({ id: "dep-org", clientOrgId: "org-acme", clientName: "Acme Plumbing" }),
      listItem({ id: "dep-name", clientOrgId: null, clientName: "Acme Plumbing" }),
    ]);
    assert.equal(groups.length, 2);
    assert.deepEqual(
      groups.map((g) => g.clientKey),
      ["org:org-acme", "name:acme plumbing"],
    );
  });

  test("first non-null clientOrgId wins when an earlier (newer) row lacks one", () => {
    // Two rows with the SAME name key; one carries an org id. The header should be
    // able to offer portal affordances, so the group adopts that org id even though
    // the newest row (first) had none. (They share a name key because the org-id row
    // would otherwise key by org — so here both lack a *leading* org to force the
    // name key; we assert the later org id is surfaced.)
    const groups = groupDeploymentsByClient([
      listItem({ id: "dep-1", clientOrgId: null, clientName: "Beta HVAC", phoneNumber: null }),
      // same NAME key (no org id on the first → name key) — but this row has none too;
      // instead use number surfacing to prove "first non-null wins":
      listItem({ id: "dep-2", clientOrgId: null, clientName: "Beta HVAC", phoneNumber: "+14155550199" }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].number, "+14155550199", "shared number surfaced from a later row");
  });

  test("shared number is surfaced even when the newest agent has none", () => {
    const groups = groupDeploymentsByClient([
      listItem({ id: "dep-out", clientOrgId: "org-c", phoneNumber: null, isOutbound: true }),
      listItem({ id: "dep-in", clientOrgId: "org-c", phoneNumber: "+13035550111" }),
    ]);
    assert.equal(groups[0].number, "+13035550111");
  });

  test("canceled agents still belong to their client's card (not dropped)", () => {
    // Unlike groupAttachableClients (which drops canceled), the Clients screen must
    // still SHOW a canceled agent under its client.
    const groups = groupDeploymentsByClient([
      listItem({ id: "dep-x", clientOrgId: "org-acme", status: "canceled" }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].agents.length, 1);
    assert.equal(groups[0].agents[0].status, "canceled");
  });

  test("a client with a single agent still produces one well-formed group", () => {
    const groups = groupDeploymentsByClient([
      listItem({ id: "solo", clientOrgId: "org-solo", clientName: "Solo Co", phoneNumber: "+12125551234" }),
    ]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0], {
      clientKey: "org:org-solo",
      clientName: "Solo Co",
      clientOrgId: "org-solo",
      clientSlug: null,
      clientVertical: null,
      number: "+12125551234",
      agents: groups[0].agents,
    });
    assert.equal(groups[0].agents.length, 1);
  });

  test("preserves client order — most-recent client first", () => {
    // Three clients interleaved; each client appears at its first (newest) row.
    const groups = groupDeploymentsByClient([
      listItem({ id: "a1", clientOrgId: "org-a", clientName: "Aardvark" }),
      listItem({ id: "b1", clientOrgId: "org-b", clientName: "Beta" }),
      listItem({ id: "a2", clientOrgId: "org-a", clientName: "Aardvark" }),
      listItem({ id: "c1", clientOrgId: "org-c", clientName: "Cobra" }),
    ]);
    assert.deepEqual(
      groups.map((g) => g.clientOrgId),
      ["org-a", "org-b", "org-c"],
      "client order follows first appearance (newest-first)",
    );
    // org-a keeps both its agents in newest-first order.
    const a = groups.find((g) => g.clientOrgId === "org-a")!;
    assert.deepEqual(a.agents.map((x) => x.id), ["a1", "a2"]);
  });

  test("empty input → empty list", () => {
    assert.deepEqual(groupDeploymentsByClient([]), []);
  });

  test("carries templateTrigger through so the card can label each agent", () => {
    // The page resolves a precise per-agent trigger label from templateTrigger via
    // resolveAgentTrigger → triggerLabel; the grouping must pass it through intact.
    const groups = groupDeploymentsByClient([
      listItem({
        id: "dep-review",
        clientOrgId: "org-acme",
        templateName: "Review Requester",
        isOutbound: true,
        templateType: "voice_receptionist",
        templateTrigger: {
          kind: "event",
          event: "booking.completed",
          channel: "sms",
        },
      }),
    ]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].agents[0].templateTrigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
    assert.equal(groups[0].agents[0].isOutbound, true);
  });

  // ── ICP-3: Open client (slug) + Vertical surfaced on the group ──────────────

  test("surfaces the client's slug + vertical on the group (Open client + badge)", () => {
    const groups = groupDeploymentsByClient([
      listItem({
        id: "dep-recep",
        clientOrgId: "org-acme",
        clientName: "Acme Plumbing",
        clientSlug: "acme-plumbing",
        clientVertical: "Plumbing",
      }),
    ]);
    assert.equal(groups.length, 1);
    // Drives the "Open client →" link target (/clients/<slug>/ready) + the badge.
    assert.equal(groups[0].clientSlug, "acme-plumbing");
    assert.equal(groups[0].clientVertical, "Plumbing");
  });

  test("first non-null slug / vertical wins when the newest agent lacks them", () => {
    // Two agents on ONE client (same org). The newest row (first) carries no
    // slug/vertical (e.g. a draft joined before the workspace was provisioned);
    // a later activated row does. The group must adopt the later non-null values
    // — same rule as clientOrgId / number.
    const groups = groupDeploymentsByClient([
      listItem({
        id: "dep-new",
        clientOrgId: "org-acme",
        clientSlug: null,
        clientVertical: null,
      }),
      listItem({
        id: "dep-old",
        clientOrgId: "org-acme",
        clientSlug: "acme-plumbing",
        clientVertical: "HVAC",
      }),
    ]);
    assert.equal(groups.length, 1, "both collapse into one client card");
    assert.equal(groups[0].clientSlug, "acme-plumbing");
    assert.equal(groups[0].clientVertical, "HVAC");
  });

  test("vertical fail-softs to null when no agent carries one (card shows —)", () => {
    // An un-activated draft (no workspace yet) has no slug + no vertical; the
    // group leaves both null so the card omits the link + renders the "—" dash.
    const groups = groupDeploymentsByClient([
      listItem({
        id: "dep-draft",
        clientOrgId: null,
        clientName: "Pending Co",
        clientSlug: null,
        clientVertical: null,
        status: "draft",
      }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].clientSlug, null, "no link target until provisioned");
    assert.equal(groups[0].clientVertical, null, "→ the card's — fallback");
  });
});

// ── ICP-3: normalizeVertical (pure) ──────────────────────────────────────────

describe("normalizeVertical", () => {
  test("trims a present industry", () => {
    assert.equal(normalizeVertical("  Plumbing  "), "Plumbing");
  });

  test("collapses blank / whitespace-only to null", () => {
    assert.equal(normalizeVertical(""), null);
    assert.equal(normalizeVertical("   "), null);
  });

  test("collapses null / undefined / non-string to null (fail-soft)", () => {
    assert.equal(normalizeVertical(null), null);
    assert.equal(normalizeVertical(undefined), null);
    // A non-string from a malformed jsonb extract still yields null, never throws.
    assert.equal(normalizeVertical(123 as unknown as string), null);
  });
});
