// Agency multi-client deploy — the "Deploy to clients" screen (server component).
//
// Launched from the Studio agent template header. Loads the builder's template
// (org-guarded via getOrgId + builderOrgId match), resolves the agency this
// builder org owns, enumerates its EXISTING client workspaces (parentAgencyId,
// not archived), and marks which already run an agent created from this template
// (the idempotency signal). Hands all of that to the client panel, which lets
// the agency pick clients and deploy a LIVE agent into each in one click.
//
// No agency / no client workspaces → a friendly empty state (the client panel
// renders it). The deploy itself flows through deployAgentTemplateToClientsAction.

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getOrgId } from "@/lib/auth/helpers";
import { getAgentTemplate } from "@/lib/agent-templates/store";
import {
  resolveBuilderAgency,
  listClientOrgsForAgency,
  listClientOrgIdsWithTemplateAgent,
} from "@/lib/deployments/store";
import { formatTemplateType } from "../../status-badge";
import { StudioTabs } from "../../../studio-tabs";
import { DeployToClientsPanel } from "./deploy-to-clients-client";

export const dynamic = "force-dynamic";

export default async function DeployToClientsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const { id } = await params;
  const template = await getAgentTemplate(id);
  // Ownership guard: only the builder that owns the template can open it.
  if (!template || template.builderOrgId !== orgId) notFound();

  // Resolve the agency this builder org owns, then its client workspaces. A
  // missing agency / empty list is NOT an error — it drives the empty state.
  const agencyId = await resolveBuilderAgency(orgId);
  const clientOrgs = agencyId ? await listClientOrgsForAgency(agencyId) : [];
  const alreadyDeployed = clientOrgs.length
    ? await listClientOrgIdsWithTemplateAgent(
        clientOrgs.map((o) => o.id),
        template.id,
      )
    : new Set<string>();

  const clients = clientOrgs.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    alreadyDeployed: alreadyDeployed.has(o.id),
  }));

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
          href={`/studio/agents/${template.id}`}
          className="hover:text-foreground"
        >
          {template.name}
        </Link>
        <span>/</span>
        <span className="text-foreground">Deploy to clients</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-lg sm:text-[22px] font-semibold tracking-tight leading-relaxed text-foreground">
          Deploy to your clients
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Put <span className="font-medium text-foreground">{template.name}</span>{" "}
          ({formatTemplateType(template.type)}) live in your client workspaces.
          Each one runs grounded in that client&apos;s own business
          automatically — you never re-configure it per client.
        </p>
      </header>

      <DeployToClientsPanel
        templateId={template.id}
        templateName={template.name}
        clients={clients}
      />
    </section>
  );
}
