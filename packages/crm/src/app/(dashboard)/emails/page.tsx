import { Mail } from "lucide-react";
import { and, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { createEmailTemplateAction, listEmails, listEmailTemplates } from "@/lib/emails/actions";
import {
  disconnectIntegrationAction,
  getEmailIntegrationsSettings,
  saveEmailIntegrationAction,
} from "@/lib/integrations/actions";
// 2026-05-18 — Slice 5: outbound trigger editor. The OutboundTriggersSection
// is rendered ABOVE the existing template/sent/integrations content so
// operators land on the new editor first.
import { listOutboundTriggers } from "@/lib/messaging/actions";
// 2026-05-18 — Lazy-seed backfill for workspaces that pre-date the
// trigger-seeding code (or whose creation flow somehow missed it).
// seedDefaultOutboundTriggers is idempotent (unique index +
// onConflictDoNothing) so calling it on every /emails visit is safe
// and self-healing. Without this, workspaces created before the
// 2026-05-18 messaging-layer slices never get triggers and bookings
// silently produce no confirmation emails.
import { seedDefaultOutboundTriggers } from "@/lib/messaging/seed-default-triggers";
import { OutboundTriggersSection } from "@/components/messaging/outbound-triggers-section";
import { EmailPageContent } from "@/components/emails/email-page-content";

/*
  Square UI class reference (source of truth):
  - templates-baseui/emails/components/emails/emails-header.tsx
    - top shell: "flex h-14 items-center justify-between border-b border-border bg-background px-3 md:px-6"
    - title: "text-sm md:text-base font-normal tracking-tight text-foreground"
    - helper text tone: "text-xs text-muted-foreground"
*/

export default async function EmailsPage() {
  const orgId = await getOrgId();

  // 2026-05-18 — Lazy-seed default outbound triggers for workspaces
  // that pre-date the trigger-seeding code (or whose creation flow
  // somehow skipped it). Idempotent (unique index + onConflictDoNothing)
  // so calling on every /emails visit is safe and self-healing.
  // Without this, the dispatcher silently no-ops for pre-existing
  // workspaces (triggers.length === 0) and no confirmation emails fire.
  if (orgId) {
    await seedDefaultOutboundTriggers(orgId).catch((err) => {
      console.warn("[emails] seedDefaultOutboundTriggers failed:", err);
    });
  }

  const [templates, rows, emailIntegrations, newLeadsRow, outboundTriggers] = await Promise.all([
    listEmailTemplates(),
    listEmails(),
    getEmailIntegrationsSettings(),
    // 2026-05-18 (messaging-layer slice 1) — count contacts with an
    // email created in the last 30 days. Used as a proxy for "leads
    // synced to newsletter" — every contact.created event in this
    // window already fires syncContactToNewsletter via the events bus.
    orgId
      ? db
          .select({ c: sql<number>`count(*)::int` })
          .from(contacts)
          .where(
            and(
              eq(contacts.orgId, orgId),
              isNotNull(contacts.email),
              ne(contacts.email, ""),
              gte(
                contacts.createdAt,
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              ),
            ),
          )
          .then((r) => r[0] ?? { c: 0 })
          .catch(() => ({ c: 0 }))
      : Promise.resolve({ c: 0 }),
    // 2026-05-18 (Slice 5) — load outbound triggers for the editor.
    // Same getOrgId check the helper already performs internally; we
    // just pull it in parallel with the rest of the page data.
    listOutboundTriggers().catch(() => []),
  ]);
  const newLeadsLast30Days = Number(newLeadsRow.c ?? 0);

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Mail className="size-5 text-foreground" />
          <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Email</h1>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Send a one-off message or save a template to reuse for campaigns.{" "}
          {rows.length > 0 && (
            <span className="text-muted-foreground/70">
              {rows.length} email{rows.length !== 1 ? "s" : ""} sent so far.
            </span>
          )}
        </p>
      </div>

      {/* 2026-05-18 — Slice 5: per-trigger SKILL.md editor. Surfaces
          BOTH email + SMS triggers in one section since the email page
          is the only "messaging hub" surface today. /sms gets its own
          page (or this page gets renamed to /messaging) in a follow-up. */}
      <OutboundTriggersSection triggers={outboundTriggers} />

      <EmailPageContent
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          subject: t.subject,
          body: t.body,
          tag: t.tag,
          triggerEvent: t.triggerEvent ?? null,
        }))}
        sent={rows.map((r) => ({
          id: r.id,
          toEmail: r.toEmail,
          subject: r.subject,
          status: r.status,
          provider: r.provider,
          sentAt: r.sentAt ? r.sentAt.toISOString() : null,
        }))}
        createTemplateAction={createEmailTemplateAction}
        emailIntegrations={
          emailIntegrations ?? {
            resend: { connected: false, maskedKey: "" },
            twilio: {
              connected: false,
              accountSid: "",
              fromNumber: "",
              authTokenHint: "",
            },
            newsletter: {
              kit: { connected: false, maskedKey: "" },
              mailchimp: { connected: false, maskedKey: "" },
              beehiiv: { connected: false, maskedKey: "" },
            },
          }
        }
        saveIntegrationAction={saveEmailIntegrationAction}
        disconnectIntegrationAction={disconnectIntegrationAction}
        newLeadsLast30Days={newLeadsLast30Days}
      />
    </section>
  );
}
