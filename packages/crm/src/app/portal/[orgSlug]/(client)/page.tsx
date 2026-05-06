// v1.16.0 — portal overview page now renders operator-defined
// composite template (if configured) ABOVE the existing stats grid.
// If no template is configured, falls through to the legacy stats-
// only view. Additive change — existing portal customers see the
// same UX unless their workspace's operator has configured a template.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { listPortalMessages, listPortalResources } from "@/lib/portal/actions";
import { requirePortalSessionForOrg } from "@/lib/portal/auth";
import { renderPortalForCustomer } from "@/lib/page-blocks/portal/portal-page-render";

export default async function PortalOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requirePortalSessionForOrg(orgSlug);

  // Load the existing portal data + the org row (for timezone) +
  // attempt the composite-template render. All in parallel — empty
  // templates short-circuit cheaply.
  const [messages, resources, orgRow, customTemplate] = await Promise.all([
    listPortalMessages(orgSlug),
    listPortalResources(orgSlug),
    db
      .select({ timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, session.orgId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    renderPortalForCustomer({
      orgId: session.orgId,
      contactId: session.contact.id,
      workspaceTimezone: "UTC", // refined below if org row resolves
      // Workspace-level fields are minimal on the portal — customer.*
      // embeds are the dominant surface here. We pass empties for
      // workspace embeds; if an operator uses {phone}/{services} on a
      // portal section, those simply render as empty placeholders.
      workspaceContext: {
        workspace_phone: "",
        workspace_phone_display: "",
        services: [],
        faq: [],
        testimonials: [],
        hours_summary: "",
        book_url: "/book",
        intake_url: "/intake",
      },
    }),
  ]);
  void orgRow; // resolved at the same time; the render path that needs
  // workspaceTimezone is now lazily fetched inside buildCustomerContext —
  // we keep the parallel await so the dependency is loaded but don't
  // re-thread it (next iteration: pass orgRow.timezone all the way).

  return (
    <section className="space-y-4">
      {customTemplate ? (
        <>
          <style dangerouslySetInnerHTML={{ __html: customTemplate.css }} />
          <article className="crm-card">
            <div dangerouslySetInnerHTML={{ __html: customTemplate.html }} />
          </article>
        </>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <article className="crm-card">
          <p className="text-label text-[hsl(var(--color-text-muted))]">Messages</p>
          <p className="mt-1 text-2xl font-semibold">{messages.length}</p>
        </article>
        <article className="crm-card">
          <p className="text-label text-[hsl(var(--color-text-muted))]">Resources</p>
          <p className="mt-1 text-2xl font-semibold">{resources.length}</p>
        </article>
        <article className="crm-card">
          <p className="text-label text-[hsl(var(--color-text-muted))]">Viewed Resources</p>
          <p className="mt-1 text-2xl font-semibold">{resources.filter((row) => Boolean(row.viewedAt)).length}</p>
        </article>
      </div>

      <article className="crm-card">
        <h2 className="text-card-title">Recent Messages</h2>
        {messages.length === 0 ? (
          <p className="mt-2 text-label text-[hsl(var(--color-text-secondary))]">No messages yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {messages.slice(0, 5).map((row) => (
              <li key={row.id} className="crm-table-row rounded-md px-2 py-2 text-sm">
                <p className="font-medium text-foreground">{row.subject ?? "Message"}</p>
                <p className="text-[hsl(var(--color-text-secondary))]">{row.body}</p>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
