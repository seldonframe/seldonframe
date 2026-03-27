import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";

export default async function SettingsApiPage() {
  const orgId = await getOrgId();
  const rows = orgId ? await db.select().from(apiKeys).where(eq(apiKeys.orgId, orgId)) : [];

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">API Keys</h1>
      <div className="crm-card p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-[hsl(var(--color-text-secondary))]">No API keys generated yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((row) => (
              <li key={row.id}>{row.name} · {row.keyPrefix}****</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
