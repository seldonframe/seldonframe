"use client";

// Agency multi-client deploy — the client panel.
//
// Lists the agency's EXISTING client workspaces with a checkbox each (clients
// that already run this template are shown deployed + locked off). "Select all"
// toggles the deployable ones; "Deploy" calls deployAgentTemplateToClientsAction
// and renders an honest result ("Deployed to N · M already had it"). When the
// agency has no client workspaces, a friendly empty state replaces the list.
//
// All state is local + a useTransition around the action (the deploy-client
// stepper pattern). No business logic here — the action owns idempotency +
// soul-grounding; this just collects a selection.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Building2, Check, Rocket, Users } from "lucide-react";
import { deployAgentTemplateToClientsAction } from "@/lib/deployments/deploy-to-clients-action";

type ClientRow = {
  id: string;
  name: string;
  slug: string;
  /** Already runs an agent from this template — locked + excluded from deploy. */
  alreadyDeployed: boolean;
};

type DeployResult = {
  deployed: number;
  alreadyHadIt: number;
  failed: number;
};

export function DeployToClientsPanel({
  templateId,
  templateName,
  clients,
}: {
  templateId: string;
  templateName: string;
  clients: ClientRow[];
}) {
  // The clients we can deploy to (everything not already deployed).
  const deployable = useMemo(
    () => clients.filter((c) => !c.alreadyDeployed),
    [clients],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isDeploying, startDeploy] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeployResult | null>(null);

  // Empty state — no client workspaces under this agency.
  if (clients.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <span
          className="mx-auto mb-3 inline-flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
          aria-hidden
        >
          <Users className="size-6" />
        </span>
        <h2 className="text-card-title">No client workspaces yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          When you add client workspaces to your agency, they&apos;ll show up
          here and you can put {templateName} live in all of them at once.
        </p>
        <Link
          href="/studio/clients"
          className="crm-button-secondary mt-4 inline-flex h-9 items-center gap-1.5 px-4 text-sm"
        >
          Go to Clients
        </Link>
      </div>
    );
  }

  const allDeployableSelected =
    deployable.length > 0 && selected.size === deployable.length;

  const toggle = (id: string) => {
    setResult(null);
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setResult(null);
    setError(null);
    setSelected((prev) =>
      prev.size === deployable.length
        ? new Set()
        : new Set(deployable.map((c) => c.id)),
    );
  };

  const deploy = () => {
    if (selected.size === 0) return;
    setError(null);
    setResult(null);
    const clientOrgIds = [...selected];
    startDeploy(async () => {
      const res = await deployAgentTemplateToClientsAction({
        templateId,
        clientOrgIds,
      });
      if (!res.ok) {
        setError(
          res.error === "no_agency" || res.error === "no_client_workspaces"
            ? "You don't have any client workspaces to deploy to yet."
            : res.error === "no_valid_targets"
              ? "Select at least one client workspace first."
              : res.error === "template_not_found"
                ? "That agent template couldn't be found."
                : "Something went wrong — please try again.",
        );
        return;
      }
      const failed = res.skipped.filter((s) => s.reason === "create_failed").length;
      const alreadyHadIt = res.skipped.filter(
        (s) => s.reason === "already_deployed",
      ).length;
      setResult({ deployed: res.deployed.length, alreadyHadIt, failed });
      // Clear the selection — the page revalidates so the now-deployed rows
      // re-render as locked on the next load.
      setSelected(new Set());
    });
  };

  return (
    <div className="space-y-4">
      {/* Selection toolbar. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggleAll}
          disabled={deployable.length === 0 || isDeploying}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <span
            className={`inline-flex size-4 items-center justify-center rounded-[4px] border ${
              allDeployableSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input"
            }`}
            aria-hidden
          >
            {allDeployableSelected && <Check className="size-3" />}
          </span>
          Select all ({deployable.length})
        </button>
        <button
          type="button"
          onClick={deploy}
          disabled={selected.size === 0 || isDeploying}
          className="crm-button-primary inline-flex h-9 items-center gap-1.5 px-4 text-sm disabled:opacity-60"
        >
          <Rocket className={`size-4 ${isDeploying ? "animate-pulse" : ""}`} />
          {isDeploying
            ? "Deploying…"
            : selected.size > 0
              ? `Deploy to ${selected.size}`
              : "Deploy"}
        </button>
      </div>

      {/* Result + error. */}
      {result && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <span className="font-medium">
            Deployed to {result.deployed}{" "}
            {result.deployed === 1 ? "client" : "clients"}
          </span>
          {result.alreadyHadIt > 0 && <> · {result.alreadyHadIt} already had it</>}
          {result.failed > 0 && (
            <span className="text-rose-600 dark:text-rose-400">
              {" "}
              · {result.failed} failed
            </span>
          )}
          . Each one is live now, grounded in that client&apos;s own business.
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* Client list. */}
      <ul className="divide-y rounded-xl border bg-card">
        {clients.map((c) => {
          const checked = selected.has(c.id);
          const locked = c.alreadyDeployed;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => !locked && toggle(c.id)}
                disabled={locked || isDeploying}
                aria-pressed={checked}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                  locked
                    ? "cursor-default"
                    : "hover:bg-muted/50 cursor-pointer"
                }`}
              >
                <span
                  className={`inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border ${
                    locked
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input"
                  }`}
                  aria-hidden
                >
                  {(checked || locked) && <Check className="size-3" />}
                </span>
                <span
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                  aria-hidden
                >
                  <Building2 className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {c.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.slug}
                  </span>
                </span>
                {locked && (
                  <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Deployed
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
