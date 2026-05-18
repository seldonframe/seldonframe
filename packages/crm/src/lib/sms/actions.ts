// 2026-05-18 — Operator-facing SMS server actions (Slice 4).
//
// The /conversations inbox surfaces every contact a workspace has had
// inbound SMS from. Tapping a thread opens the back-and-forth + an
// inline reply box; submitting calls sendOperatorSmsReplyAction which
// routes through sendSmsFromApi for the full suppression-check + audit-
// log + webhook dispatch treatment (same path the auto-reply takes).

"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { isAdminTokenUserId } from "@/lib/auth/admin-token";
import { isOperatorPortalUserId } from "@/lib/auth/operator-portal-context";
import { sendSmsFromApi } from "./api";

export type SendOperatorSmsReplyResult =
  | { ok: true; smsId: string | null; suppressed: boolean; reason?: string }
  | { ok: false; error: string };

export async function sendOperatorSmsReplyAction(params: {
  contactId: string;
  body: string;
}): Promise<SendOperatorSmsReplyResult> {
  const trimmed = params.body.trim();
  if (!trimmed) {
    return { ok: false, error: "Message cannot be empty." };
  }
  if (trimmed.length > 1000) {
    return { ok: false, error: "Message is too long (max 1000 chars)." };
  }

  const orgId = await getOrgId();
  if (!orgId) {
    return { ok: false, error: "No active workspace." };
  }

  assertWritable();

  const user = await getCurrentUser();
  if (!user?.id) {
    return { ok: false, error: "Not authenticated." };
  }

  // Synthetic user ids (admin-token, operator-portal) don't exist in
  // the users table — pass null so the activity-log foreign key
  // doesn't blow up. sendSmsFromApi tolerates null userId (its own
  // signature allows it).
  const userId =
    isAdminTokenUserId(user.id) || isOperatorPortalUserId(user.id) ? null : user.id;

  const [contact] = await db
    .select({ id: contacts.id, phone: contacts.phone, orgId: contacts.orgId })
    .from(contacts)
    .where(eq(contacts.id, params.contactId))
    .limit(1);

  if (!contact || contact.orgId !== orgId) {
    return { ok: false, error: "Contact not found." };
  }
  if (!contact.phone) {
    return { ok: false, error: "Contact has no phone number." };
  }

  try {
    const result = await sendSmsFromApi({
      orgId,
      userId,
      contactId: contact.id,
      toNumber: contact.phone,
      body: trimmed,
    });

    // Re-render the thread + inbox so the new outbound row shows up
    // without a manual refresh.
    revalidatePath("/conversations");
    revalidatePath(`/conversations/${contact.id}`);

    if (result.suppressed) {
      return {
        ok: true,
        smsId: null,
        suppressed: true,
        reason: result.reason,
      };
    }

    return {
      ok: true,
      smsId: result.smsId,
      suppressed: false,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Send failed.",
    };
  }
}
