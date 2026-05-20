// packages/crm/tests/integration/proposal-flow.spec.ts
// 2026-05-19 — Proposal Builder end-to-end integration test with mocked
// LLM. Requires a live DATABASE_URL. CI will exercise this; if no DB is
// available the test is skipped gracefully via the NODE_TEST_SKIP env var.
// Covers: createProposal (create + signed token + event) and
//         activateProposalWorkspace (status flip + event log).

import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";

const SKIP = !process.env.DATABASE_URL;

describe("Proposal flow end-to-end", { skip: SKIP ? "DATABASE_URL not set — skipping integration test" : false }, () => {
  // Imported lazily so module resolution is skipped when SKIP=true.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let schema: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let createProposal: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activateProposalWorkspace: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let eq: any;

  let agencyOrgId: string;
  let agencyUserId: string;
  let workspaceId: string;

  before(async () => {
    const dbMod = await import("@/db");
    const schemaMod = await import("@/db/schema");
    const createMod = await import("@/lib/proposals/create");
    const activateMod = await import("@/lib/proposals/activate-workspace");
    const drizzleMod = await import("drizzle-orm");
    db = dbMod.db;
    schema = schemaMod;
    createProposal = createMod.createProposal;
    activateProposalWorkspace = activateMod.activateProposalWorkspace;
    eq = drizzleMod.eq;

    // Insert agency org + user
    const [org] = await db
      .insert(schema.organizations)
      .values({ name: "Test Agency", slug: `test-agency-${Date.now()}` })
      .returning();
    agencyOrgId = org.id;

    const [user] = await db
      .insert(schema.users)
      .values({
        orgId: agencyOrgId,
        name: "Test Agency Operator",
        email: `agency-${Date.now()}@example.com`,
        agencyProfile: { name: "Test Agency" },
      })
      .returning();
    agencyUserId = user.id;

    // Pre-create a preview workspace
    const [ws] = await db
      .insert(schema.organizations)
      .values({
        name: "Test Prospect",
        slug: `test-prospect-${Date.now()}`,
        previewMode: true,
      })
      .returning();
    workspaceId = ws.id;
  });

  after(async () => {
    // Cleanup — only safe in a dedicated test DB.
    await db.delete(schema.organizations).where(eq(schema.organizations.id, workspaceId));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, agencyOrgId));
  });

  it("creates a proposal in draft status with signed token + monthlyPriceCents=49700 + logged 'created' event", async () => {
    const proposal = await createProposal({
      agencyOrgId,
      createdByUserId: agencyUserId,
      prospectUrl: "https://test-prospect.example.com",
      prospectName: "Test Prospect",
      prospectEmail: "prospect@example.com",
      prospectServices: ["test service"],
      agencyName: "Test Agency",
      pricing: { tier: "growth" },
      previewWorkspaceId: workspaceId,
      generateHtml: async () => "<section><h1>Test</h1></section>",
    });

    assert.equal(proposal.status, "draft");
    assert.match(proposal.signedToken, /^[A-Za-z0-9_-]{32,}$/);
    assert.equal(proposal.monthlyPriceCents, 49700);
    assert.equal(proposal.previewWorkspaceId, workspaceId);

    const events = await db
      .select()
      .from(schema.proposalEvents)
      .where(eq(schema.proposalEvents.proposalId, proposal.id));
    assert.ok(
      events.map((e: { eventType: string }) => e.eventType).includes("created"),
      "should log 'created' event",
    );
  });

  it("activateProposalWorkspace flips previewMode=false, status=accepted, logs checkout_success + workspace_activated", async () => {
    const [draft] = await db
      .select()
      .from(schema.proposals)
      .where(eq(schema.proposals.agencyOrgId, agencyOrgId))
      .limit(1);

    await activateProposalWorkspace({
      proposalId: draft.id,
      workspaceId,
      stripeSubscriptionId: "sub_test123",
      stripeCustomerId: "cus_test456",
      sessionId: "cs_test789",
    });

    const [updated] = await db
      .select()
      .from(schema.proposals)
      .where(eq(schema.proposals.id, draft.id))
      .limit(1);
    assert.equal(updated.status, "accepted");
    assert.equal(updated.stripeSubscriptionId, "sub_test123");

    const [ws] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, workspaceId))
      .limit(1);
    assert.equal(ws.previewMode, false);

    const events = await db
      .select()
      .from(schema.proposalEvents)
      .where(eq(schema.proposalEvents.proposalId, draft.id));
    const types = events.map((e: { eventType: string }) => e.eventType);
    assert.ok(types.includes("checkout_success"), "should log 'checkout_success'");
    assert.ok(types.includes("workspace_activated"), "should log 'workspace_activated'");
  });
});
