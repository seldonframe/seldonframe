// src/lib/operator-portal/messages-actions.ts
"use server";

import { requireOperatorSessionForOrg } from "./auth";
import { getOutboundSmsEnabled } from "./outbound-sms-flag";
import { addThreadNote, markThreadRead } from "./messages";
import { sendSmsFromApi } from "@/lib/sms/api";

export type SendReplyResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendReplyAction(params: {
  orgSlug: string;
  contactId: string;
  toNumber: string;
  body: string;
}): Promise<SendReplyResult> {
  const session = await requireOperatorSessionForOrg(params.orgSlug);
  const orgId = session.orgId;

  const enabled = await getOutboundSmsEnabled(orgId);
  if (!enabled) {
    return { ok: false, error: "outbound_sms_not_enabled" };
  }

  try {
    await sendSmsFromApi({
      orgId,
      userId: null,
      contactId: params.contactId,
      toNumber: params.toNumber,
      body: params.body,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return { ok: false, error: message };
  }
}

export async function addNoteAction(params: {
  orgSlug: string;
  contactId: string;
  body: string;
}): Promise<{ ok: true; noteId: string } | { ok: false; error: string }> {
  const session = await requireOperatorSessionForOrg(params.orgSlug);

  if (!params.body.trim()) {
    return { ok: false, error: "Note body is required" };
  }

  try {
    const note = await addThreadNote({
      orgId: session.orgId,
      contactId: params.contactId,
      authorEmail: session.email,
      body: params.body,
    });
    return { ok: true, noteId: note.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save note";
    return { ok: false, error: message };
  }
}

export async function markReadAction(params: {
  orgSlug: string;
  contactId: string;
}): Promise<void> {
  const session = await requireOperatorSessionForOrg(params.orgSlug);
  await markThreadRead({ orgId: session.orgId, contactId: params.contactId });
}
