// v1.20.0 — Team settings page now also surfaces the OPERATOR INVITE UI.
//
// Pre-1.20 this page only listed users belonging to the workspace.
// In v1.20 we added the operator portal at /portal/<orgSlug> — the
// branded admin dashboard for sub-tenant operators (HVAC owner /
// dentist / accountant). To onboard a new operator you mint them
// a magic-link to that portal. This page is where you do it.
//
// Distinct from /contacts/<id> "Send invite" — that flow invites a
// CONTACT (homeowner) to the CUSTOMER portal at /customer/<orgSlug>
// with a 6-digit code. Operator invites are magic-link to /portal.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { OperatorInviteCard } from "@/components/settings/operator-invite-card";

export default async function SettingsTeamPage() {
  const orgId = await getOrgId();
  const [rows, orgRow] = await Promise.all([
    orgId
      ? db.select().from(users).where(eq(users.orgId, orgId))
      : Promise.resolve([]),
    orgId
      ? db
          .select({ slug: organizations.slug, name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, orgId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-light tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">
          Invite operators to manage this workspace via the branded admin
          portal at{" "}
          <code className="font-mono text-xs">
            /portal/{orgRow?.slug ?? "(slug)"}
          </code>
          .
        </p>
      </header>

      {orgRow ? (
        <OperatorInviteCard orgSlug={orgRow.slug} orgName={orgRow.name} />
      ) : null}

      <section className="space-y-2">
        <h2 className="text-base font-semibold tracking-tight">
          Current team members
        </h2>
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
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-4 text-center text-muted-foreground"
                  >
                    No team members yet. Send an operator invite above.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.email}</td>
                    <td className="px-3 py-2">{row.role}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
