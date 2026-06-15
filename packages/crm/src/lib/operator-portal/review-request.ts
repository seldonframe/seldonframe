// src/lib/operator-portal/review-request.ts
// NOT "use server" — called from a "use server" action wrapper.
import { sendEmailFromApi } from "@/lib/emails/api";
import { sendSmsFromApi, type SendSmsResult } from "@/lib/sms/api";
import { getOutboundSmsEnabled } from "./outbound-sms-flag";

export type ReviewRequestDeps = {
  sendEmail: (params: {
    orgId: string;
    userId: null;
    contactId: string;
    toEmail: string;
    subject: string;
    body: string;
    ctaLabel: string;
    ctaHref: string;
  }) => Promise<{ emailId: string | null; suppressed: boolean; reason?: string }>;
  sendSms: (params: {
    orgId: string;
    userId: null;
    contactId: string;
    toNumber: string;
    body: string;
  }) => Promise<SendSmsResult>;
  getOutboundSmsEnabled: (orgId: string) => Promise<boolean>;
};

export type ReviewRequestInput = {
  orgId: string;
  contactId: string;
  toEmail: string;
  toPhone: string;
  contactName: string;
  reviewLink: string;
};

export type ReviewRequestResult = {
  emailSent: boolean;
  emailSuppressed: boolean;
  smsSent: boolean;
  smsError?: string;
};

function defaultDeps(): ReviewRequestDeps {
  return {
    sendEmail: sendEmailFromApi as ReviewRequestDeps["sendEmail"],
    sendSms: sendSmsFromApi,
    getOutboundSmsEnabled,
  };
}

export async function sendReviewRequest(
  input: ReviewRequestInput,
  deps: ReviewRequestDeps = defaultDeps()
): Promise<ReviewRequestResult> {
  const firstName = input.contactName.split(" ")[0] || input.contactName;
  const subject = `How was your experience with us, ${firstName}?`;
  const body = `Hi ${firstName},\n\nThank you for choosing us! If you have a moment, we'd love to hear what you think. Your feedback helps us keep improving.\n\nLeave a quick review — it only takes 30 seconds.`;

  const emailResult = await deps.sendEmail({
    orgId: input.orgId,
    userId: null,
    contactId: input.contactId,
    toEmail: input.toEmail,
    subject,
    body,
    ctaLabel: "Leave a Review →",
    ctaHref: input.reviewLink,
  });

  const emailSent = !emailResult.suppressed && !!emailResult.emailId;
  const emailSuppressed = emailResult.suppressed;

  let smsSent = false;
  let smsError: string | undefined;

  const outboundEnabled = await deps.getOutboundSmsEnabled(input.orgId);
  if (outboundEnabled && input.toPhone.trim()) {
    try {
      const smsBody = `Hi ${firstName}! We'd love your feedback 🙏 ${input.reviewLink}`;
      const smsResult = await deps.sendSms({
        orgId: input.orgId,
        userId: null,
        contactId: input.contactId,
        toNumber: input.toPhone,
        body: smsBody,
      });
      smsSent = !smsResult.suppressed;
    } catch (err) {
      smsError = err instanceof Error ? err.message : "SMS send failed";
    }
  }

  return { emailSent, emailSuppressed, smsSent, smsError };
}
