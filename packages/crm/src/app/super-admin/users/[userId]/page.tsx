// v1.35.1 — User detail (drill-down).
//
// Header with email/name/plan/Stripe ID, then the workspaces this
// user owns + workspaces they're a member of. Each workspace links
// to /super-admin/workspaces/<id> (lands in v1.35.2's empty page
// today; the link works regardless).

import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserDetail } from "@/lib/super-admin/users";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const user = await getUserDetail(userId);

  if (!user) notFound();

  const ownedWorkspaces = user.workspaces.filter((w) => w.relation === "owner");
  const memberWorkspaces = user.workspaces.filter((w) => w.relation === "member");

  return (
    <div className="px-6 py-8 sm:px-10 sm:py-10 max-w-[1100px] mx-auto space-y-8">
      {/* Breadcrumb */}
      <nav className="text-xs text-muted-foreground">
        <Link href="/super-admin/users" className="hover:text-foreground transition-colors">
          Users
        </Link>
        <span className="mx-2">·</span>
        <span>{user.email}</span>
      </nav>

      {/* Header */}
      <header className="grid sm:grid-cols-[1fr,auto] gap-4 items-start">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {user.name || user.email}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <PlanBadge planId={user.planId} label={user.planLabel} />
            {user.emailVerifiedAt ? (
              <span className="text-[10px] uppercase tracking-[0.06em] font-mono text-muted-foreground">
                · email verified
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-[0.06em] font-mono text-amber-500">
                · email not verified
              </span>
            )}
          </div>
        </div>

        <div className="rounded-[10px] border bg-card p-4 text-xs space-y-1.5 min-w-[260px]">
          <DetailRow label="User ID" mono>
            {user.id}
          </DetailRow>
          <DetailRow label="Joined">
            {new Date(user.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </DetailRow>
          <DetailRow label="Stripe customer" mono>
            {user.stripeCustomerId ?? "—"}
          </DetailRow>
        </div>
      </header>

      {/* Workspaces owned */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">
            Workspaces owned · <span className="text-muted-foreground">{ownedWorkspaces.length}</span>
          </h2>
        </div>
        {ownedWorkspaces.length === 0 ? (
          <EmptyHint>This user hasn&apos;t created any workspaces yet.</EmptyHint>
        ) : (
          <WorkspaceTable workspaces={ownedWorkspaces} />
        )}
      </section>

      {/* Workspaces joined as member */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">
            Joined as member · <span className="text-muted-foreground">{memberWorkspaces.length}</span>
          </h2>
        </div>
        {memberWorkspaces.length === 0 ? (
          <EmptyHint>This user isn&apos;t a member of any other workspaces.</EmptyHint>
        ) : (
          <WorkspaceTable workspaces={memberWorkspaces} showMembershipStatus />
        )}
      </section>
    </div>
  );
}

function DetailRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] uppercase tracking-[0.06em] font-mono text-muted-foreground shrink-0">
        {label}
      </span>
      <span className={`text-foreground truncate ${mono ? "font-mono" : ""}`}>
        {children}
      </span>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-border bg-card/30 px-5 py-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function WorkspaceTable({
  workspaces,
  showMembershipStatus,
}: {
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    soulId: string | null;
    createdAt: string;
    lastActivityAt: string | null;
    membershipStatus?: string;
  }>;
  showMembershipStatus?: boolean;
}) {
  return (
    <div className="rounded-[12px] border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 border-b">
          <tr className="text-left">
            <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Workspace</th>
            <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Soul</th>
            <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Last activity</th>
            <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">
              {showMembershipStatus ? "Status" : "Created"}
            </th>
          </tr>
        </thead>
        <tbody>
          {workspaces.map((w) => (
            <tr key={w.id} className="border-b last:border-b-0 hover:bg-accent/30 transition-colors">
              <td className="px-4 py-3">
                <Link
                  href={`/super-admin/workspaces/${w.id}`}
                  className="block hover:text-[#1FAE85] transition-colors"
                >
                  <div className="font-medium text-foreground truncate">{w.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{w.slug}</div>
                </Link>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{w.soulId ?? "custom"}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                {w.lastActivityAt
                  ? formatRelative(w.lastActivityAt)
                  : <span className="text-muted-foreground/50">never</span>}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                {showMembershipStatus
                  ? (w.membershipStatus ?? "active")
                  : new Date(w.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

function PlanBadge({ planId, label }: { planId: string | null; label: string }) {
  const isPaid = planId === "growth" || planId === "scale";
  const styles = isPaid
    ? "bg-[#1FAE85]/10 border-[#1FAE85]/30 text-[#1FAE85]"
    : "bg-muted/40 border-border text-muted-foreground";
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full border text-[11px] font-medium ${styles}`}>
      {label}
    </span>
  );
}
