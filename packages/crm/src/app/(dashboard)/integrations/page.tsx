// Phase 2 — /integrations dashboard (server component).
//
// The in-product "Connect your apps" surface. Renders the curated Composio
// toolkit catalog and the workspace's live connection state, so an operator can
// connect Gmail / Calendar / Slack / HubSpot / QuickBooks / Notion / Outlook /
// Drive via Composio's managed OAuth — no per-toolkit OAuth-app registration.
//
// NODE RUNTIME: this page transitively imports the Composio SDK (via the adapter
// the actions call), which is Node-only. `export const runtime = "nodejs"` is
// REQUIRED so it never gets bundled for the edge.

import { getOrgId } from "@/lib/auth/helpers";
import { redirect } from "next/navigation";
import { Plug } from "lucide-react";
import { COMPOSIO_TOOLKITS } from "@/lib/integrations/composio/catalog";
import { resolveComposioKey } from "@/lib/integrations/composio/keys";
import { listConnections } from "@/lib/integrations/composio/client";
import {
  IntegrationsClient,
  type ToolkitConnectionView,
} from "./integrations-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  searchParams,
}: {
  // `connect` — hotfix H4a — the win-ladder "connect calendar" deep link
  // (?connect=calendar) narrows the grid to calendar toolkits.
  searchParams: Promise<{ connected?: string; status?: string; connect?: string }>;
}) {
  const orgId = await getOrgId();
  if (!orgId) redirect("/signin");

  const params = await searchParams;

  // Cheap key probe — decides whether to show the BYO-key panel + gate Connect.
  // (resolveComposioKey reads a single encrypted secret + the env var.)
  const { source } = await resolveComposioKey(orgId);
  const hasKey = source !== "none";

  // Best-effort live connection state. When Composio is unconfigured (or errors)
  // we render the grid with everything "Not connected" — the page never 500s on
  // a Composio hiccup.
  let initialConnections: ToolkitConnectionView[] = [];
  if (hasKey) {
    try {
      const conns = await listConnections(orgId);
      initialConnections = conns.map((c) => ({
        slug: c.slug,
        connected: c.connected,
        connectedAccountId: c.connectedAccountId,
      }));
    } catch {
      initialConnections = [];
    }
  }

  const catalog = COMPOSIO_TOOLKITS.map((t) => ({
    slug: t.slug,
    label: t.label,
    logo: t.logo,
    primaryTrigger: t.primaryTrigger,
  }));

  return (
    <section className="animate-page-enter space-y-5 sm:space-y-6">
      <header className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden
          className="inline-flex size-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
        >
          <Plug className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">
            Integrations
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">
            Connect the apps your business already uses. Once connected, your
            agents can read and act in them — answer from your inbox, book on
            your calendar, update your CRM — securely via managed OAuth.
          </p>
        </div>
      </header>

      <IntegrationsClient
        catalog={catalog}
        initialConnections={initialConnections}
        hasKey={hasKey}
        returnedToolkit={params.connected ?? null}
        returnedStatus={params.status ?? null}
        connectFilter={params.connect ?? null}
      />
    </section>
  );
}
