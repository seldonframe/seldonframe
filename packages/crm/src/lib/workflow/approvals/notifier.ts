// Approval notifier — composes the email + dispatches via the
// workspace's email API. SLICE 10 PR 2 C1 per Max's prompt + audit §6.
//
// Two body shapes:
//   - admin path (operator/user_id approver): link to /agents/runs
//     (the drawer surface; resolution via authenticated session)
//   - magic-link path (client_owner approver): link to
//     /portal/approvals/[token] (theme-bridged customer surface)
//
// Test mode (SLICE 8): the underlying sendEmailFromApi already routes
// to the workspace's Resend test config when test_mode=true. Notifier
// is unaware of test mode — concern is downstream.
//
// L-22 / SLICE 9 PR 2 C4 pattern: notifier NEVER throws. Send failure
// (provider down, suppressed recipient) returns delivered=false with
// a reason; caller logs + continues. Approval row exists either way;
// admin can find it via dashboard polling.

import type { ApiSendEmailResult } from "@/lib/emails/api";

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export type ApprovalForNotification = {
  id: string;
  orgId: string;
  contextTitle: string;
  contextSummary: string;
  contextPreview: string | null;
  timeoutAt: Date | null;
};

export type ApproverContact = {
  email: string;
  name: string;
  /** Null on magic-link path (client may not be a SeldonFrame user). */
  userId: string | null;
};

export type ComposeApprovalEmailInput = {
  approval: ApprovalForNotification;
  approver: ApproverContact;
  appBaseUrl: string;
  /** Raw token for client_owner; null for admin/operator/user_id. */
  magicLinkToken: string | null;
};

export type ComposedEmail = {
  subject: string;
  body: string;
};

export type NotifyApproverContext = {
  sendEmail: (params: {
    orgId: string;
    userId: string;
    contactId: string | null;
    toEmail: string;
    subject: string;
    body: string;
  }) => Promise<ApiSendEmailResult>;
};

export type NotifyApproverResult = {
  delivered: boolean;
  reason?: string;
};

// ---------------------------------------------------------------------
// composeApprovalEmail — pure (no I/O)
// ---------------------------------------------------------------------

export function composeApprovalEmail(input: ComposeApprovalEmailInput): ComposedEmail {
  const isClientOwner = input.magicLinkToken !== null;
  const link = isClientOwner
    ? `${input.appBaseUrl}/portal/approvals/${input.magicLinkToken}`
    : `${input.appBaseUrl}/agents/runs`;

  const subject = isClientOwner
    ? `Action needed: ${input.approval.contextTitle}`
    : `Approval needed: ${input.approval.contextTitle}`;

  const greeting = `Hi ${input.approver.name},`;
  const summaryLine = input.approval.contextSummary;
  const previewBlock = input.approval.contextPreview
    ? `\n\nPreview:\n${input.approval.contextPreview}\n`
    : "";
  const expiresLine = input.approval.timeoutAt
    ? `\nThis request expires at ${input.approval.timeoutAt.toLocaleString()}.`
    : "";
  const cta = isClientOwner
    ? `Review and respond:\n${link}`
    : `Review and respond on the dashboard:\n${link}`;

  const body = `${greeting}

${summaryLine}${previewBlock}
${cta}
${expiresLine}`.trim();

  return { subject, body };
}

// ---------------------------------------------------------------------
// notifyApprover — invokes the email API; never throws
// ---------------------------------------------------------------------

export async function notifyApprover(
  input: ComposeApprovalEmailInput,
  ctx: NotifyApproverContext,
): Promise<NotifyApproverResult> {
  const composed = composeApprovalEmail(input);
  try {
    const result = await ctx.sendEmail({
      orgId: input.approval.orgId,
      // userId is required by sendEmailFromApi; on magic-link path
      // we don't have a SeldonFrame user, so we use the workspace
      // org id as a stand-in for the "system" sender. Not ideal;
      // v1.1 may add a synthetic system-user concept.
      userId: input.approver.userId ?? input.approval.orgId,
      contactId: null,
      toEmail: input.approver.email,
      subject: composed.subject,
      body: composed.body,
    });
    if (result.suppressed) {
      return { delivered: false, reason: result.reason };
    }
    return { delivered: true };
  } catch (err) {
    // Per L-22: log + swallow. Approval row exists; admin can find
    // it via dashboard polling.
    // eslint-disable-next-line no-console
    console.warn("[approvals-notifier] send failed", {
      approvalId: input.approval.id,
      orgId: input.approval.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      delivered: false,
      reason: err instanceof Error ? err.message : "send_exception",
    };
  }
}
