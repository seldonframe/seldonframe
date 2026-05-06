// ============================================================================
// v1.17.0 — partner-agency branding (effective-branding resolver)
// ============================================================================
//
// Pure helper that decides what chrome to show for a workspace:
// SF default vs. agency-substituted. Plus the DB-loading wrapper
// that takes a workspace_id and returns the effective branding.
//
// Plan-gate semantics: agencies in 'active' status get chrome
// substitution. Pending / suspended / archived agencies fall back
// to SF chrome (data preserved; reactivation flips the agency back
// to active and chrome substitution re-applies). The plan check
// itself happens at agency-state-transition time (register +
// nightly check) — this resolver trusts the status field.
//
// Defense in depth on sender + domain: even if the agency has
// set sender_email_address / agency_domain, we don't EXPOSE them
// to consumers until verified_sender_at / agency_domain_verified_at
// are populated. Otherwise emails would be rejected by Resend (DNS
// not set up) and HTTP traffic would 404 on Vercel (domain not
// pointed at us yet).

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, partnerAgencies } from "@/db/schema";
import type { PartnerAgency } from "@/db/schema";

const SF_DEFAULT_BRAND_NAME = "SeldonFrame";
const SF_DEFAULT_SUPPORT_URL = "https://seldonframe.com/docs";
const SF_DEFAULT_SUPPORT_EMAIL = "support@seldonframe.com";

// ─── public types ──────────────────────────────────────────────────────────

export interface EffectiveBranding {
  /** True when chrome substitution applies (agency is active +
   *  attached). Consumers branch on this to know whether to apply
   *  agency-specific styling vs SF defaults. */
  is_white_label: boolean;
  /** Display name shown in chrome (top nav, footer, email signature). */
  brand_name: string;
  /** Logo URL. NULL = no logo (consumer renders text-only brand_name). */
  logo_url: string | null;
  /** Brand color hex, e.g. "#5b21b6". NULL = use surface default. */
  primary_color: string | null;
  accent_color: string | null;
  /** Where help links point. ALWAYS populated (falls back to SF docs
   *  when agency hasn't configured one). */
  support_url: string;
  /** Operator-facing support address. ALWAYS populated. */
  support_email: string;
  /** Show "Powered by SeldonFrame" footer badge. False when an
   *  active agency has hide_powered_by_badge=true. */
  show_powered_by_badge: boolean;
  /** v1.18+ — sender address for outbound emails. NULL until
   *  verified by Resend. Consumers MUST check this field is non-null
   *  before substituting; emit from welcome@seldonframe.com otherwise. */
  sender_email_address: string | null;
  /** v1.20+ — agency-level custom domain (e.g. crm.acmeai.com).
   *  NULL until DNS-verified. Consumers building outbound URLs
   *  prefer this when set. */
  agency_domain: string | null;
}

export interface AgencyBrandingInput {
  agency: PartnerAgency | null;
  workspaceName: string;
}

// ─── pure: deriveEffectiveBranding ─────────────────────────────────────────

export function deriveEffectiveBranding(input: AgencyBrandingInput): EffectiveBranding {
  const a = input.agency;

  // Default-SF path: no agency, OR agency not in 'active' status.
  // Pending / suspended / archived all fall back to SF chrome.
  if (!a || a.status !== "active") {
    return {
      is_white_label: false,
      brand_name: SF_DEFAULT_BRAND_NAME,
      logo_url: null,
      primary_color: null,
      accent_color: null,
      support_url: SF_DEFAULT_SUPPORT_URL,
      support_email: SF_DEFAULT_SUPPORT_EMAIL,
      show_powered_by_badge: true,
      sender_email_address: null,
      agency_domain: null,
    };
  }

  // Active-agency path: substitute chrome.
  return {
    is_white_label: true,
    brand_name: a.name,
    logo_url: a.logoUrl,
    primary_color: a.primaryColor,
    accent_color: a.accentColor,
    support_url: a.supportUrl ?? SF_DEFAULT_SUPPORT_URL,
    support_email: a.supportEmail ?? SF_DEFAULT_SUPPORT_EMAIL,
    show_powered_by_badge: !a.hidePoweredByBadge,
    // Defense in depth: don't expose sender/domain until verified
    // by external systems (Resend / Vercel). See module-level note.
    sender_email_address: a.verifiedSenderAt ? a.senderEmailAddress : null,
    agency_domain: a.agencyDomainVerifiedAt ? a.agencyDomain : null,
  };
}

// ─── DB-loading wrapper ────────────────────────────────────────────────────

/** Look up the agency for a workspace + derive effective branding.
 *  Returns SF defaults when the workspace has no parent_agency_id
 *  (the common case pre-v1.17 + for free-tier workspaces). */
export async function getEffectiveBrandingForWorkspace(
  workspaceId: string,
): Promise<EffectiveBranding> {
  const [orgRow] = await db
    .select({ name: organizations.name, parentAgencyId: organizations.parentAgencyId })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);

  if (!orgRow) {
    // Workspace not found — return SF defaults rather than throwing.
    // Caller surfaces the workspace-not-found case separately if it
    // matters (route-level 404). The branding is just "SF defaults"
    // either way.
    return deriveEffectiveBranding({ agency: null, workspaceName: "" });
  }

  if (!orgRow.parentAgencyId) {
    return deriveEffectiveBranding({ agency: null, workspaceName: orgRow.name });
  }

  const [agencyRow] = await db
    .select()
    .from(partnerAgencies)
    .where(eq(partnerAgencies.id, orgRow.parentAgencyId))
    .limit(1);

  return deriveEffectiveBranding({
    agency: agencyRow ?? null,
    workspaceName: orgRow.name,
  });
}

/** Look up an agency by id. Returns null if not found. Used by
 *  MCP tools that operate on the agency itself rather than a
 *  specific workspace. */
export async function getAgencyById(agencyId: string): Promise<PartnerAgency | null> {
  const [row] = await db
    .select()
    .from(partnerAgencies)
    .where(eq(partnerAgencies.id, agencyId))
    .limit(1);
  return row ?? null;
}
