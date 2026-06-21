// ICP-3 — the Agent TEMPLATE editor page (server component).
//
// Loads the builder's template (org-guarded via getOrgId + builderOrgId match),
// then renders the editor — greeting / persona script / FAQ / voice / tools —
// reusing the voice-receptionist editor's section patterns. Saves flow through
// saveAgentTemplateBlueprintAction. The header offers Test (the sandboxed chat
// panel, task 1.2) + Deploy (the deploy-to-client flow). The eval gate is 1.3.

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Bot } from "lucide-react";
import { getOrgId } from "@/lib/auth/helpers";
import {
  getAgentTemplate,
  surfaceForType,
  DEFAULT_VOICE_RECEPTIONIST_CAPABILITIES,
  DEFAULT_VOICE_RECEPTIONIST_VOICE,
  DEFAULT_CHAT_ASSISTANT_CAPABILITIES,
  type AgentTemplateType,
} from "@/lib/agent-templates/store";
import type { AgentBlueprint } from "@/db/schema";
import { AgentTemplateEditor } from "./editor-client";
import { TemplateStatusBadge, formatTemplateType } from "../status-badge";
import { DeployButton } from "../deploy-button";
import { TestButton } from "../test-button";

export const dynamic = "force-dynamic";

// The tools a template can toggle, per surface. Voice mirrors the voice
// editor's VOICE_CAPABILITIES (provide_faq_answer is excluded on voice; FAQ is
// injected into the prompt). Chat gets the chat-assistant set (incl.
// provide_faq_answer, which voice filters out as a v1.26 placeholder).
const VOICE_CAPABILITIES = [...DEFAULT_VOICE_RECEPTIONIST_CAPABILITIES];
const CHAT_CAPABILITIES = [...DEFAULT_CHAT_ASSISTANT_CAPABILITIES];

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
  // template.type is the DB text column (typed `string`); the column only ever
  // holds a valid AgentTemplateType, and surfaceForType safely defaults
  // anything non-chat to voice.
  const surface = surfaceForType(template.type as AgentTemplateType);
  const allCapabilities =
    surface === "chat" ? CHAT_CAPABILITIES : VOICE_CAPABILITIES;

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

      <header className="flex flex-wrap items-start gap-3">
        <span
          className="inline-flex size-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
          aria-hidden
        >
          <Bot className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-[22px] font-semibold tracking-tight leading-relaxed text-foreground">
              {template.name}
            </h1>
            <TemplateStatusBadge status={template.status} />
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            {formatTemplateType(template.type)} template. Configure it once here,
            test it in the sandbox, then deploy it to as many clients as you
            like.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TestButton templateId={template.id} variant="secondary" />
          <DeployButton templateId={template.id} variant="primary" />
        </div>
      </header>

      <AgentTemplateEditor
        templateId={template.id}
        surface={surface}
        initialBlueprint={{
          greeting: blueprint.greeting ?? "",
          customSkillMd: blueprint.customSkillMd ?? "",
          voice: blueprint.voice ?? DEFAULT_VOICE_RECEPTIONIST_VOICE,
          capabilities: blueprint.capabilities ?? [...allCapabilities],
          faq: (blueprint.faq ?? []).map((f) => ({ q: f.q, a: f.a })),
          quoteRanges: (blueprint.quoteRanges ?? []).map((r) => ({
            service: r.service,
            low: r.low,
            high: r.high,
          })),
        }}
        allCapabilities={allCapabilities}
      />
    </section>
  );
}
