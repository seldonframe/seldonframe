import { eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookEndpoints } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";

export default async function SettingsWebhooksPage() {
  const orgId = await getOrgId();
  const rows = orgId ? await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.orgId, orgId)) : [];

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Webhook Endpoints</h1>
      <div className="crm-card p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-[hsl(var(--color-text-secondary))]">No webhooks configured yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((row) => (
              <li key={row.id}>{row.url} · {row.events.join(", ")}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
