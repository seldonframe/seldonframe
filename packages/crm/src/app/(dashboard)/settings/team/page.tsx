import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";

export default async function SettingsTeamPage() {
  const orgId = await getOrgId();
  const rows = orgId ? await db.select().from(users).where(eq(users.orgId, orgId)) : [];

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Team</h1>
      <div className="crm-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--color-surface-raised))] text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.email}</td>
                <td className="px-3 py-2">{row.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
