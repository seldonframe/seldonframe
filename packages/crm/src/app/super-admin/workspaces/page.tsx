// v1.35.2 — Workspaces tab.
//
// List of all SF workspaces, sortable by activity / created / name.
// Search by name or slug. Click a row to drill into the workspace
// detail (template, agents, lifetime tokens, recent activity).

import Link from "next/link";
import { listWorkspaces, type WorkspaceSort } from "@/lib/super-admin/workspaces";

export const dynamic = "force-dynamic";

const VALID_SORTS: WorkspaceSort[] = ["activity", "created", "name"];

export default async function WorkspacesTabPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; soul?: string; sort?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const search = params.search?.trim() || undefined;
  const soulId = params.soul?.trim() || undefined;
  const sort = (params.sort && VALID_SORTS.includes(params.sort as WorkspaceSort)
    ? (params.sort as WorkspaceSort)
    : "created") as WorkspaceSort;
  const cursor = params.cursor || undefined;

  const result = await listWorkspaces({ search, soulId, sort, cursor, limit: 50 });

  function buildHref(overrides: Partial<{ search: string; soul: string; sort: string; cursor: string }>): string {
    const next = new URLSearchParams();
    const merged = { search, soul: soulId, sort, cursor, ...overrides };
    if (merged.search) next.set("search", merged.search);
    if (merged.soul) next.set("soul", merged.soul);
    if (merged.sort && merged.sort !== "created") next.set("sort", merged.sort);
    if (merged.cursor) next.set("cursor", merged.cursor);
    const qs = next.toString();
    return qs ? `/super-admin/workspaces?${qs}` : "/super-admin/workspaces";
  }

  return (
    <div className="px-6 py-8 sm:px-10 sm:py-10 max-w-[1300px] mx-auto space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground font-mono mb-2">
          SeldonFrame · Workspaces
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Workspaces
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {result.totalForFilter.toLocaleString()} {result.totalForFilter === 1 ? "workspace" : "workspaces"} match the current filter
          {search ? ` · "${search}"` : ""}
          {soulId ? ` · ${soulId}` : ""}
        </p>
      </header>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap items-center gap-3">
        <input
          name="search"
          type="text"
          defaultValue={search ?? ""}
          placeholder="Search name or slug…"
          className="h-9 w-full sm:w-72 rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <input
          name="soul"
          type="text"
          defaultValue={soulId ?? ""}
          placeholder="Soul / template id (e.g. hvac)"
          className="h-9 w-44 rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground"
        />
        <select
          name="sort"
          defaultValue={sort}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="created">Newest first</option>
          <option value="activity">Most active</option>
          <option value="name">Name (A–Z)</option>
        </select>
        <button
          type="submit"
          className="h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
        >
          Apply
        </button>
        {(search || soulId || sort !== "created") && (
          <Link
            href="/super-admin/workspaces"
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
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Workspace</th>
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Owner</th>
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Soul</th>
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold text-right">Live agents</th>
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold text-right">Convos · 24h</th>
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No workspaces match this filter.
                </td>
              </tr>
            ) : (
              result.rows.map((w) => (
                <tr key={w.id} className="border-b last:border-b-0 hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/super-admin/workspaces/${w.id}`}
                      className="block hover:text-[#1FAE85] transition-colors"
                    >
                      <div className="font-medium text-foreground truncate">{w.name}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate">{w.slug}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[200px]">
                    {w.ownerEmail ?? <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {w.soulId ? (
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono text-muted-foreground bg-muted/40 border border-border">
                        {w.soulId}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50 font-mono text-[10px]">custom</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {w.liveAgents > 0 ? (
                      <span className="text-foreground font-medium">{w.liveAgents}</span>
                    ) : (
                      <span className="text-muted-foreground/50">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {w.conversations24h}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {w.lastActivityAt
                      ? formatRelative(w.lastActivityAt)
                      : <span className="text-muted-foreground/50">never</span>}
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
        Sort by &quot;Most active&quot; reorders the current page client-side; cursor pagination only works on &quot;Newest first.&quot;
      </p>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
