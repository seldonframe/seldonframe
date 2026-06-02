// Stage C2 — /automations/voice-receptionist editor page (server component).
//
// Server-loads (get-or-creates) THIS workspace's voice receptionist agent (an
// `agents` row, archetype 'voice-receptionist'), then renders:
//   - the editor (greeting / TTS voice / number / FAQ / tool toggles /
//     Live-Pause), whose saves write an agent_versions row (audit/rollback)
//     via the same updateAgentBlueprint primitive update_website_chatbot uses;
//   - a transcript list — recent agent_conversations for this agent, each
//     expandable in place to its agent_turns (role + content, in order);
//   - a "patterns this agent has learned" panel — top workspace brain_notes by
//     confidence (the visible end of the Stage B learning loop).
//
// Auth + workspace resolution: getOrgId() (same as every dashboard page).

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Phone } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  agentConversations,
  agentTurns,
  agents,
  organizations,
  type AgentBlueprint,
  type OrganizationIntegrations,
} from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getOrCreateVoiceAgent } from "@/lib/agents/voice/voice-agent";
import { listBrainDir } from "@/lib/brain/store";
import { VoiceReceptionistEditor } from "./editor-client";

export const dynamic = "force-dynamic";

// The 7 voice-exposed tools (mirror VOICE_TOOLS in openai-realtime.ts —
// provide_faq_answer is excluded on voice; FAQ is injected into the prompt).
const VOICE_CAPABILITIES = [
  "look_up_availability",
  "book_appointment",
  "find_my_existing_appointment",
  "reschedule_appointment",
  "cancel_appointment",
  "escalate_to_human",
  "take_message",
];

const CONVERSATION_LIMIT = 20;

export default async function VoiceReceptionistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const sp = await searchParams;
  const expandedId = sp.expand;

  // Get-or-create the voice agent for the active workspace (lazy — same as the
  // inbound-call path). After this the row always exists.
  const voiceAgent = await getOrCreateVoiceAgent({ orgId });

  // The agent's current version + status straight from the row (get-or-create
  // returns blueprint+status+id but not currentVersion, and a freshly-created
  // row needs its real version for the "current is vN" copy).
  const [agentRow] = await db
    .select({
      currentVersion: agents.currentVersion,
      status: agents.status,
      blueprint: agents.blueprint,
    })
    .from(agents)
    .where(eq(agents.id, voiceAgent.id))
    .limit(1);

  const blueprint = (agentRow?.blueprint ?? voiceAgent.blueprint ?? {}) as AgentBlueprint;
  const status = agentRow?.status ?? voiceAgent.status;
  const currentVersion = agentRow?.currentVersion ?? 1;

  // Workspace voice number lives on the org's twilio integration.
  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const integrations = (org?.integrations ?? {}) as OrganizationIntegrations;
  const voiceNumber = integrations.twilio?.fromNumber ?? "";

  // Recent voice conversations for this agent (most recent first).
  const convs = await db
    .select({
      id: agentConversations.id,
      status: agentConversations.status,
      startedAt: agentConversations.startedAt,
      lastTurnAt: agentConversations.lastTurnAt,
      turnCount: agentConversations.turnCount,
      channelMeta: agentConversations.channelMeta,
    })
    .from(agentConversations)
    .where(eq(agentConversations.agentId, voiceAgent.id))
    .orderBy(desc(agentConversations.lastTurnAt))
    .limit(CONVERSATION_LIMIT);

  // Top workspace brain notes by confidence (listBrainDir orders by confidence
  // desc) — the operator-visible "patterns this agent has learned" panel.
  const brainNotes = await listBrainDir({
    orgId,
    scope: "workspace",
    limit: 8,
  }).catch(() => []);

  return (
    <section className="animate-page-enter space-y-5 sm:space-y-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs text-muted-foreground"
      >
        <Link
          href="/automations"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronLeft className="size-3" />
          Automations
        </Link>
        <span>/</span>
        <span className="text-foreground">Voice Receptionist</span>
      </nav>

      <header className="flex items-start gap-3">
        <span
          className="inline-flex size-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
          aria-hidden
        >
          <Phone className="size-5" />
        </span>
        <div className="space-y-1">
          <h1 className="text-lg sm:text-[22px] font-semibold tracking-tight leading-relaxed text-foreground">
            Voice Receptionist
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            An AI receptionist that answers calls to your voice number — books
            appointments, answers questions from your FAQ, and hands off to a
            person when needed. Speaks in your business&apos;s local time.
          </p>
        </div>
      </header>

      <VoiceReceptionistEditor
        agentId={voiceAgent.id}
        currentVersion={currentVersion}
        status={status}
        initialNumber={voiceNumber}
        initialBlueprint={{
          greeting: blueprint.greeting ?? "",
          voice: blueprint.voice ?? "alloy",
          capabilities: blueprint.capabilities ?? [...VOICE_CAPABILITIES],
          faq: (blueprint.faq ?? []).map((f) => ({ q: f.q, a: f.a })),
          notifyPhone: blueprint.notifyPhone ?? "",
        }}
        allCapabilities={VOICE_CAPABILITIES}
      />

      {/* Transcript list */}
      <article className="rounded-xl border bg-card p-5 space-y-3">
        <div>
          <h2 className="text-card-title">Call transcripts</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Recent calls answered by this receptionist. Expand a call to read
            the full conversation.
          </p>
        </div>
        {convs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No calls yet. Once your number is live, call transcripts land here.
          </p>
        ) : (
          await renderTranscriptList({ convs, expandedId })
        )}
      </article>

      {/* Patterns learned */}
      <article className="rounded-xl border bg-card p-5 space-y-3">
        <div>
          <h2 className="text-card-title">Patterns this agent has learned</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            What this workspace&apos;s agents have figured out works, ranked by
            confidence. These are fed into the receptionist&apos;s prompt so it
            gets better over time.
          </p>
        </div>
        {brainNotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No patterns learned yet. As calls and chats close bookings, the
            agent compiles what worked into patterns that show up here.
          </p>
        ) : (
          <ul className="space-y-2">
            {brainNotes.map((note) => (
              <li
                key={note.id}
                className="rounded-md border bg-background p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="font-mono text-xs text-foreground">
                    {note.path}
                  </code>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span
                      className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400"
                      title="Confidence: (wins + 1) / (uses + 2)"
                    >
                      {(note.confidence * 100).toFixed(0)}% confidence
                    </span>
                    <span>
                      {note.wins}/{note.uses} wins
                    </span>
                  </div>
                </div>
                {note.body_preview && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {note.body_preview}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}

type ConvRow = {
  id: string;
  status: string;
  startedAt: Date;
  lastTurnAt: Date;
  turnCount: number;
  channelMeta: Record<string, unknown>;
};

async function renderTranscriptList(input: {
  convs: ConvRow[];
  expandedId: string | undefined;
}) {
  const expandedConv = input.convs.find((c) => c.id === input.expandedId);

  // Load the full transcript only for the expanded conversation (cheap — the
  // collapsed rows just show metadata).
  const expandedTurns = expandedConv
    ? await db
        .select({
          turnIndex: agentTurns.turnIndex,
          role: agentTurns.role,
          content: agentTurns.content,
        })
        .from(agentTurns)
        .where(eq(agentTurns.conversationId, expandedConv.id))
        .orderBy(agentTurns.turnIndex)
        .limit(200)
    : [];

  return (
    <div className="space-y-2">
      {input.convs.map((conv) => {
        const isExpanded = input.expandedId === conv.id;
        const fromNumber =
          typeof conv.channelMeta?.from_number === "string"
            ? (conv.channelMeta.from_number as string)
            : null;
        return (
          <div key={conv.id} className="rounded-xl border bg-background p-4">
            <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <ConvStatusPill status={conv.status} />
                {fromNumber && (
                  <span className="font-mono">from {fromNumber}</span>
                )}
                <span>{conv.turnCount} turns</span>
                <span>{new Date(conv.lastTurnAt).toLocaleString()}</span>
              </div>
              <Link
                href={
                  isExpanded
                    ? `/automations/voice-receptionist`
                    : `/automations/voice-receptionist?expand=${conv.id}`
                }
                scroll={false}
                className="text-primary underline-offset-2 hover:underline"
              >
                {isExpanded ? "Collapse" : "Expand"}
              </Link>
            </header>

            {isExpanded && (
              <div className="mt-3 space-y-3">
                {expandedTurns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No transcript captured for this call.
                  </p>
                ) : (
                  expandedTurns.map((t) => (
                    <div
                      key={t.turnIndex}
                      className="border-l-2 border-border pl-3"
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono uppercase">
                          {t.role === "assistant" ? "agent" : t.role}
                        </span>
                        <span>#{t.turnIndex}</span>
                      </div>
                      {t.content && (
                        <p className="mt-1 whitespace-pre-wrap text-sm">
                          {t.content}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ConvStatusPill({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : status === "completed"
        ? "bg-slate-500/15 text-slate-700 dark:text-slate-300"
        : status === "escalated"
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
          : status === "abandoned"
            ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
            : "bg-slate-500/15 text-slate-700 dark:text-slate-300";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      {status}
    </span>
  );
}
