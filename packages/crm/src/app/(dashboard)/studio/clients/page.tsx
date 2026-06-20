// ICP-3 — the Clients screen (the builder's book of deployments).
//
// Lists every deployment this builder owns: the client name, which agent /
// template it runs, the surface, the price as $/mo, and a status badge
// (draft / active / paused / canceled). These are LITE TENANTS — SMB clients who
// never log into SeldonFrame. Most start (and, until the gated activation steps
// ship, stay) `draft`: the number + billing aren't live yet, which the badge +
// the empty-state copy state honestly.
//
// Distinct from the main-nav "/clients" (the workspace portfolio) — reconciling
// those two nouns is a later Phase-4 decision; this screen is the Studio's.
//
// Auth + builder resolution: getOrgId() — the operator's org IS the builder org.

import Link from "next/link";
import { Users } from "lucide-react";
import { getOrgId } from "@/lib/auth/helpers";
import { listDeployments } from "@/lib/deployments/store";
import { formatCentsMonthly, formatDeploymentSurface } from "@/lib/deployments/margin";
import { StudioTabs } from "../studio-tabs";
import { DeploymentStatusBadge } from "./status-badge";

export const dynamic = "force-dynamic";

export default async function StudioClientsPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <section className="animate-page-enter space-y-4">
        <StudioTabs />
        <h1 className="text-page-title">Clients</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to see your clients.
        </p>
      </section>
    );
  }

  const deployments = await listDeployments(orgId);

  return (
    <section className="animate-page-enter space-y-5">
      <StudioTabs />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-page-title">Clients</h1>
          <p className="text-label text-[hsl(var(--color-text-secondary))]">
            Every client you&apos;ve deployed an agent to. They never log in —
            this is your book of business.
          </p>
        </div>
        {deployments.length > 0 && (
          <Link href="/studio/agents" className="crm-button-secondary h-10 px-4 text-sm">
            Deploy an agent
          </Link>
        )}
      </div>

      {deployments.length === 0 ? (
        <article className="rounded-xl border bg-card p-8 text-center">
          <div className="mx-auto max-w-md space-y-4">
            <span
              className="mx-auto inline-flex size-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
              aria-hidden
            >
              <Users className="size-6" />
            </span>
            <h2 className="text-lg font-semibold">No clients yet — deploy an agent.</h2>
            <p className="text-sm text-muted-foreground">
              Build an agent once, then deploy it to a client. Each client you
              deploy to shows up here with its plan and status.
            </p>
            <div className="flex justify-center pt-2">
              <Link href="/studio/agents" className="crm-button-primary h-10 px-5 text-sm">
                Go to Agents
              </Link>
            </div>
          </div>
        </article>
      ) : (
        <div className="space-y-3">
          {deployments.map((d) => (
            <article key={d.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-card-title truncate">{d.clientName}</p>
                  <p className="text-sm text-muted-foreground">
                    {d.templateName ?? "Agent"} • {formatDeploymentSurface(d.surface)} •{" "}
                    {formatCentsMonthly(d.priceCents)}
                  </p>
                </div>
                <DeploymentStatusBadge status={d.status} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
