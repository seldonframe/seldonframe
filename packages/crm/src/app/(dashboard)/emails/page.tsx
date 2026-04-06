import { Mail } from "lucide-react";
import { createEmailTemplateAction, listEmails, listEmailTemplates } from "@/lib/emails/actions";
import {
  disconnectIntegrationAction,
  getEmailIntegrationsSettings,
  saveEmailIntegrationAction,
} from "@/lib/integrations/actions";
import { EmailPageContent } from "@/components/emails/email-page-content";

/*
  Square UI class reference (source of truth):
  - templates-baseui/emails/components/emails/emails-header.tsx
    - top shell: "flex h-14 items-center justify-between border-b border-border bg-background px-3 md:px-6"
    - title: "text-sm md:text-base font-normal tracking-tight text-foreground"
    - helper text tone: "text-xs text-muted-foreground"
*/

export default async function EmailsPage() {
  const [templates, rows, emailIntegrations] = await Promise.all([
    listEmailTemplates(),
    listEmails(),
    getEmailIntegrationsSettings(),
  ]);

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div className="flex h-14 items-center justify-between border-b border-border bg-background px-3 md:px-6">
        <div className="flex flex-1 items-center gap-2 md:gap-4">
          <div className="flex items-center gap-2 md:gap-2.5">
            <Mail className="size-4 text-foreground" />
            <p className="text-sm md:text-base font-normal tracking-tight text-foreground">Emails</p>
          </div>
          <div className="hidden sm:flex items-center gap-2.5">
            <div className="size-1 rounded-full bg-muted-foreground/20" />
            <p className="text-sm md:text-base font-normal tracking-tight text-foreground">
              {rows.length} email{rows.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

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
            newsletter: {
              kit: { connected: false, maskedKey: "" },
              mailchimp: { connected: false, maskedKey: "" },
              beehiiv: { connected: false, maskedKey: "" },
            },
          }
        }
        saveIntegrationAction={saveEmailIntegrationAction}
        disconnectIntegrationAction={disconnectIntegrationAction}
      />
    </section>
  );
}
