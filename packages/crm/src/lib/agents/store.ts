// v1.26.0 — agent CRUD (server actions for agent lifecycle)
//
// Three actions:
//   - createAgent: register a new agent draft. Generates slug,
//     creates v1 in agent_versions, soul-derives the initial blueprint.
//   - updateAgentBlueprint: append capability / faq / pricing / etc.
//     Bumps current_version + writes new agent_versions row.
//   - publishAgent: flip status draft|test → live. v1.26.1 adds
//     eval-gating; v1.26.0 just flips the status.
//
// All scoped by orgId. v1.26.1 adds the MCP wrapper tools that call
// the same server actions over HTTP from Claude Code / Cursor.

"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  agentVersions,
  organizations,
  type AgentBlueprint,
  type Agent,
} from "@/db/schema";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { runEvalSuite } from "./eval-runner";

// ─── createAgent ───────────────────────────────────────────────────────────

export type CreateAgentInput = {
  orgId: string;
  name: string;
  archetype: "website-chatbot" | "voice-receptionist" | "sms-followup-bot";
  channel: "web_chat" | "voice" | "sms" | "email";
  /** Optional starting capabilities (defaults to all-five for
   *  website-chatbot archetype). */
  capabilities?: string[];
  /** Optional FAQ pairs to seed. Operator can also attach via
   *  updateAgentBlueprint later. v1.45 widened: callers may include
   *  provenance fields (source/sourceUrl/synthesizedAt/synthesizedFromSoulVersion)
   *  — the orchestrator in /api/v1/workspace/create passes these
   *  through when auto-extracting FAQ from a website crawl. */
  faq?: Array<{
    q: string;
    a: string;
    source?: "extracted" | "synthesized" | "operator";
    sourceUrl?: string;
    synthesizedAt?: string;
    synthesizedFromSoulVersion?: number;
  }>;
  /** Optional explicit pricing facts. Defaults to empty (agent
   *  refuses to quote any price). */
  pricingFacts?: Array<{ label: string; amount: number; currency: string }>;
  /** Optional greeting override. */
  greeting?: string;
  /** v1.55.0 — Optional initial status. Defaults to "draft" when
   *  omitted (preserves behavior for callers that don't specify).
   *  v2/complete sets this to "test" so the auto-created website
   *  chatbot is responsive on the preview page immediately. */
  status?: "draft" | "test" | "live";
};

export type CreateAgentResult =
  | { ok: true; agent: Agent; embedUrl: string; turnUrl: string }
  | { ok: false; error: string; validation_errors: string[] };

const DEFAULT_CAPABILITIES_BY_ARCHETYPE: Record<string, string[]> = {
  "website-chatbot": [
    "look_up_availability",
    "book_appointment",
    "find_my_existing_appointment",
    "reschedule_appointment",
    "cancel_appointment",
    "escalate_to_human",
    "provide_faq_answer",
  ],
  "voice-receptionist": [
    "look_up_availability",
    "book_appointment",
    "find_my_existing_appointment",
    "reschedule_appointment",
    "cancel_appointment",
    "escalate_to_human",
  ],
  "sms-followup-bot": [
    "look_up_availability",
    "find_my_existing_appointment",
    "reschedule_appointment",
    "cancel_appointment",
    "escalate_to_human",
  ],
};

export async function createAgent(input: CreateAgentInput): Promise<CreateAgentResult> {
  assertWritable();

  const errors: string[] = [];
  if (!input.orgId) errors.push("orgId is required");
  if (!input.name || input.name.trim().length < 2) {
    errors.push("name must be at least 2 chars");
  }
  if (!["website-chatbot", "voice-receptionist", "sms-followup-bot"].includes(input.archetype)) {
    errors.push("unknown archetype");
  }
  if (errors.length > 0) {
    return { ok: false, error: "validation_failed", validation_errors: errors };
  }

  // Verify org exists.
  const [org] = await db
    .select({ id: organizations.id, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);
  if (!org) {
    return {
      ok: false,
      error: "org_not_found",
      validation_errors: [`workspace ${input.orgId} does not exist`],
    };
  }

  // Generate slug. Per-org uniqueness; first agent gets "default" slug
  // so the embed URL stays terse.
  const baseSlug = slugify(input.name);
  let slug = baseSlug || "default";
  const [existingFirstAgent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.orgId, input.orgId))
    .limit(1);
  if (!existingFirstAgent) {
    slug = "default";
  } else {
    // Ensure uniqueness
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
      const [conflict] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.orgId, input.orgId), eq(agents.slug, candidate)))
        .limit(1);
      if (!conflict) {
        slug = candidate;
        break;
      }
    }
  }

  const blueprint: AgentBlueprint = {
    archetype: input.archetype,
    capabilities:
      input.capabilities ?? DEFAULT_CAPABILITIES_BY_ARCHETYPE[input.archetype] ?? [],
    faq: input.faq ?? [],
    pricingFacts: input.pricingFacts ?? [],
    greeting: input.greeting ?? "Hi! How can I help you today?",
  };

  const [created] = await db
    .insert(agents)
    .values({
      orgId: input.orgId,
      name: input.name.trim(),
      slug,
      channel: input.channel,
      archetype: input.archetype,
      blueprint,
      currentVersion: 1,
      // v1.55.0 — honor input.status (default "draft" for backward compat).
      status: input.status ?? "draft",
    })
    .returning();
  if (!created) {
    return {
      ok: false,
      error: "insert_failed",
      validation_errors: ["agent insert returned no row"],
    };
  }

  await db.insert(agentVersions).values({
    agentId: created.id,
    version: 1,
    blueprint,
    publishNotes: "Initial version",
  });

  await emitSeldonEvent(
    "agent.created",
    { agentId: created.id, archetype: input.archetype, channel: input.channel },
    { orgId: input.orgId },
  );

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  const turnUrl = `https://${baseDomain}/api/v1/public/agent/${org.slug}--${slug}/turn`;
  const embedUrl = `https://${baseDomain}/api/v1/public/agent/${org.slug}--${slug}/embed.js`;

  return { ok: true, agent: created, embedUrl, turnUrl };
}

// ─── updateAgentBlueprint ──────────────────────────────────────────────────

export type UpdateAgentBlueprintInput = {
  agentId: string;
  orgId: string;
  /** Patch fields. Replaces (not merges) for arrays — operator
   *  passes the FULL set they want. */
  patch: Partial<AgentBlueprint>;
  publishNotes?: string;
};

export async function updateAgentBlueprint(
  input: UpdateAgentBlueprintInput,
): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  assertWritable();

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, input.agentId), eq(agents.orgId, input.orgId)))
    .limit(1);
  if (!agent) {
    return { ok: false, error: "agent_not_found" };
  }

  const next: AgentBlueprint = {
    ...((agent.blueprint ?? {}) as AgentBlueprint),
    ...input.patch,
  };
  const nextVersion = agent.currentVersion + 1;

  await db
    .update(agents)
    .set({
      blueprint: next,
      currentVersion: nextVersion,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, input.agentId));

  await db.insert(agentVersions).values({
    agentId: input.agentId,
    version: nextVersion,
    blueprint: next,
    publishNotes: input.publishNotes ?? null,
  });

  return { ok: true, version: nextVersion };
}

// ─── publishAgent ──────────────────────────────────────────────────────────

export type PublishAgentResult =
  | { ok: true; evalSummary?: Awaited<ReturnType<typeof runEvalSuite>> }
  | {
      ok: false;
      error: string;
      evalSummary?: Awaited<ReturnType<typeof runEvalSuite>>;
    };

export async function publishAgent(input: {
  agentId: string;
  orgId: string;
  /** Target status. v1.26.2 eval-gates draft|test → live (≥87.5% pass). */
  status: "draft" | "test" | "live" | "paused";
  /** Skip eval gate (logged). Use only for SF-controlled emergencies. */
  force?: boolean;
}): Promise<PublishAgentResult> {
  assertWritable();

  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, input.agentId), eq(agents.orgId, input.orgId)))
    .limit(1);
  if (!agent) {
    return { ok: false, error: "agent_not_found" };
  }

  // v1.26.2 — eval gate. Require ≥87.5% pass rate before flipping to 'live'.
  // Other transitions (draft, test, paused) are unrestricted.
  let evalSummary: Awaited<ReturnType<typeof runEvalSuite>> | undefined;
  if (input.status === "live" && !input.force) {
    evalSummary = await runEvalSuite({
      agentId: input.agentId,
      orgId: input.orgId,
    });
    if (!evalSummary.ok) {
      return {
        ok: false,
        error: `eval_run_failed: ${evalSummary.error}`,
      };
    }
    if (!evalSummary.summary.meetsPublishGate) {
      return {
        ok: false,
        error: "eval_gate_failed",
        evalSummary,
      };
    }
  }

  await db
    .update(agents)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(agents.id, input.agentId));

  await emitSeldonEvent(
    "agent.status_changed",
    { agentId: input.agentId, status: input.status },
    { orgId: input.orgId },
  );

  return { ok: true, evalSummary };
}

// ─── small util ────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
