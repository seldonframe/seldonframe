// ============================================================================
// v1.17.0 — partner-agency branding (pure helpers)
// ============================================================================
//
// Tests for the pure logic that decides what chrome to show: SF
// default vs. agency-substituted. Pure assembly so we can test
// without touching the DB.
//
// The DB-loading wrapper (getEffectiveBrandingForWorkspace) is
// integration territory and isn't tested here — its logic is just
// "look up parent_agency_id, if present pull the agency row, pass
// to deriveEffectiveBranding."

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveEffectiveBranding,
  type AgencyBrandingInput,
} from "@/lib/partner-agencies/branding";
import type { PartnerAgency } from "@/db/schema";

const SF_DEFAULT_INPUT: AgencyBrandingInput = {
  agency: null,
  workspaceName: "Cypress & Pine HVAC",
};

function agencyFixture(overrides: Partial<PartnerAgency> = {}): PartnerAgency {
  return {
    id: "agency-1",
    name: "Acme AI",
    slug: "acme-ai",
    logoUrl: "https://example.blob.com/acme-logo.png",
    primaryColor: "#5b21b6",
    accentColor: "#a78bfa",
    supportEmail: "support@acmeai.com",
    supportUrl: "https://help.acmeai.com",
    senderEmailAddress: null,
    resendDomainId: null,
    verifiedSenderAt: null,
    agencyDomain: null,
    agencyDomainVerifiedAt: null,
    ownerUserId: "user-1",
    status: "active",
    hidePoweredByBadge: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PartnerAgency;
}

// ─── default-SF case ───────────────────────────────────────────────────────

test("deriveEffectiveBranding returns SF defaults when no agency is attached", () => {
  const r = deriveEffectiveBranding(SF_DEFAULT_INPUT);
  assert.equal(r.brand_name, "SeldonFrame");
  assert.equal(r.is_white_label, false);
  assert.equal(r.show_powered_by_badge, true);
  // SF default support pointers must be present so the operator can
  // still get help.
  assert.match(r.support_url, /seldonframe/i);
});

test("deriveEffectiveBranding returns SF defaults when agency status is suspended", () => {
  // The plan-gate suspends agencies whose owner downgrades below
  // Scale. Suspended agencies fall back to SF chrome — data preserved,
  // chrome reverted, agency can reactivate by upgrading.
  const r = deriveEffectiveBranding({
    agency: agencyFixture({ status: "suspended" }),
    workspaceName: "X",
  });
  assert.equal(r.is_white_label, false);
  assert.equal(r.brand_name, "SeldonFrame");
});

test("deriveEffectiveBranding returns SF defaults when agency status is pending", () => {
  // Pending = not yet plan-gated through. Don't substitute chrome
  // until the agency has been confirmed Scale-tier.
  const r = deriveEffectiveBranding({
    agency: agencyFixture({ status: "pending" }),
    workspaceName: "X",
  });
  assert.equal(r.is_white_label, false);
});

test("deriveEffectiveBranding returns SF defaults when agency status is archived", () => {
  const r = deriveEffectiveBranding({
    agency: agencyFixture({ status: "archived" }),
    workspaceName: "X",
  });
  assert.equal(r.is_white_label, false);
});

// ─── active-agency case ───────────────────────────────────────────────────

test("deriveEffectiveBranding substitutes agency branding when status=active", () => {
  const r = deriveEffectiveBranding({
    agency: agencyFixture(),
    workspaceName: "Cypress & Pine HVAC",
  });
  assert.equal(r.is_white_label, true);
  assert.equal(r.brand_name, "Acme AI");
  assert.equal(r.logo_url, "https://example.blob.com/acme-logo.png");
  assert.equal(r.primary_color, "#5b21b6");
  assert.equal(r.support_email, "support@acmeai.com");
});

test("deriveEffectiveBranding hides powered-by badge when agency opts in", () => {
  const r = deriveEffectiveBranding({
    agency: agencyFixture({ hidePoweredByBadge: true }),
    workspaceName: "X",
  });
  assert.equal(r.show_powered_by_badge, false);
});

test("deriveEffectiveBranding shows powered-by badge when agency hasn't opted in", () => {
  const r = deriveEffectiveBranding({
    agency: agencyFixture({ hidePoweredByBadge: false }),
    workspaceName: "X",
  });
  assert.equal(r.show_powered_by_badge, true);
});

test("deriveEffectiveBranding falls back to SF support URL when agency hasn't set one", () => {
  // Agency may not have configured support_url yet (early in setup).
  // Don't leave the workspace pointing nowhere — fall back to SF docs.
  const r = deriveEffectiveBranding({
    agency: agencyFixture({ supportUrl: null, supportEmail: null }),
    workspaceName: "X",
  });
  assert.equal(r.is_white_label, true);
  assert.equal(r.brand_name, "Acme AI");
  // Support URL still present even though agency-specific is null.
  assert.match(r.support_url, /seldonframe/i);
});

test("deriveEffectiveBranding uses agency colors for accent + primary when set", () => {
  const r = deriveEffectiveBranding({
    agency: agencyFixture({ primaryColor: "#ff0000", accentColor: "#00ff00" }),
    workspaceName: "X",
  });
  assert.equal(r.primary_color, "#ff0000");
  assert.equal(r.accent_color, "#00ff00");
});

test("deriveEffectiveBranding falls back to null colors when agency hasn't set them", () => {
  // null primary/accent → consumer uses SF defaults (or workspace-
  // level theme, depending on the surface).
  const r = deriveEffectiveBranding({
    agency: agencyFixture({ primaryColor: null, accentColor: null }),
    workspaceName: "X",
  });
  assert.equal(r.primary_color, null);
  assert.equal(r.accent_color, null);
});

// ─── sender + domain echo (used by v1.18 + v1.20) ─────────────────────────

test("deriveEffectiveBranding echoes the verified sender address when present", () => {
  const r = deriveEffectiveBranding({
    agency: agencyFixture({
      senderEmailAddress: "welcome@acmeai.com",
      verifiedSenderAt: new Date(),
    }),
    workspaceName: "X",
  });
  assert.equal(r.sender_email_address, "welcome@acmeai.com");
});

test("deriveEffectiveBranding does NOT use sender address when verifiedSenderAt is null", () => {
  // Defense in depth: if the operator set the field but Resend
  // hasn't yet verified the DNS, don't actually send FROM that
  // address (Resend would reject and we'd lose the email).
  const r = deriveEffectiveBranding({
    agency: agencyFixture({
      senderEmailAddress: "welcome@acmeai.com",
      verifiedSenderAt: null,
    }),
    workspaceName: "X",
  });
  assert.equal(r.sender_email_address, null);
});

test("deriveEffectiveBranding echoes verified agency_domain when present", () => {
  const r = deriveEffectiveBranding({
    agency: agencyFixture({
      agencyDomain: "crm.acmeai.com",
      agencyDomainVerifiedAt: new Date(),
    }),
    workspaceName: "X",
  });
  assert.equal(r.agency_domain, "crm.acmeai.com");
});

test("deriveEffectiveBranding does NOT expose agency_domain until verified", () => {
  const r = deriveEffectiveBranding({
    agency: agencyFixture({
      agencyDomain: "crm.acmeai.com",
      agencyDomainVerifiedAt: null,
    }),
    workspaceName: "X",
  });
  assert.equal(r.agency_domain, null);
});
