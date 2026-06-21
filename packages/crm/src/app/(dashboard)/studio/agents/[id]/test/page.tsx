// ICP-3 (task 1.2) — the agent TEMPLATE test sandbox (server component).
//
// Launched from the template editor ("Test" in the header). Loads the builder's
// template (org-guarded via getOrgId + builderOrgId match), runs a pre-flight
// LLM-key check (resolveAgentKeyStatus — BYOK first, then the platform
// fallback, same as the per-workspace agent sandbox), and hands the template
// blueprint to the chat client.
//
// The chat client calls testAgentTemplateTurn, which runs each turn through the
// SAME agent runtime building blocks the live agent uses — in testMode, with NO
// persistence and NO real bookings. This is a sandbox: nothing here deploys,
// provisions a number, or writes to the database.

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, FlaskConical } from "lucide-react";
import { getOrgId } from "@/lib/auth/helpers";
import { getAgentTemplate } from "@/lib/agent-templates/store";
import { resolveAgentKeyStatus } from "@/lib/ai/client";
import type { AgentBlueprint } from "@/db/schema";
import { StudioTabs } from "../../../studio-tabs";
import { TemplateStatusBadge, formatTemplateType } from "../../status-badge";
import { TemplateTestClient } from "./test-client";

export const dynamic = "force-dynamic";

export default async function AgentTemplateTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const { id } = await params;
  const template = await getAgentTemplate(id);
  // Ownership guard: only the builder that owns the template may test it.
  if (!template || template.builderOrgId !== orgId) notFound();

  const blueprint = (template.blueprint ?? {}) as AgentBlueprint;
  const greeting =
    blueprint.greeting?.trim() || "Thanks for calling! How can I help you today?";

  // Pre-flight: does the org have a usable LLM key? Mirrors getAIClient's
  // resolution order (BYOK anthropic → platform fallback). "none" blocks the
  // sandbox with an actionable prompt; "platform" warns about shared quota.
  const keyStatus = await resolveAgentKeyStatus(orgId);

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
        <span className="text-foreground">Test</span>
      </nav>

      <header className="flex flex-wrap items-start gap-3">
        <span
          className="inline-flex size-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
          aria-hidden
        >
          <FlaskConical className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-[22px] font-semibold tracking-tight leading-relaxed text-foreground">
              Test {template.name}
            </h1>
            <TemplateStatusBadge status={template.status} />
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Chat with this {formatTemplateType(template.type).toLowerCase()} just
            like a customer would, to sanity-check its persona, FAQ answers, and
            tools. This is a sandbox — bookings are simulated, nothing is saved,
            and no real calls are made.
          </p>
        </div>
      </header>

      <TemplateTestClient
        templateId={template.id}
        greeting={greeting}
        status={template.status}
        keyMode={keyStatus.mode}
      />
    </section>
  );
}
