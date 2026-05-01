import { PortalMessagesClient } from "@/components/portal/portal-messages-client";
import { listPortalMessages } from "@/lib/portal/actions";
import { requirePortalSessionForOrg } from "@/lib/portal/auth";

export default async function PortalMessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { orgSlug } = await params;
  const { q } = await searchParams;
  const session = await requirePortalSessionForOrg(orgSlug);
  const rows = await listPortalMessages(orgSlug, q);
  const clientName =
    `${session.contact.firstName} ${session.contact.lastName ?? ""}`.trim() || null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-section-title">Messages</h2>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">
          Send a message to your account team.
        </p>
      </div>

      <form className="crm-card flex flex-wrap items-center gap-2 p-3" action={`/portal/${orgSlug}/messages`}>
        <input
          name="q"
          defaultValue={q ?? ""}
          className="crm-input h-10 min-w-[240px] flex-1 px-3"
          placeholder="Search messages..."
        />
        <button type="submit" className="crm-button-primary h-10 px-4 text-sm">
          Search
        </button>
      </form>

      <PortalMessagesClient orgSlug={orgSlug} rows={rows} clientName={clientName} />
    </section>
  );
}
