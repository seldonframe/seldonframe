// Unit tests for components/layout/nav-config.ts — the pure
// buildNavGroups() function that turns session facts (type, workspace
// count, enabled/hidden blocks, super-admin, primary org id) into the
// NavGroup[] the sidebar renders.
//
// 2026-06-20 — icp3-wedge: the left nav was refactored into a unified
// SIX-NOUN structure (Home · Agents · Customers · Inbox · Money ·
// Clients + a Settings/System group) that adapts by what the operator
// HAS, not who they are (Shopify-style one admin). These tests pin the
// non-regression contract: every legacy href must still appear exactly
// once, and the adaptive rules (solo hides Clients + switcher;
// multi-tenant shows them) must hold.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildNavGroups, type BuildNavInput } from "../../../src/components/layout/nav-config";
import type { NavGroup } from "../../../src/components/layout/sidebar-nav";

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

const LABELS = {
  contact: { singular: "Customer", plural: "Customers" },
  deal: { singular: "Deal", plural: "Deals" },
  intakeForm: { singular: "Intake Form", plural: "Intake Forms" },
};

function baseInput(overrides: Partial<BuildNavInput> = {}): BuildNavInput {
  return {
    sessionType: "agency",
    workspaceCount: 1,
    hiddenBlocks: [],
    isSuperAdmin: false,
    primaryOrgId: "org-primary",
    labels: LABELS,
    ...overrides,
  };
}

function allHrefs(groups: NavGroup[]): string[] {
  return groups.flatMap((g) => g.items.map((i) => i.href));
}

function hasHref(groups: NavGroup[], href: string): boolean {
  return allHrefs(groups).includes(href);
}

function countHref(groups: NavGroup[], href: string): number {
  return allHrefs(groups).filter((h) => h === href).length;
}

function findItem(groups: NavGroup[], href: string) {
  for (const g of groups) {
    const item = g.items.find((i) => i.href === href);
    if (item) return item;
  }
  return undefined;
}

// The full set of agency-session legacy hrefs that must remain
// reachable (the regression guard). The Clients portfolio href
// (/clients) is intentionally NOT in this list — it is gated on
// workspaceCount > 1 and asserted separately.
const AGENCY_CORE_HREFS = [
  "/dashboard",
  // ICP-3 — "Agents" noun now points at the Agent Builder (Studio); the
  // legacy /automations catalog hangs under it as an indented sub-item.
  "/studio/agents",
  "/automations",
  "/contacts",
  "/bookings",
  "/forms",
  "/conversations",
  "/emails",
  "/deals",
  "/proposals",
  // Composio managed-OAuth Connect surface (System group).
  "/integrations",
  "/docs",
  "/settings",
];

// ---------------------------------------------------------------------
// Agency — solo operator (workspaceCount <= 1)
// ---------------------------------------------------------------------

describe("buildNavGroups — agency, solo operator (workspaceCount <= 1)", () => {
  test("does NOT render the Clients (portfolio) noun", () => {
    const groups = buildNavGroups(baseInput({ workspaceCount: 1 }));
    assert.equal(hasHref(groups, "/clients"), false, "/clients must be hidden for a solo operator");
  });

  test("renders every legacy agency href exactly once", () => {
    const groups = buildNavGroups(baseInput({ workspaceCount: 1 }));
    for (const href of AGENCY_CORE_HREFS) {
      assert.equal(countHref(groups, href), 1, `${href} should appear exactly once`);
    }
  });

  test("renders the six core nouns as primary (non-indented) links", () => {
    const groups = buildNavGroups(baseInput({ workspaceCount: 1 }));
    // The five always-on nouns (Clients is the 6th, gated). Each must be
    // a primary link (no indent flag). ICP-3 — Agents is now /studio/agents.
    for (const href of ["/dashboard", "/studio/agents", "/contacts", "/conversations", "/deals"]) {
      const item = findItem(groups, href);
      assert.ok(item, `${href} should be present`);
      assert.notEqual(item?.indent, true, `${href} should be a primary noun, not indented`);
    }
  });

  test("renders Automations as a sub-item (indented) under Agents", () => {
    const groups = buildNavGroups(baseInput({ workspaceCount: 1 }));
    assert.equal(findItem(groups, "/automations")?.indent, true, "/automations should be a sub-item");
  });

  test("renders Bookings + Intake Forms as sub-items (indented) under Customers", () => {
    const groups = buildNavGroups(baseInput({ workspaceCount: 1 }));
    assert.equal(findItem(groups, "/bookings")?.indent, true, "/bookings should be a sub-item");
    assert.equal(findItem(groups, "/forms")?.indent, true, "/forms should be a sub-item");
  });

  test("renders Messaging as a sub-item under Inbox and Proposals under Money", () => {
    const groups = buildNavGroups(baseInput({ workspaceCount: 1 }));
    assert.equal(findItem(groups, "/emails")?.indent, true, "/emails (Messaging) should be a sub-item");
    assert.equal(findItem(groups, "/proposals")?.indent, true, "/proposals should be a sub-item");
  });

  test("Home/Agents/Customers/Inbox/Money use the new noun labels", () => {
    const groups = buildNavGroups(baseInput({ workspaceCount: 1 }));
    assert.equal(findItem(groups, "/dashboard")?.label, "Home");
    // ICP-3 — Agents noun → the Agent Builder; /automations is now "Automations".
    assert.equal(findItem(groups, "/studio/agents")?.label, "Agents");
    assert.equal(findItem(groups, "/automations")?.label, "Automations");
    assert.equal(findItem(groups, "/contacts")?.label, "Customers");
    assert.equal(findItem(groups, "/conversations")?.label, "Inbox");
    assert.equal(findItem(groups, "/deals")?.label, "Money");
  });
});

// ---------------------------------------------------------------------
// Agency — multi-tenant operator (workspaceCount > 1)
// ---------------------------------------------------------------------

describe("buildNavGroups — agency, multi-tenant operator (workspaceCount > 1)", () => {
  test("renders the Clients (portfolio) noun pointing at /clients", () => {
    const groups = buildNavGroups(baseInput({ workspaceCount: 3 }));
    assert.equal(countHref(groups, "/clients"), 1, "/clients must appear once for a multi-tenant operator");
  });

  test("the Clients noun is labelled 'Clients'", () => {
    const groups = buildNavGroups(baseInput({ workspaceCount: 3 }));
    assert.equal(findItem(groups, "/clients")?.label, "Clients");
  });

  test("still renders every legacy agency href exactly once", () => {
    const groups = buildNavGroups(baseInput({ workspaceCount: 3 }));
    for (const href of AGENCY_CORE_HREFS) {
      assert.equal(countHref(groups, href), 1, `${href} should appear exactly once`);
    }
  });
});

// ---------------------------------------------------------------------
// enabledBlocks / hiddenBlocks visibility filtering
// ---------------------------------------------------------------------

describe("buildNavGroups — hiddenBlocks filtering", () => {
  test("hiding 'deals' removes the Money noun (/deals)", () => {
    const groups = buildNavGroups(baseInput({ hiddenBlocks: ["deals"] }));
    assert.equal(hasHref(groups, "/deals"), false, "/deals should be filtered out");
  });

  test("hiding 'bookings' removes the Bookings sub-item", () => {
    const groups = buildNavGroups(baseInput({ hiddenBlocks: ["bookings"] }));
    assert.equal(hasHref(groups, "/bookings"), false, "/bookings should be filtered out");
    // Customers (/contacts) itself stays — only the sub-item drops.
    assert.equal(hasHref(groups, "/contacts"), true, "/contacts must remain");
  });

  test("hiding 'forms' removes the Intake Forms sub-item", () => {
    const groups = buildNavGroups(baseInput({ hiddenBlocks: ["forms"] }));
    assert.equal(hasHref(groups, "/forms"), false);
  });

  test("hiding 'automations' removes the Automations sub-item but keeps the Agents noun", () => {
    const groups = buildNavGroups(baseInput({ hiddenBlocks: ["automations"] }));
    // ICP-3 — /automations is the indented sub-item; hiding it drops the
    // sub-item only. The Agents noun (the Agent Builder) is not gated on it.
    assert.equal(hasHref(groups, "/automations"), false);
    assert.equal(hasHref(groups, "/studio/agents"), true, "Agents noun must remain");
  });

  test("hiding 'email' removes the Messaging sub-item (/emails)", () => {
    const groups = buildNavGroups(baseInput({ hiddenBlocks: ["email"] }));
    assert.equal(hasHref(groups, "/emails"), false);
  });

  test("contacts is NEVER filterable — hiding 'crm' keeps Customers visible", () => {
    // Mirrors the existing hiddenSlugToHref contract: `contacts` is a
    // baseline CRM surface with no hidden-slug mapping, so it can't be
    // dropped (otherwise the page becomes unreachable).
    const groups = buildNavGroups(baseInput({ hiddenBlocks: ["crm", "contacts"] }));
    assert.equal(hasHref(groups, "/contacts"), true, "/contacts must always remain");
  });

  test("does not drop an entire group to an empty shell (no titled group with zero items)", () => {
    const groups = buildNavGroups(baseInput({ hiddenBlocks: ["deals", "bookings", "forms", "automations", "email"] }));
    for (const g of groups) {
      assert.ok(g.items.length > 0, `group ${g.title ?? "(untitled)"} should not be empty`);
    }
  });
});

// ---------------------------------------------------------------------
// Super-admin
// ---------------------------------------------------------------------

describe("buildNavGroups — super-admin", () => {
  test("adds the SF Admin entry (/super-admin) for super-admins", () => {
    const groups = buildNavGroups(baseInput({ isSuperAdmin: true }));
    assert.equal(countHref(groups, "/super-admin"), 1);
    assert.equal(findItem(groups, "/super-admin")?.label, "SF Admin");
  });

  test("omits SF Admin for non-super-admins", () => {
    const groups = buildNavGroups(baseInput({ isSuperAdmin: false }));
    assert.equal(hasHref(groups, "/super-admin"), false);
  });
});

// ---------------------------------------------------------------------
// Integrations (Composio managed-OAuth Connect surface)
// ---------------------------------------------------------------------

describe("buildNavGroups — Integrations entry", () => {
  test("agency nav surfaces /integrations once, labelled 'Integrations', in System", () => {
    const groups = buildNavGroups(baseInput());
    assert.equal(countHref(groups, "/integrations"), 1);
    const item = findItem(groups, "/integrations");
    assert.equal(item?.label, "Integrations");
    // It lives in the System group (where Settings/Docs live).
    const sys = groups.find((g) => g.title === "SYSTEM");
    assert.ok(sys?.items.some((i) => i.href === "/integrations"), "Integrations must be in System");
  });

  test("a client-workspace operator can reach /integrations to connect their apps", () => {
    const groups = buildNavGroups(baseInput({ sessionType: "inside-client-workspace" }));
    assert.equal(countHref(groups, "/integrations"), 1);
  });

  test("Integrations respects super-admin-independent visibility (always present for agency)", () => {
    const groups = buildNavGroups(baseInput({ isSuperAdmin: false }));
    assert.equal(hasHref(groups, "/integrations"), true);
  });
});

// ---------------------------------------------------------------------
// Operator-portal session (sub-tenant magic-link operator)
// ---------------------------------------------------------------------

describe("buildNavGroups — operator-portal session", () => {
  test("renders exactly the trimmed CRM essentials, nothing more", () => {
    const groups = buildNavGroups(baseInput({ sessionType: "operator-portal" }));
    const hrefs = allHrefs(groups).sort();
    assert.deepEqual(hrefs, ["/bookings", "/contacts", "/dashboard", "/deals"].sort());
  });

  test("never shows agency-level surfaces (Clients, Proposals, Automations, Docs, Settings)", () => {
    const groups = buildNavGroups(baseInput({ sessionType: "operator-portal", workspaceCount: 5, isSuperAdmin: true }));
    for (const href of ["/clients", "/proposals", "/automations", "/studio/agents", "/integrations", "/docs", "/settings", "/super-admin", "/emails", "/forms", "/conversations"]) {
      assert.equal(hasHref(groups, href), false, `${href} must never appear in the operator portal`);
    }
  });

  test("respects hiddenBlocks (hiding 'deals' drops it from the portal too)", () => {
    const groups = buildNavGroups(baseInput({ sessionType: "operator-portal", hiddenBlocks: ["deals"] }));
    assert.equal(hasHref(groups, "/deals"), false);
    assert.equal(hasHref(groups, "/contacts"), true);
  });
});

// ---------------------------------------------------------------------
// Inside-client-workspace session (agency operator switched INTO a client)
// ---------------------------------------------------------------------

describe("buildNavGroups — inside-client-workspace session", () => {
  test("renders the full client workspace surface set", () => {
    const groups = buildNavGroups(baseInput({ sessionType: "inside-client-workspace" }));
    for (const href of ["/dashboard", "/contacts", "/deals", "/bookings", "/conversations", "/emails", "/forms", "/automations", "/integrations", "/settings"]) {
      assert.equal(hasHref(groups, href), true, `${href} should be reachable inside a client workspace`);
    }
  });

  test("includes a '← Back to agency' switch-workspace link to the primary org", () => {
    const groups = buildNavGroups(baseInput({ sessionType: "inside-client-workspace", primaryOrgId: "org-primary" }));
    const backItem = groups.flatMap((g) => g.items).find((i) => i.label.includes("Back to agency"));
    assert.ok(backItem, "a back-to-agency link must exist");
    assert.ok(backItem!.href.startsWith("/switch-workspace?to=org-primary"), "back link must switch to the primary org");
  });

  test("falls back to /clients for the back link when primaryOrgId is null", () => {
    const groups = buildNavGroups(baseInput({ sessionType: "inside-client-workspace", primaryOrgId: null }));
    const backItem = groups.flatMap((g) => g.items).find((i) => i.label.includes("Back to agency"));
    assert.ok(backItem, "a back-to-agency link must exist");
    assert.equal(backItem!.href, "/clients");
  });

  test("does NOT render the Clients portfolio noun, Proposals, or Docs (agency-only surfaces)", () => {
    const groups = buildNavGroups(baseInput({ sessionType: "inside-client-workspace", workspaceCount: 5 }));
    // /clients here is only ever the back-link FALLBACK (primaryOrgId
    // null); with a primaryOrgId set there is no bare /clients noun.
    assert.equal(hasHref(groups, "/clients"), false, "no Clients portfolio noun inside a client workspace");
    assert.equal(hasHref(groups, "/proposals"), false);
    assert.equal(hasHref(groups, "/docs"), false);
  });

  test("adds SF Admin for super-admins inside a client workspace", () => {
    const groups = buildNavGroups(baseInput({ sessionType: "inside-client-workspace", isSuperAdmin: true }));
    assert.equal(hasHref(groups, "/super-admin"), true);
  });
});

// ---------------------------------------------------------------------
// Simple-home module filter (2026-07-05) — enabledModules
// ---------------------------------------------------------------------

describe("buildNavGroups — enabledModules (simple-home nav filter)", () => {
  // (a) Zero-change guarantee: capture today's inside-client-workspace
  // output as the baseline BEFORE any enabledModules filtering, then
  // assert both null and undefined reproduce it exactly.
  const baselineGroups = buildNavGroups(baseInput({ sessionType: "inside-client-workspace" }));

  test("enabledModules: null reproduces the unfiltered baseline exactly (grandfathered)", () => {
    const groups = buildNavGroups(baseInput({ sessionType: "inside-client-workspace", enabledModules: null }));
    assert.deepEqual(groups, baselineGroups);
  });

  test("enabledModules: undefined reproduces the unfiltered baseline exactly (flag off)", () => {
    const groups = buildNavGroups(baseInput({ sessionType: "inside-client-workspace", enabledModules: undefined }));
    assert.deepEqual(groups, baselineGroups);
  });

  test("omitting enabledModules entirely also reproduces the unfiltered baseline", () => {
    const { enabledModules: _unused, ...rest } = baseInput({ sessionType: "inside-client-workspace" });
    const groups = buildNavGroups(rest as BuildNavInput);
    assert.deepEqual(groups, baselineGroups);
  });

  // (b) A narrow module set filters down to just those modules' items,
  // plus Settings/Back-to-agency (never filtered) + the new CTA.
  test("a narrow enabledModules set shows only the mapped items + Settings + the CTA", () => {
    const groups = buildNavGroups(
      baseInput({
        sessionType: "inside-client-workspace",
        enabledModules: ["home", "website", "bookings", "customers"],
      }),
    );

    for (const href of ["/dashboard", "/bookings", "/contacts", "/settings"]) {
      assert.equal(hasHref(groups, href), true, `${href} should remain`);
    }
    // Never-filtered items always survive regardless of module set.
    const backItem = groups.flatMap((g) => g.items).find((i) => i.label.includes("Back to agency"));
    assert.ok(backItem, "Back to agency must never be filtered");

    for (const href of ["/deals", "/automations", "/integrations", "/emails", "/conversations", "/forms"]) {
      assert.equal(hasHref(groups, href), false, `${href} should be filtered out`);
    }

    assert.equal(hasHref(groups, "/settings/features"), true, "Turn on more features CTA should appear");
    const cta = findItem(groups, "/settings/features");
    assert.equal(cta?.label, "Turn on more features");

    for (const g of groups) {
      assert.ok(g.items.length > 0, `group ${g.title ?? "(untitled)"} should not be an empty shell`);
    }
  });

  test("the CTA is appended to the LAST group only, once", () => {
    const groups = buildNavGroups(
      baseInput({
        sessionType: "inside-client-workspace",
        enabledModules: ["home", "website", "bookings", "customers"],
      }),
    );
    assert.equal(countHref(groups, "/settings/features"), 1);
    const lastGroup = groups[groups.length - 1];
    assert.ok(
      lastGroup.items.some((i) => i.href === "/settings/features"),
      "the CTA must live in the last group",
    );
  });

  // (c) "website" has no dedicated nav item in the inside-client-workspace
  // branch today (MODULE_TO_HREFS maps it to nothing) — it's reachable
  // from Home. Document that rather than inventing a new nav item.
  test("website module maps to no nav item (reachable from Home instead)", () => {
    const withWebsite = buildNavGroups(
      baseInput({ sessionType: "inside-client-workspace", enabledModules: ["home", "website"] }),
    );
    const withoutWebsite = buildNavGroups(
      baseInput({ sessionType: "inside-client-workspace", enabledModules: ["home"] }),
    );
    // Same hrefs whether or not "website" is included — it gates nothing
    // in this branch, so both produce the identical filtered set (minus
    // the CTA item's presence in both, which is identical either way).
    assert.deepEqual(allHrefs(withWebsite), allHrefs(withoutWebsite));
  });

  test("enabledModules only affects inside-client-workspace; agency/operator-portal sessions ignore it", () => {
    const agencyGroups = buildNavGroups(baseInput({ sessionType: "agency", enabledModules: ["home"] }));
    const agencyBaseline = buildNavGroups(baseInput({ sessionType: "agency" }));
    assert.deepEqual(agencyGroups, agencyBaseline);

    const portalGroups = buildNavGroups(baseInput({ sessionType: "operator-portal", enabledModules: ["home"] }));
    const portalBaseline = buildNavGroups(baseInput({ sessionType: "operator-portal" }));
    assert.deepEqual(portalGroups, portalBaseline);
  });
});
