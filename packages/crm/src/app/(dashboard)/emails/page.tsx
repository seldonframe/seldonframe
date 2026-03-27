import { SendEmailForm } from "@/components/emails/send-email-form";
import { EmailListTable } from "@/components/emails/email-list-table";
import { listContacts } from "@/lib/contacts/actions";
import { listEmails } from "@/lib/emails/actions";
import { getAvailableEmailProviders } from "@/lib/emails/providers";

export default async function EmailsPage() {
  const [contacts, rows, providers] = await Promise.all([listContacts(), listEmails(), getAvailableEmailProviders()]);

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">Email</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Send transactional and campaign emails with Resend as default provider and fallbacks.</p>
      </div>

      <SendEmailForm contacts={contacts} providers={providers} />
      <EmailListTable rows={rows} />
    </section>
  );
}
