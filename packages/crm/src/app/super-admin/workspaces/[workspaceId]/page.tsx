// v1.35.2 — Workspace detail (drill-down).

import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkspaceDetail } from "@/lib/super-admin/workspaces";

export const dynamic = "force-dynamic";

export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const ws = await getWorkspaceDetail(workspaceId);

  if (!ws) notFound();

  const liveAgents = ws.agents.filter((a) => a.status === "live");
  const draftAgents = ws.agents.filter((a) => a.status === "draft" || a.status === "test");
  const pausedAgents = ws.agents.filter((a) => a.status === "paused");

  const llmCostUsd = (ws.lifetimeLlmCostCents / 100).toFixed(2);

  return (
    <div className="px-6 py-8 sm:px-10 sm:py-10 max-w-[1200px] mx-auto space-y-8">
      {/* Breadcrumb */}
      <nav className="text-xs text-muted-foreground">
        <Link href="/super-admin/workspaces" className="hover:text-foreground transition-colors">
          Workspaces
        </Link>
        <span className="mx-2">·</span>
        <span>{ws.slug}</span>
      </nav>

      {/* Header */}
      <header className="grid sm:grid-cols-[1fr,auto] gap-4 items-start">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {ws.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground font-mono">{ws.slug}.app.seldonframe.com</p>
          <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
            {ws.soulId ? (
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono text-muted-foreground bg-muted/40 border border-border">
                {ws.soulId}
              </span>
            ) : (
              <span className="text-muted-foreground/50 font-mono text-[10px]">custom soul</span>
            )}
            {ws.ownerEmail && ws.ownerId && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-muted-foreground">owned by</span>
                <Link
                  href={`/super-admin/users/${ws.ownerId}`}
                  className="text-[#1FAE85] hover:underline font-medium"
                >
                  {ws.ownerEmail}
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="rounded-[10px] border bg-card p-4 text-xs space-y-1.5 min-w-[260px]">
          <DetailRow label="Workspace ID" mono>{ws.id}</DetailRow>
          <DetailRow label="Created">
            {new Date(ws.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </DetailRow>
          <DetailRow label="Subdomain" mono>{ws.slug}.app.seldonframe.com</DetailRow>
        </div>
      </header>

      {/* Activity stat strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Activity · 24h" value={ws.activity.last24h.toLocaleString()} />
        <StatBox label="Activity · 7d" value={ws.activity.last7d.toLocaleString()} />
        <StatBox label="Activity · 30d" value={ws.activity.last30d.toLocaleString()} />
        <StatBox label="Conversations · all-time" value={ws.totalConversations.toLocaleString()} subtitle={`${ws.distinctContacts.toLocaleString()} distinct contacts`} />
      </section>

      {/* Lifetime usage */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatBox
          label="Lifetime tokens"
          value={ws.lifetimeTokens.toLocaleString()}
          subtitle="across all agent conversations"
        />
        <StatBox
          label="Lifetime LLM cost"
          value={`$${llmCostUsd}`}
          subtitle="self-reported by the runtime · BYOK"
          accent="primary"
        />
      </section>

      {/* Agents */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">
            Agents · <span className="text-muted-foreground">{ws.agents.length}</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {liveAgents.length} live · {draftAgents.length} draft · {pausedAgents.length} paused
          </p>
        </div>
        {ws.agents.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-border bg-card/30 px-5 py-6 text-sm text-muted-foreground">
            This workspace hasn&apos;t built any agents yet.
          </div>
        ) : (
          <div className="rounded-[12px] border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Agent</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Archetype</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Channel</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {ws.agents.map((a) => (
                  <tr key={a.id} className="border-b last:border-b-0 hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground truncate">{a.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{a.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{a.archetype}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{a.channel}</td>
                    <td className="px-4 py-3">
                      <AgentStatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(a.createdAt).toLocaleDateString(undefined, {
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
      <span className={`text-foreground truncate ${mono ? "font-mono" : ""}`}>{children}</span>
    </div>
  );
}

function StatBox({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string;
  subtitle?: string;
  accent?: "primary";
}) {
  const accentClass = accent === "primary"
    ? "border-[#1FAE85]/30 bg-gradient-to-br from-[#1FAE85]/8 to-transparent"
    : "border-border bg-card";
  return (
    <div className={`rounded-[10px] border p-4 ${accentClass}`}>
      <p className="text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight text-foreground mt-1">{value}</p>
      {subtitle ? (
        <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>
      ) : null}
    </div>
  );
}

function AgentStatusBadge({ status }: { status: string }) {
  const styles =
    status === "live"
      ? "bg-[#1FAE85]/10 border-[#1FAE85]/30 text-[#1FAE85]"
      : status === "paused"
      ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
      : "bg-muted/40 border-border text-muted-foreground";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10.5px] font-medium ${styles}`}>
      {status}
    </span>
  );
}
