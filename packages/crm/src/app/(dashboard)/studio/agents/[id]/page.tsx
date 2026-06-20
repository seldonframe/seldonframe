// ICP-3 — the Agent TEMPLATE editor page (server component).
//
// Loads the builder's template (org-guarded via getOrgId + builderOrgId match),
// then renders the editor — greeting / persona script / FAQ / voice / tools —
// reusing the voice-receptionist editor's section patterns. Saves flow through
// saveAgentTemplateBlueprintAction. NO "Test" or "Deploy" buttons yet (later
// tasks 1.2 live test + 1.3 eval gate).

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Bot } from "lucide-react";
import { getOrgId } from "@/lib/auth/helpers";
import {
  getAgentTemplate,
  DEFAULT_VOICE_RECEPTIONIST_CAPABILITIES,
  DEFAULT_VOICE_RECEPTIONIST_VOICE,
} from "@/lib/agent-templates/store";
import type { AgentBlueprint } from "@/db/schema";
import { AgentTemplateEditor } from "./editor-client";
import { TemplateStatusBadge, formatTemplateType } from "../status-badge";

export const dynamic = "force-dynamic";

// The voice-exposed tools a voice_receptionist template can toggle. Mirrors the
// voice editor's VOICE_CAPABILITIES (provide_faq_answer is excluded on voice;
// FAQ is injected into the prompt).
const VOICE_CAPABILITIES = [...DEFAULT_VOICE_RECEPTIONIST_CAPABILITIES];

export default async function AgentTemplatePage({
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

  const blueprint = (template.blueprint ?? {}) as AgentBlueprint;

  return (
    <section className="animate-page-enter space-y-5 sm:space-y-6">
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
        <span className="text-foreground">{template.name}</span>
      </nav>

      <header className="flex items-start gap-3">
        <span
          className="inline-flex size-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
          aria-hidden
        >
          <Bot className="size-5" />
        </span>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-[22px] font-semibold tracking-tight leading-relaxed text-foreground">
              {template.name}
            </h1>
            <TemplateStatusBadge status={template.status} />
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            {formatTemplateType(template.type)} template. Configure it once here,
            then deploy it to as many clients as you like. Testing it live and
            publishing come next.
          </p>
        </div>
      </header>

      <AgentTemplateEditor
        templateId={template.id}
        initialBlueprint={{
          greeting: blueprint.greeting ?? "",
          customSkillMd: blueprint.customSkillMd ?? "",
          voice: blueprint.voice ?? DEFAULT_VOICE_RECEPTIONIST_VOICE,
          capabilities: blueprint.capabilities ?? [...VOICE_CAPABILITIES],
          faq: (blueprint.faq ?? []).map((f) => ({ q: f.q, a: f.a })),
        }}
        allCapabilities={VOICE_CAPABILITIES}
      />
    </section>
  );
}
