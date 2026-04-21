import { getOrgId } from "@/lib/auth/helpers";
import { addSuppressionAction, removeSuppressionAction } from "@/lib/emails/suppression-actions";
import { listSuppressions } from "@/lib/emails/suppression";

export const dynamic = "force-dynamic";

function formatDate(value: Date) {
  return value.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function reasonBadgeClass(reason: string) {
  switch (reason) {
    case "bounce":
    case "complaint":
      return "border-negative/20 bg-negative/10 text-negative";
    case "unsubscribe":
      return "border-caution/20 bg-caution/10 text-caution";
    case "manual":
    default:
      return "border-muted/30 bg-muted/30 text-muted-foreground";
  }
}

export default async function SuppressionSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; removed?: string; error?: string }>;
}) {
  const params = await searchParams;
  const orgId = await getOrgId();
  if (!orgId) {
    return null;
  }

  const rows = await listSuppressions(orgId);

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">
            Suppression List
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Addresses that will be skipped on every outbound send. Hard bounces and complaints are added here automatically by the Resend webhook.
          </p>
        </div>
      </div>

      {params.added === "1" ? (
        <p className="rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">Email added to suppression list.</p>
      ) : null}
      {params.removed === "1" ? (
        <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">Email removed from suppression list.</p>
      ) : null}
      {params.error ? (
        <p className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">{params.error}</p>
      ) : null}

      <article className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="text-card-title">Add manually</h2>
        <form action={addSuppressionAction} className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
          <div className="space-y-1">
            <label htmlFor="suppression-email" className="text-label">
              Email
            </label>
            <input id="suppression-email" name="email" type="email" required className="crm-input h-10 w-full px-3" placeholder="user@example.com" />
          </div>
          <div className="space-y-1">
            <label htmlFor="suppression-reason" className="text-label">
              Reason
            </label>
            <select id="suppression-reason" name="reason" defaultValue="manual" className="crm-input h-10 w-full px-3">
              <option value="manual">Manual</option>
              <option value="unsubscribe">Unsubscribe</option>
              <option value="bounce">Bounce</option>
              <option value="complaint">Complaint</option>
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className="crm-button-primary h-10 px-4 w-full md:w-auto">
              Add
            </button>
          </div>
        </form>
      </article>

      <article className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="text-card-title">Suppressed ({rows.length})</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No suppressed addresses yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Email</th>
                  <th className="pb-2 pr-3 font-medium">Reason</th>
                  <th className="pb-2 pr-3 font-medium">Source</th>
                  <th className="pb-2 pr-3 font-medium">Suppressed</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2.5 pr-3 font-medium">{row.email}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${reasonBadgeClass(row.reason)}`}>
                        {row.reason}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{row.source ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{formatDate(row.createdAt)}</td>
                    <td className="py-2.5 text-right">
                      <form action={removeSuppressionAction}>
                        <input type="hidden" name="email" value={row.email} />
                        <button type="submit" className="crm-button-secondary h-8 px-3 text-xs">
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
