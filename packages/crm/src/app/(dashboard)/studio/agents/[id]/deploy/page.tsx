// ICP-3 — the Deploy-to-client flow (server component).
//
// Launched from the Studio ("Deploy" on a template row or the template header).
// Loads the builder's templates (org-guarded via getOrgId + builderOrgId match),
// preselects the one in the URL, and hands them to the 4-step client stepper.
// The stepper captures intent (client, surface, price) and calls
// createDeploymentAction, which writes a `draft` deployments row. NO phone
// number is provisioned, NO Stripe billing is created, NO voice runtime starts —
// those are LATER, GATED steps. The success state says so honestly.

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getOrgId } from "@/lib/auth/helpers";
import { listAgentTemplates } from "@/lib/agent-templates/store";
import { DeployFlowClient } from "./deploy-client";
import { StudioTabs } from "../../../studio-tabs";

export const dynamic = "force-dynamic";

export default async function DeployTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const { id } = await params;

  // Load the builder's own templates. The deploy flow only ever offers
  // templates this builder owns (the list is already builder-scoped), so the
  // ownership guard is implicit: if the URL id isn't in the list, 404.
  const templates = await listAgentTemplates(orgId);
  const selected = templates.find((t) => t.id === id);
  if (!selected) notFound();

  return (
    <section className="animate-page-enter space-y-5 sm:space-y-6">
      <StudioTabs />

      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs text-muted-foreground"
      >
        <Link
          href="/studio/agents"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronLeft className="size-3" />
          Agents
        </Link>
        <span>/</span>
        <Link
          href={`/studio/agents/${selected.id}`}
          className="hover:text-foreground"
        >
          {selected.name}
        </Link>
        <span>/</span>
        <span className="text-foreground">Deploy</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-lg sm:text-[22px] font-semibold tracking-tight leading-relaxed text-foreground">
          Deploy to a client
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Set up a no-login client for this agent. We&apos;ll save it now; the
          phone number and billing activate when you connect Twilio and Stripe.
        </p>
      </header>

      <DeployFlowClient
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          type: t.type,
          status: t.status,
        }))}
        initialTemplateId={selected.id}
      />
    </section>
  );
}
