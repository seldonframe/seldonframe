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

  // v1.19.0 — use --sf-* CSS variables (set by PortalLayout's
  // PublicThemeProvider) so cards, stats, and message rows pick up
  // the workspace's branded theme. Pre-1.19 used `crm-card`/`text-label`
  // which rendered the SeldonFrame defaults regardless of workspace.
  const cardStyle: React.CSSProperties = {
    backgroundColor: "var(--sf-card-bg)",
    color: "var(--sf-text)",
    border: "1px solid var(--sf-border)",
    borderRadius: "var(--sf-radius)",
  };
  const labelStyle: React.CSSProperties = {
    color: "var(--sf-muted)",
    fontSize: "0.75rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  return (
    <section className="space-y-4">
      {customTemplate ? (
        <>
          <style dangerouslySetInnerHTML={{ __html: customTemplate.css }} />
          <article className="p-5" style={cardStyle}>
            <div dangerouslySetInnerHTML={{ __html: customTemplate.html }} />
          </article>
        </>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <article className="p-5" style={cardStyle}>
          <p style={labelStyle}>Messages</p>
          <p
            className="mt-1 text-2xl font-semibold"
            style={{ color: "var(--sf-text)" }}
          >
            {messages.length}
          </p>
        </article>
        <article className="p-5" style={cardStyle}>
          <p style={labelStyle}>Resources</p>
          <p
            className="mt-1 text-2xl font-semibold"
            style={{ color: "var(--sf-text)" }}
          >
            {resources.length}
          </p>
        </article>
        <article className="p-5" style={cardStyle}>
          <p style={labelStyle}>Viewed Resources</p>
          <p
            className="mt-1 text-2xl font-semibold"
            style={{ color: "var(--sf-text)" }}
          >
            {resources.filter((row) => Boolean(row.viewedAt)).length}
          </p>
        </article>
      </div>

      <article className="p-5" style={cardStyle}>
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--sf-text)" }}
        >
          Recent Messages
        </h2>
        {messages.length === 0 ? (
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--sf-muted)" }}
          >
            No messages yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {messages.slice(0, 5).map((row) => (
              <li
                key={row.id}
                className="px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--sf-bg)",
                  borderRadius: "var(--sf-radius)",
                  border: "1px solid var(--sf-border)",
                }}
              >
                <p
                  className="font-medium"
                  style={{ color: "var(--sf-text)" }}
                >
                  {row.subject ?? "Message"}
                </p>
                <p style={{ color: "var(--sf-muted)" }}>{row.body}</p>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
