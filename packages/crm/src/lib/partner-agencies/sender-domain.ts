// ============================================================================
// v1.18.0 — partner-agency sender domain orchestration
// ============================================================================
//
// Two operations:
//
//   - registerAgencySenderDomain({ agencyId, domain, ownerUserId })
//     Calls Resend's /domains endpoint to create a sender, persists
//     the resend_domain_id on the agency row, returns the DNS records
//     the agency must add at their registrar.
//
//   - verifyAgencySenderDomain({ agencyId, ownerUserId })
//     Polls Resend for the domain's verification status. When Resend
//     reports verified, sets verified_sender_at on the agency row +
//     populates sender_email_address (the operator picks the local
//     part, e.g. "welcome", or we default to "welcome@<domain>").
//
// Defense in depth: the partner-agency branding resolver (v1.17)
// only EXPOSES the sender to consumers when verified_sender_at is
// populated. So even if an agency partially configures + DNS hasn't
// landed yet, no email goes out from an unverified sender (Resend
// would reject it anyway, but we'd lose the email).

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { partnerAgencies } from "@/db/schema";
import {
  createResendSenderDomain,
  getResendSenderDomain,
  triggerResendDomainVerification,
  isResendConfigured,
  type ResendDnsRecord,
} from "@/lib/integrations/resend-domains";

export interface RegisterAgencySenderDomainInput {
  agencyId: string;
  domain: string;
  /** Optional local part (default "welcome"). The agency's customer-
   *  facing emails will be sent FROM `<local>@<domain>` once verified. */
  senderLocalPart?: string;
  ownerUserId: string;
}

export type RegisterAgencySenderDomainResult =
  | {
      ok: true;
      domain: string;
      sender_email_address: string;
      dns_records: ResendDnsRecord[];
      status: string;
      next_steps: string[];
    }
  | { ok: false; error: string; validation_errors: string[] };

export async function registerAgencySenderDomain(
  input: RegisterAgencySenderDomainInput,
): Promise<RegisterAgencySenderDomainResult> {
  if (!isResendConfigured()) {
    return {
      ok: false,
      error: "resend_not_configured",
      validation_errors: [
        "RESEND_API_KEY env var not set on the SeldonFrame backend. Sender-domain registration is unavailable.",
      ],
    };
  }
  if (!input.agencyId || !input.domain || !input.ownerUserId) {
    return {
      ok: false,
      error: "validation_failed",
      validation_errors: ["agencyId, domain, ownerUserId are all required"],
    };
  }

  // Verify the agency exists + caller owns it.
  const [agency] = await db
    .select()
    .from(partnerAgencies)
    .where(eq(partnerAgencies.id, input.agencyId))
    .limit(1);
  if (!agency) {
    return {
      ok: false,
      error: "agency_not_found",
      validation_errors: [`agency ${input.agencyId} does not exist`],
    };
  }
  if (agency.ownerUserId !== input.ownerUserId) {
    return {
      ok: false,
      error: "not_agency_owner",
      validation_errors: ["caller does not own the agency"],
    };
  }

  // Call Resend.
  const result = await createResendSenderDomain(input.domain);
  if (!result.ok) {
    return {
      ok: false,
      error: "resend_create_failed",
      validation_errors: [`Resend ${result.status}: ${result.error}`],
    };
  }

  const localPart = (input.senderLocalPart ?? "welcome").trim().toLowerCase();
  const senderEmail = `${localPart}@${input.domain.toLowerCase()}`;

  // Persist on the agency row. verified_sender_at stays null — set
  // only when verification succeeds.
  await db
    .update(partnerAgencies)
    .set({
      resendDomainId: result.domain_id,
      senderEmailAddress: senderEmail,
      verifiedSenderAt: null,
      updatedAt: new Date(),
    })
    .where(eq(partnerAgencies.id, input.agencyId));

  return {
    ok: true,
    domain: input.domain,
    sender_email_address: senderEmail,
    dns_records: result.dns_records,
    status: result.status,
    next_steps: [
      `Add the DNS records above at your registrar for ${input.domain}.`,
      "DNS typically propagates in 5-60 minutes.",
      `Once added, call verify_partner_agency_sender_domain({ agency_id: "${input.agencyId}" }) to check status.`,
      "After verification: emails for workspaces attached to this agency will send FROM " +
        senderEmail +
        " instead of welcome@seldonframe.com.",
    ],
  };
}

export interface VerifyAgencySenderDomainInput {
  agencyId: string;
  ownerUserId: string;
}

export type VerifyAgencySenderDomainResult =
  | {
      ok: true;
      verified: boolean;
      status: string;
      dns_records: ResendDnsRecord[];
      sender_email_address: string | null;
    }
  | { ok: false; error: string; validation_errors: string[] };

export async function verifyAgencySenderDomain(
  input: VerifyAgencySenderDomainInput,
): Promise<VerifyAgencySenderDomainResult> {
  if (!isResendConfigured()) {
    return {
      ok: false,
      error: "resend_not_configured",
      validation_errors: ["RESEND_API_KEY env var not set"],
    };
  }
  if (!input.agencyId || !input.ownerUserId) {
    return {
      ok: false,
      error: "validation_failed",
      validation_errors: ["agencyId, ownerUserId are required"],
    };
  }

  const [agency] = await db
    .select()
    .from(partnerAgencies)
    .where(eq(partnerAgencies.id, input.agencyId))
    .limit(1);
  if (!agency) {
    return {
      ok: false,
      error: "agency_not_found",
      validation_errors: [],
    };
  }
  if (agency.ownerUserId !== input.ownerUserId) {
    return {
      ok: false,
      error: "not_agency_owner",
      validation_errors: ["caller does not own the agency"],
    };
  }
  if (!agency.resendDomainId) {
    return {
      ok: false,
      error: "no_sender_domain_registered",
      validation_errors: [
        "Run register_partner_agency_sender_domain first to register a domain with Resend.",
      ],
    };
  }

  // Trigger verify (Resend pulls DNS fresh) + read latest state.
  const result = await triggerResendDomainVerification(agency.resendDomainId);
  if (!result.ok) {
    // Fall back to GET in case verify endpoint had a transient.
    const status = await getResendSenderDomain(agency.resendDomainId);
    if (!status.ok) {
      return {
        ok: false,
        error: "resend_status_failed",
        validation_errors: [`Resend ${status.status}: ${status.error}`],
      };
    }
    return {
      ok: true,
      verified: status.status === "verified",
      status: status.status,
      dns_records: status.dns_records,
      sender_email_address: agency.senderEmailAddress,
    };
  }

  // If verified, persist verified_sender_at.
  if (result.status === "verified" && !agency.verifiedSenderAt) {
    await db
      .update(partnerAgencies)
      .set({ verifiedSenderAt: new Date(), updatedAt: new Date() })
      .where(eq(partnerAgencies.id, input.agencyId));
  }

  return {
    ok: true,
    verified: result.status === "verified",
    status: result.status,
    dns_records: result.dns_records,
    sender_email_address: agency.senderEmailAddress,
  };
}
