// "Fork this agent" — keyless buyer→builder conversion (virality pack, Task 3).
//
// forkListingIntoNewWorkspace is DI'd, reusing the EXACT gating the ChatGPT
// app's deps.ts deploy() uses: rate-limit → resolve PUBLISHED kind:'agent'
// listing by slug → REFUSE paid via storefrontPriceFromRow(listing).isPaid →
// createAnonymousWorkspace → clone the blueprint into a fresh draft
// agent_templates row (buildInstalledAgentTemplate's shape) → return both
// URLs. Every dependency is faked here — no DB, no network, no rate-limit
// backend.
//
// Same convention as chatgpt-mcp-handler.spec.ts / share-card.spec.ts:
// node:test + node:assert/strict, relative import, no framework.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  forkListingIntoNewWorkspace,
  type ForkListingDeps,
} from "../../../src/lib/marketplace/fork-listing";
import type { AgentListingForFork } from "../../../src/lib/marketplace/fork-listing";

const FREE_LISTING: AgentListingForFork = {
  id: "listing-1",
  slug: "review-requester",
  name: "Review Requester",
  kind: "agent",
  agentType: "chat_assistant",
  agentBlueprint: { greeting: "Hi!" } as unknown as AgentListingForFork["agentBlueprint"],
  price: 0,
  priceModel: "onetime",
  monthlyPriceCents: null,
  perCallPriceCents: null,
  perOutcomePriceCents: null,
  outcomeType: null,
};

const PAID_MONTHLY_LISTING: AgentListingForFork = {
  ...FREE_LISTING,
  id: "listing-2",
  slug: "booking-concierge",
  name: "Booking Concierge",
  priceModel: "monthly",
  monthlyPriceCents: 2900,
};

type Harness = {
  deps: ForkListingDeps;
  rateLimitCalls: string[];
  resolvedSlugs: string[];
  createdWorkspaces: Array<{ name: string }>;
  insertedTemplates: Array<{ builderOrgId: string; name: string }>;
  existingSlugCalls: string[];
};

function makeHarness(overrides?: Partial<ForkListingDeps>): Harness {
  const rateLimitCalls: string[] = [];
  const resolvedSlugs: string[] = [];
  const createdWorkspaces: Array<{ name: string }> = [];
  const insertedTemplates: Array<{ builderOrgId: string; name: string }> = [];
  const existingSlugCalls: string[] = [];

  const deps: ForkListingDeps = {
    checkRateLimit:
      overrides?.checkRateLimit ??
      (async (key: string) => {
        rateLimitCalls.push(key);
        return true;
      }),
    resolvePublishedAgentListing:
      overrides?.resolvePublishedAgentListing ??
      (async (slug: string) => {
        resolvedSlugs.push(slug);
        if (slug === FREE_LISTING.slug) return FREE_LISTING;
        if (slug === PAID_MONTHLY_LISTING.slug) return PAID_MONTHLY_LISTING;
        return null;
      }),
    createAnonymousWorkspace:
      overrides?.createAnonymousWorkspace ??
      (async (args: { name: string }) => {
        createdWorkspaces.push({ name: args.name });
        return {
          orgId: "org-new-1",
          slug: "review-requester-workspace",
          name: args.name,
          bearerToken: "wst_fake_token",
          bearerTokenExpiresAt: null,
          installedBlocks: ["crm"],
        };
      }),
    listExistingTemplateSlugs:
      overrides?.listExistingTemplateSlugs ??
      (async (orgId: string) => {
        existingSlugCalls.push(orgId);
        return [];
      }),
    insertAgentTemplate:
      overrides?.insertAgentTemplate ??
      (async (values: { builderOrgId: string; name: string }) => {
        insertedTemplates.push({ builderOrgId: values.builderOrgId, name: values.name });
        return { id: "template-new-1" };
      }),
    buildAdminUrl:
      overrides?.buildAdminUrl ??
      ((orgId: string, token: string) => `https://app.seldonframe.com/admin/${orgId}?token=${token}`),
    buildPublicUrl:
      overrides?.buildPublicUrl ??
      ((slug: string) => `https://${slug}.app.seldonframe.com`),
  };

  return { deps, rateLimitCalls, resolvedSlugs, createdWorkspaces, insertedTemplates, existingSlugCalls };
}

// ─── paid-listing refusal ────────────────────────────────────────────────────

describe("forkListingIntoNewWorkspace — paid listing refusal", () => {
  test("a monthly-priced listing is refused (isPaid via storefrontPriceFromRow) — no workspace created", async () => {
    const h = makeHarness();
    const result = await forkListingIntoNewWorkspace(
      { slug: PAID_MONTHLY_LISTING.slug, ip: "1.2.3.4" },
      h.deps,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /not available to fork|isn't free|not free/i);
    }
    assert.equal(h.createdWorkspaces.length, 0, "must never create a workspace for a paid listing");
    assert.equal(h.insertedTemplates.length, 0, "must never clone a paid listing's blueprint");
  });

  test("a onetime listing with price > 0 is also refused", async () => {
    const h = makeHarness({
      resolvePublishedAgentListing: async () => ({
        ...FREE_LISTING,
        slug: "priced-onetime",
        priceModel: "onetime",
        price: 4900,
      }),
    });
    const result = await forkListingIntoNewWorkspace({ slug: "priced-onetime", ip: "1.2.3.4" }, h.deps);
    assert.equal(result.ok, false);
    assert.equal(h.createdWorkspaces.length, 0);
  });
});

// ─── rate-limited refusal ────────────────────────────────────────────────────

describe("forkListingIntoNewWorkspace — rate limiting", () => {
  test("rate limit exceeded (hour) → refused, listing never resolved, no workspace created", async () => {
    let call = 0;
    const h = makeHarness({
      checkRateLimit: async () => {
        call += 1;
        // First check (hour) fails.
        return call > 1;
      },
    });
    const result = await forkListingIntoNewWorkspace({ slug: FREE_LISTING.slug, ip: "9.9.9.9" }, h.deps);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /limit/i);
    }
    assert.equal(h.createdWorkspaces.length, 0);
  });

  test("rate limit exceeded (day) → refused", async () => {
    let call = 0;
    const h = makeHarness({
      checkRateLimit: async () => {
        call += 1;
        // Second check (day) fails.
        return call !== 2;
      },
    });
    const result = await forkListingIntoNewWorkspace({ slug: FREE_LISTING.slug, ip: "9.9.9.9" }, h.deps);
    assert.equal(result.ok, false);
    assert.equal(h.createdWorkspaces.length, 0);
  });

  test("rate-limit keys are scoped to the caller's IP with the fork-listing prefix", async () => {
    const h = makeHarness();
    await forkListingIntoNewWorkspace({ slug: FREE_LISTING.slug, ip: "5.6.7.8" }, h.deps);
    assert.ok(h.rateLimitCalls.some((k) => k.includes("fork-listing:") && k.includes("5.6.7.8")));
  });
});

// ─── unknown slug refusal ────────────────────────────────────────────────────

describe("forkListingIntoNewWorkspace — unknown slug", () => {
  test("slug doesn't resolve to a published agent listing → friendly refusal, no workspace created", async () => {
    const h = makeHarness();
    const result = await forkListingIntoNewWorkspace({ slug: "does-not-exist", ip: "1.2.3.4" }, h.deps);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /not found|no.*agent|unknown|could not be found/i);
    }
    assert.equal(h.createdWorkspaces.length, 0);
  });
});

// ─── happy path ───────────────────────────────────────────────────────────────

describe("forkListingIntoNewWorkspace — happy path", () => {
  test("free listing: creates workspace THEN clones the blueprint, in that order, returns both URLs", async () => {
    const h = makeHarness();
    const order: string[] = [];
    const h2 = makeHarness({
      createAnonymousWorkspace: async (args: { name: string }) => {
        order.push("create");
        h.createdWorkspaces.push({ name: args.name });
        return {
          orgId: "org-new-1",
          slug: "review-requester-workspace",
          name: args.name,
          bearerToken: "wst_fake_token",
          bearerTokenExpiresAt: null,
          installedBlocks: ["crm"],
        };
      },
      insertAgentTemplate: async (values: { builderOrgId: string; name: string }) => {
        order.push("install");
        h.insertedTemplates.push({ builderOrgId: values.builderOrgId, name: values.name });
        return { id: "template-new-1" };
      },
    });

    const result = await forkListingIntoNewWorkspace({ slug: FREE_LISTING.slug, ip: "1.2.3.4" }, h2.deps);

    assert.deepEqual(order, ["create", "install"], "must create the workspace BEFORE installing the agent");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.adminUrl, "https://app.seldonframe.com/admin/org-new-1?token=wst_fake_token");
      assert.equal(result.publicUrl, "https://review-requester-workspace.app.seldonframe.com");
    }
  });

  test("workspace name is derived from the listing name (`${listing.name} Workspace`)", async () => {
    const h = makeHarness();
    await forkListingIntoNewWorkspace({ slug: FREE_LISTING.slug, ip: "1.2.3.4" }, h.deps);
    assert.equal(h.createdWorkspaces[0]?.name, "Review Requester Workspace");
  });

  test("the cloned template is inserted into the NEW org (not any pre-existing org)", async () => {
    const h = makeHarness();
    await forkListingIntoNewWorkspace({ slug: FREE_LISTING.slug, ip: "1.2.3.4" }, h.deps);
    assert.equal(h.insertedTemplates[0]?.builderOrgId, "org-new-1");
  });

  test("existing template slugs are looked up scoped to the NEW org (unique-slug resolution)", async () => {
    const h = makeHarness();
    await forkListingIntoNewWorkspace({ slug: FREE_LISTING.slug, ip: "1.2.3.4" }, h.deps);
    assert.deepEqual(h.existingSlugCalls, ["org-new-1"]);
  });

  test("insert failure (returns null/falsy id) → ok:false friendly refusal, not a throw", async () => {
    const h = makeHarness({
      insertAgentTemplate: async () => null,
    });
    const result = await forkListingIntoNewWorkspace({ slug: FREE_LISTING.slug, ip: "1.2.3.4" }, h.deps);
    assert.equal(result.ok, false);
  });

  // 2026-07-16 (marketplace generalize, Task 4) — the forked/installed
  // template must carry the listing's declared `templateVariables`
  // (AgentBlueprint.templateVariables, Task 1) so the installer hits the SAME
  // deploy-time TemplateVariablesForm as the original author. No code change
  // was needed for this: `structuredClone(listing.agentBlueprint)` already
  // deep-copies every field, templateVariables included — this test PROVES
  // that by construction rather than assuming it.
  test("a generalized listing's templateVariables survive the fork clone verbatim", async () => {
    const GENERALIZED_LISTING: AgentListingForFork = {
      ...FREE_LISTING,
      slug: "generalized-listing",
      agentBlueprint: {
        greeting: "Hi!",
        customSkillMd: "Forward replies to {contact_email}.",
        templateVariables: [
          { name: "contact_email", description: "Where replies go", example: "hi@acme.test" },
        ],
      } as unknown as AgentListingForFork["agentBlueprint"],
    };

    let capturedBlueprint: unknown;
    const h = makeHarness({
      resolvePublishedAgentListing: async (slug: string) =>
        slug === GENERALIZED_LISTING.slug ? GENERALIZED_LISTING : null,
      insertAgentTemplate: async (values: { blueprint: unknown }) => {
        capturedBlueprint = values.blueprint;
        return { id: "template-new-1" };
      },
    });

    const result = await forkListingIntoNewWorkspace(
      { slug: GENERALIZED_LISTING.slug, ip: "1.2.3.4" },
      h.deps,
    );

    assert.equal(result.ok, true);
    assert.deepEqual(
      (capturedBlueprint as { templateVariables?: unknown })?.templateVariables,
      GENERALIZED_LISTING.agentBlueprint?.templateVariables,
    );
    // Defensive-copy guarantee (existing invariant, re-asserted here): the
    // installed template's blueprint is NOT the same object reference as the
    // listing's — editing one must never reach back into the other.
    assert.notEqual(capturedBlueprint, GENERALIZED_LISTING.agentBlueprint);
  });
});
