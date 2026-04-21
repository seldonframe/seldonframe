import { findAdapterById } from "@seldonframe/core/integrations";
import { resendProvider } from "./resend";
import type { EmailProvider } from "./interface";

export { resendProvider } from "./resend";
export type {
  EmailProvider,
  EmailSendRequest,
  EmailSendResult,
  EmailSendFailure,
} from "./interface";
export { EmailProviderSendError } from "./interface";

// Provider registry keyed by id. v1 ships Resend only; SendGrid / Postmark
// land when real demand surfaces. The interface is deliberately small so
// adding a new provider is a new file + one registry entry.
export const emailProviders: Record<string, EmailProvider> = {
  resend: resendProvider,
};

export function getEmailProvider(id: string): EmailProvider | null {
  return emailProviders[id] ?? null;
}

// Discovery order for picking a default when no override is supplied.
// Kept as a tuple so legacy call sites can iterate without casting.
export const emailProviderOrder = ["resend", "sendgrid", "postmark"] as const;

export type EmailProviderId = (typeof emailProviderOrder)[number] | "manual";

export async function getAvailableEmailProviders() {
  const checks = await Promise.all(
    emailProviderOrder.map(async (id) => {
      const descriptor = await findAdapterById(id);
      return descriptor && descriptor.adapter.isConfigured() ? id : null;
    })
  );

  return checks.filter((item): item is (typeof emailProviderOrder)[number] => Boolean(item));
}

export async function resolveEmailProvider(requested?: string | null): Promise<EmailProviderId> {
  const available = await getAvailableEmailProviders();

  if (requested && available.includes(requested as (typeof emailProviderOrder)[number])) {
    return requested as EmailProviderId;
  }

  if (available.includes("resend")) {
    return "resend";
  }

  return available[0] ?? "manual";
}

export function resolveDefaultFromEmail() {
  return process.env.DEFAULT_FROM_EMAIL ?? "hello@seldonframe.local";
}
