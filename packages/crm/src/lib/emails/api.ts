import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailEvents, emails, organizations } from "@/db/schema";
import {
  getEmailProvider,
  resolveDefaultFromEmail,
  resolveEmailProvider,
} from "./providers";
import { isEmailSuppressed, normalizeEmail } from "./suppression";
import { renderPlainEmailTemplate, type EmailBrandingInput } from "./templates";
import { decryptValue } from "@/lib/encryption";
import { emitSeldonEvent } from "@/lib/events/bus";
import { resolveResendConfig } from "@/lib/test-mode/resolvers";
import { DrizzleWorkspaceTestModeStore } from "@/lib/test-mode/store-drizzle";
import { assertEmailSendLimit, incrementEmailSendUsage } from "@/lib/tier/limits";
import { dispatchWebhook } from "@/lib/utils/webhooks";
// 2026-05-18 — pull workspace branding (name, logo, primary color,
// phone, address) into outbound emails so they look like real
// customer-facing comms instead of plain dark-mode test cards.
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";
import { shouldShowPoweredByBadgeForOrg } from "@/lib/billing/public";

async function loadLiveResendConfig(orgId: string) {
  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const integrations = (org?.integrations ?? {}) as Record<string, unknown>;
  const resend = (integrations.resend ?? {}) as {
    apiKey?: string;
    fromEmail?: string;
    fromName?: string;
  };
  const rawKey = resend.apiKey?.trim() ?? "";
  let apiKey = rawKey;
  if (rawKey.startsWith("v1.")) {
    try {
      apiKey = decryptValue(rawKey);
    } catch {
      apiKey = "";
    }
  }
  return {
    apiKey: apiKey || (process.env.RESEND_API_KEY?.trim() ?? ""),
    fromEmail: resend.fromEmail?.trim() || resolveDefaultFromEmail(),
    fromName: resend.fromName?.trim() || "",
  };
}

// Thin wrapper that mirrors lib/emails/actions.ts::sendEmailForOrg but
// without the "use server" gate so it can be called from API route
// handlers + MCP tool bindings. The two code paths would ideally merge,
// but the server-action module is pinned to 'use server' which locks its
// exports to the server-action calling convention.

export type ApiSendEmailResult =
  | { emailId: string; contactId: string | null; suppressed: false }
  | { emailId: null; contactId: string | null; suppressed: true; reason: string };

export async function sendEmailFromApi(params: {
  orgId: string;
  // 2026-05-18 (later) — allow null for system-initiated sends (e.g.
  // outbound messaging dispatcher fires booking confirmations on
  // event with no human actor). The emails.user_id column is a
  // nullable UUID with FK to users.id, so passing null is correct.
  // Previously dispatch.ts passed the literal string "system" here
  // which crashed the insert with "invalid input syntax for type
  // uuid" and resulted in status='failed' on every booking-confirmation
  // email even though SMS via the parallel path succeeded.
  userId: string | null;
  contactId: string | null;
  toEmail: string;
  subject: string;
  body: string;
  provider?: string | null;
  // 2026-05-21 — optional CTA button rendered below the body prose.
  // Used by proposal sends so the email has a branded "View proposal →"
  // button rather than a raw URL in the body.
  ctaLabel?: string;
  ctaHref?: string;
  // 2026-05-21 — when set, merged on top of the default loadEmailBranding
  // lookup so callers can inject agency-profile fields (logo_url,
  // brand_color) that don't live on the organizations table.
  brandingOverride?: Partial<EmailBrandingInput>;
}): Promise<ApiSendEmailResult> {
  const toEmail = normalizeEmail(params.toEmail);

  const suppression = await isEmailSuppressed(params.orgId, toEmail);
  if (suppression) {
    await emitSeldonEvent("email.suppressed", {
      email: toEmail,
      reason: suppression.reason,
      contactId: params.contactId,
    }, { orgId: params.orgId });
    return { emailId: null, contactId: params.contactId, suppressed: true, reason: suppression.reason };
  }

  const provider = await resolveEmailProvider(params.provider ?? null);
  await assertEmailSendLimit(params.orgId);

  // SLICE 8 G-8-7: resolve test mode at dispatch. If testMode=true
  // with valid test creds, returns test config; else live. Fail-fast
  // (G-8-4) if testMode=true with no test config.
  const liveResend = await loadLiveResendConfig(params.orgId);
  const testStore = new DrizzleWorkspaceTestModeStore(db);
  const resolved = await resolveResendConfig({
    orgId: params.orgId,
    liveConfig: liveResend,
    store: testStore,
  });
  const fromEmail = resolved.fromEmail;
  const isTestMode = resolved.mode === "test";

  // 2026-05-18 — workspace branding for the email chrome. We pull
  // effective branding (which respects agency white-label override)
  // alongside the workspace's own name/theme/soul so the email shows
  // logo + brand color + footer with business name + phone + address.
  // Soft-fails: if any of these queries hit an error the email still
  // sends with neutral defaults rather than crashing the send.
  //
  // 2026-05-21 — brandingOverride is merged on top so callers that
  // have agency-profile fields (logo_url, brand_color) can inject them
  // without those fields being overwritten by the org-level lookup.
  const baseBranding = await loadEmailBranding(params.orgId);
  const branding: EmailBrandingInput = {
    ...baseBranding,
    ...(params.brandingOverride ?? {}),
  };
  const rendered = renderPlainEmailTemplate({
    heading: params.subject,
    body: params.body,
    ctaLabel: params.ctaLabel,
    ctaHref: params.ctaHref,
    branding,
  });

  const [created] = await db
    .insert(emails)
    .values({
      orgId: params.orgId,
      contactId: params.contactId,
      userId: params.userId,
      provider,
      fromEmail,
      toEmail,
      subject: params.subject,
      bodyHtml: rendered.html,
      bodyText: rendered.text,
      status: "queued",
      metadata: { source: "api", testMode: isTestMode },
    })
    .returning({ id: emails.id, contactId: emails.contactId });

  if (!created) {
    throw new Error("Could not queue email");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const trackedHtml = `${rendered.html}<img src="${baseUrl}/api/email/open/${created.id}" alt="" width="1" height="1" style="display:none" />`;

  let externalMessageId = `${provider}-${Date.now()}`;
  const impl = getEmailProvider(provider);
  if (impl) {
    const result = await impl.send({
      orgId: params.orgId,
      from: fromEmail,
      to: toEmail,
      subject: params.subject,
      html: trackedHtml,
      text: rendered.text,
      tags: [{ name: "email_id", value: created.id }],
      apiKeyOverride: isTestMode ? resolved.apiKey : undefined,
    });
    externalMessageId = result.externalMessageId;
  }

  await db
    .update(emails)
    .set({
      bodyHtml: trackedHtml,
      status: "sent",
      externalMessageId,
      sentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emails.id, created.id));

  if (created.contactId) {
    await emitSeldonEvent("email.sent", {
      emailId: created.id,
      contactId: created.contactId,
      // SLICE 8 G-8-5: tag test-mode events for observability.
      ...(isTestMode ? { testMode: true } : {}),
    }, { orgId: params.orgId });
  }

  await incrementEmailSendUsage(params.orgId);

  await dispatchWebhook({
    orgId: params.orgId,
    event: "email.sent",
    payload: {
      emailId: created.id,
      contactId: created.contactId,
      provider,
      toEmail,
    },
  });

  return { emailId: created.id, contactId: created.contactId, suppressed: false };
}

export async function getEmailWithEvents(orgId: string, emailId: string) {
  const [row] = await db
    .select()
    .from(emails)
    .where(and(eq(emails.orgId, orgId), eq(emails.id, emailId)))
    .limit(1);
  if (!row) return null;

  const events = await db
    .select({
      id: emailEvents.id,
      eventType: emailEvents.eventType,
      provider: emailEvents.provider,
      createdAt: emailEvents.createdAt,
      payload: emailEvents.payload,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), eq(emailEvents.emailId, emailId)))
    .orderBy(desc(emailEvents.createdAt));

  return { email: row, events };
}

// 2026-05-18 — assemble the branding payload for the email chrome.
// Reads from THREE sources in priority order:
//   1. partner_agencies (effective branding) — agency-level white-label
//      override; wins when chrome substitution is active.
//   2. organizations.theme — per-workspace logo + primary color.
//   3. organizations.soul — business name + phone + city/state for
//      the footer "questions? call us" line.
// Errors silently degrade to neutral defaults so a malformed soul
// never blocks an outbound email.
async function loadEmailBranding(orgId: string): Promise<EmailBrandingInput> {
  try {
    const [orgRow] = await db
      .select({
        name: organizations.name,
        soul: organizations.soul,
        theme: organizations.theme,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    const effective = await getEffectiveBrandingForWorkspace(orgId).catch(() => null);
    const showPoweredBy = await shouldShowPoweredByBadgeForOrg(orgId).catch(() => true);

    // Phone + address — pull from soul shape (snake + camel). Soul
    // schema isn't strict; check both variants.
    const soul = (orgRow?.soul ?? {}) as Record<string, unknown>;
    const business = (soul.business && typeof soul.business === "object" ? soul.business : null) as Record<string, unknown> | null;
    const contact = (soul.contact && typeof soul.contact === "object" ? soul.contact : null) as Record<string, unknown> | null;
    const pickStr = (...candidates: unknown[]): string | null => {
      for (const c of candidates) if (typeof c === "string" && c.trim()) return c.trim();
      return null;
    };
    const businessPhone = pickStr(
      soul.phone,
      business?.phone,
      business?.phoneNumber,
      contact?.phone,
      contact?.phoneNumber,
    );
    const city = pickStr(soul.city, business?.city, contact?.city);
    const state = pickStr(soul.state, business?.state, contact?.state);
    const addressLine = pickStr(soul.address, business?.address, contact?.address);
    const businessAddress = [addressLine, [city, state].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join(" · ") || null;

    // 2026-05-19 — customer-facing email chrome uses SMB identity ONLY.
    // The agency override (effectiveBranding.is_white_label) was bleeding
    // into booking confirmations sent to END CUSTOMERS, so a homeowner
    // who booked with "Roofs by Shiloh" received an email signed by
    // "Max agency · (253) 678-7111 · Auburn, WA" — confusing AND
    // wrong. Agency chrome belongs in the OPERATOR's admin dashboard;
    // customer-facing emails are about the SMB they did business with.
    //
    // Same fix pattern as the public-surface logo strip from
    // 2026-05-18. `effective` is intentionally left unused here — the
    // existing import stays so the function compiles cleanly and the
    // delta is easy to read.
    void effective;
    const theme = (orgRow?.theme ?? {}) as unknown as Record<string, unknown>;
    const themeLogo = typeof theme.logoUrl === "string" ? theme.logoUrl : null;
    const themePrimary = typeof theme.primaryColor === "string" ? theme.primaryColor : null;
    const logoUrl = themeLogo;
    const brandName = orgRow?.name || "";
    const primaryColor = themePrimary;

    return {
      brandName,
      logoUrl,
      primaryColor,
      businessPhone,
      businessAddress,
      showPoweredBy,
    };
  } catch {
    return { showPoweredBy: true };
  }
}
