import { createEmailTemplateAction, listEmails, listEmailTemplates } from "@/lib/emails/actions";
import { getLabels } from "@/lib/soul/labels";
import { EmailPageContent } from "@/components/emails/email-page-content";

export default async function EmailsPage() {
  const [labels, templates, rows] = await Promise.all([
    getLabels(),
    listEmailTemplates(),
    listEmails(),
  ]);

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">Email</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">
          Send transactional and campaign emails to your {labels.contact.plural.toLowerCase()} with provider fallbacks.
        </p>
      </div>

      <EmailPageContent
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          subject: t.subject,
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
      />
    </section>
  );
}
