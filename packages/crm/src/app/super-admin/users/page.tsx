// v1.35.1 — Users tab.
//
// Server-rendered. Search + plan filter via URL params (?search=...,
// ?plan=growth). Cursor pagination via ?cursor=<iso>. No client
// interactivity except the search form (which submits via GET, so
// even that's URL-driven).

import Link from "next/link";
import { listUsers } from "@/lib/super-admin/users";
import type { TierId } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

const VALID_PLANS: TierId[] = ["free", "growth", "scale"];

export default async function UsersTabPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; plan?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const search = params.search?.trim() || undefined;
  const plan = (params.plan && VALID_PLANS.includes(params.plan as TierId)
    ? (params.plan as TierId)
    : undefined);
  const cursor = params.cursor || undefined;

  const result = await listUsers({ search, plan, cursor, limit: 50 });

  function buildHref(overrides: Partial<{ search: string; plan: string; cursor: string }>): string {
    const next = new URLSearchParams();
    const merged = { search, plan, cursor, ...overrides };
    if (merged.search) next.set("search", merged.search);
    if (merged.plan) next.set("plan", merged.plan);
    if (merged.cursor) next.set("cursor", merged.cursor);
    const qs = next.toString();
    return qs ? `/super-admin/users?${qs}` : "/super-admin/users";
  }

  return (
    <div className="px-6 py-8 sm:px-10 sm:py-10 max-w-[1200px] mx-auto space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground font-mono mb-2">
          SeldonFrame · Users
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Users
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {result.totalForFilter.toLocaleString()} {result.totalForFilter === 1 ? "user" : "users"} match the current filter
          {search ? ` · "${search}"` : ""}
          {plan ? ` · ${plan}` : ""}
        </p>
      </header>

      {/* Search + plan filter */}
      <form method="GET" className="flex flex-wrap items-center gap-3">
        <input
          name="search"
          type="text"
          defaultValue={search ?? ""}
          placeholder="Search email or name…"
          className="h-9 w-full sm:w-72 rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <select
          name="plan"
          defaultValue={plan ?? ""}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="growth">Growth</option>
          <option value="scale">Scale</option>
        </select>
        <button
          type="submit"
          className="h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
        >
          Apply
        </button>
        {(search || plan) && (
          <Link
            href="/super-admin/users"
            className="h-9 inline-flex items-center px-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="rounded-[12px] border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b">
            <tr className="text-left">
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">User</th>
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Plan</th>
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Workspaces</th>
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Joined</th>
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold text-right">Stripe</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No users match this filter.
                </td>
              </tr>
            ) : (
              result.rows.map((u) => (
                <tr key={u.id} className="border-b last:border-b-0 hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/super-admin/users/${u.id}`} className="block hover:text-[#1FAE85] transition-colors">
                      <div className="font-medium text-foreground truncate">{u.name || u.email}</div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <PlanBadge planId={u.planId} label={u.planLabel} />
                  </td>
                  <td className="px-4 py-3 text-foreground tabular-nums">
                    {u.workspacesOwned}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(u.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.stripeCustomerId ? (
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono text-muted-foreground bg-muted/40 border border-border">
                        cus_…{u.stripeCustomerId.slice(-6)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/60 font-mono">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          Showing {result.rows.length} of {result.totalForFilter.toLocaleString()}
        </div>
        <div className="flex items-center gap-2">
          {cursor && (
            <Link
              href={buildHref({ cursor: undefined })}
              className="h-8 px-3 rounded-md border bg-background hover:bg-accent/40 transition-colors inline-flex items-center"
            >
              ← First page
            </Link>
          )}
          {result.nextCursor && (
            <Link
              href={buildHref({ cursor: result.nextCursor })}
              className="h-8 px-3 rounded-md border bg-background hover:bg-accent/40 transition-colors inline-flex items-center"
            >
              Next →
            </Link>
          )}
        </div>
      </div>

      <p className="text-[11px] font-mono text-muted-foreground/70">
        Data lives in Postgres · search is case-insensitive substring · pagination is cursor-based on createdAt DESC
      </p>
    </div>
  );
}

function PlanBadge({ planId, label }: { planId: string | null; label: string }) {
  const isPaid = planId === "growth" || planId === "scale";
  const styles = isPaid
    ? "bg-[#1FAE85]/10 border-[#1FAE85]/30 text-[#1FAE85]"
    : "bg-muted/40 border-border text-muted-foreground";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10.5px] font-medium ${styles}`}>
      {label}
    </span>
  );
}
