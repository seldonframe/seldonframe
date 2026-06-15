"use server";

import { requireOperatorSessionForOrg } from "./auth";
import { createContactForOrg } from "@/lib/contacts/create-for-org";
import { sendReviewRequest } from "./review-request";

export async function createOperatorContactAction(params: {
  orgSlug: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
}): Promise<{ ok: true; contactId: string } | { ok: false; error: string }> {
  const session = await requireOperatorSessionForOrg(params.orgSlug);

  if (!params.firstName.trim()) {
    return { ok: false, error: "First name is required" };
  }

  try {
    const result = await createContactForOrg({
      orgId: session.orgId,
      firstName: params.firstName.trim(),
      lastName: params.lastName?.trim() || null,
      email: params.email?.trim() || null,
      phone: params.phone?.trim() || null,
      status: params.status || "lead",
      source: "operator_portal",
    });

    if (!result.id) {
      return { ok: false, error: "Failed to create contact" };
    }

    return { ok: true, contactId: result.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create contact";
    return { ok: false, error: message };
  }
}

export async function requestReviewAction(params: {
  orgSlug: string;
  contactId: string;
  toEmail: string;
  toPhone: string;
  contactName: string;
  reviewLink: string;
}): Promise<
  | { ok: true; emailSent: boolean; smsSent: boolean; emailSuppressed: boolean }
  | { ok: false; error: string }
> {
  const session = await requireOperatorSessionForOrg(params.orgSlug);
  void session; // orgId validated — sendReviewRequest uses orgId from params (contacts already scoped)

  if (!params.reviewLink.trim()) {
    return { ok: false, error: "Review link is required" };
  }

  try {
    const result = await sendReviewRequest({
      orgId: session.orgId,
      contactId: params.contactId,
      toEmail: params.toEmail,
      toPhone: params.toPhone,
      contactName: params.contactName,
      reviewLink: params.reviewLink.trim(),
    });

    return {
      ok: true,
      emailSent: result.emailSent,
      smsSent: result.smsSent,
      emailSuppressed: result.emailSuppressed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send review request";
    return { ok: false, error: message };
  }
}
