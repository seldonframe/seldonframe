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
  contact: { singular: "Contact", plural: "Contacts" },
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
  "/automations",
  "/contacts",
  "/bookings",
  "/forms",
  "/conversations",
  "/emails",
  "/deals",
  "/proposals",
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
    // a primary link (no indent flag).
    for (const href of ["/dashboard", "/automations", "/contacts", "/conversations", "/deals"]) {
      const item = findItem(groups, href);
      assert.ok(item, `${href} should be present`);
      assert.notEqual(item?.indent, true, `${href} should be a primary noun, not indented`);
    }
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
    assert.equal(findItem(groups, "/automations")?.label, "Agents");
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

  test("hiding 'automations' removes the Agents noun (/automations)", () => {
    const groups = buildNavGroups(baseInput({ hiddenBlocks: ["automations"] }));
    assert.equal(hasHref(groups, "/automations"), false);
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
    for (const href of ["/clients", "/proposals", "/automations", "/docs", "/settings", "/super-admin", "/emails", "/forms", "/conversations"]) {
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
    for (const href of ["/dashboard", "/contacts", "/deals", "/bookings", "/conversations", "/emails", "/forms", "/automations", "/settings"]) {
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
