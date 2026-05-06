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
  listResendSenderDomains,
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

  // Call Resend. v1.18.1 — make this idempotent. Resend's POST /domains
  // returns 403 "The <name> domain has been registered already" when
  // the same name is already in our Resend account (could be from a
  // prior attempt by the same agency, or a stale row from a deleted
  // agency). We fall back to listing all domains, matching by name,
  // and using the existing record. Either way the operator gets the
  // same DNS records they need to add at their registrar.
  let domainId: string;
  let dnsRecords: ResendDnsRecord[] = [];
  let status = "pending";

  const createResult = await createResendSenderDomain(input.domain);
  if (createResult.ok) {
    domainId = createResult.domain_id;
    dnsRecords = createResult.dns_records;
    status = createResult.status;
  } else {
    const isAlreadyRegistered =
      createResult.status === 403 ||
      /already/i.test(createResult.error) ||
      /registered/i.test(createResult.error);
    if (!isAlreadyRegistered) {
      return {
        ok: false,
        error: "resend_create_failed",
        validation_errors: [`Resend ${createResult.status}: ${createResult.error}`],
      };
    }

    // Find the existing record + re-use it.
    const list = await listResendSenderDomains();
    if (!list.ok) {
      return {
        ok: false,
        error: "resend_list_failed",
        validation_errors: [
          `Resend reports ${input.domain} is already registered, but listing domains to find it failed: Resend ${list.status}: ${list.error}`,
        ],
      };
    }
    const existing = list.domains.find(
      (d) => d.name.toLowerCase() === input.domain.toLowerCase(),
    );
    if (!existing) {
      return {
        ok: false,
        error: "resend_already_registered_but_not_listable",
        validation_errors: [
          `Resend reports ${input.domain} is already registered but it doesn't appear in our domain list. It's likely registered under a DIFFERENT Resend account; use a different domain or contact support.`,
        ],
      };
    }

    // Pull the full record (with DNS records) for the existing domain.
    const detail = await getResendSenderDomain(existing.id);
    if (!detail.ok) {
      return {
        ok: false,
        error: "resend_get_existing_failed",
        validation_errors: [`Resend ${detail.status}: ${detail.error}`],
      };
    }
    domainId = detail.domain_id;
    dnsRecords = detail.dns_records;
    status = detail.status;
  }

  const localPart = (input.senderLocalPart ?? "welcome").trim().toLowerCase();
  const senderEmail = `${localPart}@${input.domain.toLowerCase()}`;

  // Persist on the agency row. verified_sender_at stays null when the
  // domain isn't yet verified at Resend's side; if we recovered an
  // already-verified existing record we mirror that into our row too.
  await db
    .update(partnerAgencies)
    .set({
      resendDomainId: domainId,
      senderEmailAddress: senderEmail,
      verifiedSenderAt: status === "verified" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(partnerAgencies.id, input.agencyId));

  const recoveredFromExisting = !createResult.ok;
  const nextSteps =
    status === "verified"
      ? [
          `Domain ${input.domain} is ALREADY verified in Resend (recovered an existing record). No DNS changes needed.`,
          `Emails for workspaces attached to this agency will send FROM ${senderEmail} starting immediately.`,
        ]
      : [
          `Add the DNS records above at your registrar for ${input.domain}.`,
          "DNS typically propagates in 5-60 minutes.",
          `Once added, call verify_partner_agency_sender_domain({ agency_id: "${input.agencyId}" }) to check status.`,
          "After verification: emails for workspaces attached to this agency will send FROM " +
            senderEmail +
            " instead of welcome@seldonframe.com.",
        ];
  if (recoveredFromExisting) {
    nextSteps.unshift(
      `(Note) Recovered an existing Resend domain registration for ${input.domain} — DNS records below match what Resend already has. If you've added them at the registrar before, status will already be 'verified'.`,
    );
  }

  return {
    ok: true,
    domain: input.domain,
    sender_email_address: senderEmail,
    dns_records: dnsRecords,
    status,
    next_steps: nextSteps,
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
