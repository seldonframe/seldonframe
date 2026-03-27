import { findAdapterById } from "@seldonframe/core/integrations";

export const emailProviderOrder = ["resend", "sendgrid", "postmark"] as const;

export type EmailProvider = (typeof emailProviderOrder)[number] | "manual";

export async function getAvailableEmailProviders() {
  const checks = await Promise.all(
    emailProviderOrder.map(async (id) => {
      const descriptor = await findAdapterById(id);
      return descriptor && descriptor.adapter.isConfigured() ? id : null;
    })
  );

  return checks.filter((item): item is (typeof emailProviderOrder)[number] => Boolean(item));
}

export async function resolveEmailProvider(requested?: string | null): Promise<EmailProvider> {
  const available = await getAvailableEmailProviders();

  if (requested && available.includes(requested as (typeof emailProviderOrder)[number])) {
    return requested as EmailProvider;
  }

  if (available.includes("resend")) {
    return "resend";
  }

  return available[0] ?? "manual";
}

export function resolveDefaultFromEmail() {
  return process.env.DEFAULT_FROM_EMAIL ?? "hello@seldonframe.local";
}
