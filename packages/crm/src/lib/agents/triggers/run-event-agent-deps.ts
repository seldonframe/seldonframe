// Unified Agent Model — P1, Task T4: PRODUCTION deps for runEventAgent.
//
// runEventAgent (./run-event-agent.ts) is the pure-ish DI'd orchestrator. THIS
// file supplies the real, DB/Twilio/Resend-backed `RunEventAgentDeps` and is the
// only place that touches Postgres + the outbound send seam. Keeping it separate
// keeps the orchestrator unit-testable with zero infrastructure.
//
// It is a plain lib module (NOT "use server") imported by lib/events/listeners.ts,
// which is itself only loaded server-side — so static imports of `db` + the send
// APIs are fine (same convention as lib/messaging/dispatch.ts).
//
// What the deps do:
//   • findEventAgents — query agent_templates for the org, resolve each
//     blueprint.trigger via resolveAgentTrigger, keep the {kind:"event",
//     event:<this type>} matches, and map to EventAgentMatch (businessName from
//     the org soul, reviewUrl from the blueprint).
//   • loadContact — the contact's name/phone/email (same query dispatch.ts uses).
//   • hasAlreadyRequested — the review one-per-contact throttle: probe both the
//     smsMessages and emails tables for a prior outbound row tagged
//     metadata.source = "agent:<skill>" for this contact.
//   • markRequested — a NO-OP. The send itself writes the dedup tag (see below),
//     exactly like the missed-call text-back: the tag IS the mark.
//   • sendSms / sendEmail — the EXISTING outbound seam (sendSmsFromApi /
//     sendEmailFromApi), tagging metadata.source = "agent:<skill>" so the
//     throttle probe can find the row next time. userId:null = system-initiated.
//   • memoryStore — the agent's loop-memory (State), Brain v2-backed via
//     makeBrainMemoryStoreForOrg(orgId). runEventAgent recalls it before composing
//     (the review throttle's primary gate is now hasDone(entries,"review_requested"))
//     and records an entry after a successful send. Built per-event with the
//     event's orgId; absent → the orchestrator falls back to the legacy throttle.
//
// 2026-06-26 — L2 Verify (T3): the production deps deliberately wire NO `checker`.
// The deterministic verify gate (review link / contact name / length / no leftover
// placeholder) is always on inside runEventAgent regardless; the optional LLM/evals
// checker is T4 and stays opt-in, so prod sends are gated deterministically only.
// The per-agent rubric is projected from `blueprint.verify` onto each match below.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agentTemplates } from "@/db/schema/agent-templates";
import { contacts } from "@/db/schema/contacts";
import { emails } from "@/db/schema/emails";
import { organizations } from "@/db/schema/organizations";
import { smsMessages } from "@/db/schema/sms-messages";
import { sendEmailFromApi } from "@/lib/emails/api";
import { sendSmsFromApi } from "@/lib/sms/api";
import { resolveAgentTrigger } from "@/lib/agents/triggers/agent-trigger";
import { makeBrainMemoryStoreForOrg } from "@/lib/agents/memory/brain-memory-store";
import type {
  EventAgentMatch,
  EventAgentSkill,
  RunEventAgentDeps,
} from "@/lib/agents/triggers/run-event-agent";

/** Map a fired event-type slug to the skill an agent runs for it. Anything we
 *  don't have an outbound skill for yet → null (the agent is ignored). */
function skillForEvent(eventType: string): EventAgentSkill | null {
  switch (eventType) {
    case "booking.completed":
      return "review-requester";
    case "lead.created":
      return "speed-to-lead";
    default:
      return null;
  }
}

/** The metadata.source tag a send writes (and the throttle probes). Per-skill so
 *  a review ask and a speed-to-lead ack are throttled independently. */
function sourceTag(skill: EventAgentSkill): string {
  return `agent:${skill}`;
}

/**
 * Build the production deps. `findEventAgents` resolves the org's businessName
 * once (from the soul) and reuses it for every matched agent.
 *
 * `orgId` is optional ONLY for back-compat with callers that don't have it yet;
 * the listener builds these deps fresh PER EVENT with the event's orgId in scope
 * (see lib/events/listeners.ts), so the loop-memory store is constructed per-org,
 * per-event. When `orgId` is given we wire:
 *   • `memoryStore` = the Brain v2-backed `makeBrainMemoryStoreForOrg(orgId)` —
 *     the agent recalls/records its loop-memory in this org's workspace Brain;
 *   • `now` = the real clock, so recorded entries carry an ISO `at` stamp.
 * Without `orgId`, `memoryStore`/`now` are omitted and runEventAgent behaves
 * exactly as before (no recall, no record — the legacy metadata.source throttle
 * is the only gate). The store's baked orgId always matches `event.orgId` because
 * both come from the same per-event construction.
 */
export function buildRunEventAgentDeps(orgId?: string): RunEventAgentDeps {
  const memoryStore = orgId ? makeBrainMemoryStoreForOrg(orgId) : undefined;
  return {
    memoryStore,
    now: () => new Date(),
    findEventAgents: async (orgId, eventType) => {
      const skill = skillForEvent(eventType);
      // We only run agents for events we have an outbound skill for.
      if (!skill) return [];

      // Resolve the workspace business name (for the persona sign-off) once.
      const [org] = await db
        .select({ soul: organizations.soul, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      const businessName =
        (org?.soul && typeof org.soul === "object"
          ? (org.soul as { businessName?: string }).businessName
          : null) ||
        org?.name ||
        null;

      // Load this org's agent templates and keep the ones whose resolved
      // trigger is an event-trigger for THIS event type.
      const rows = await db
        .select({
          surface: agentTemplates.type,
          blueprint: agentTemplates.blueprint,
        })
        .from(agentTemplates)
        .where(eq(agentTemplates.builderOrgId, orgId));

      const matches: EventAgentMatch[] = [];
      for (const row of rows) {
        const blueprint = (row.blueprint ?? {}) as {
          trigger?: unknown;
          reviewUrl?: string;
          verify?: import("@/lib/agents/verify/agent-verify").VerifyRubric;
        };
        const trigger = resolveAgentTrigger(
          blueprint.trigger as Parameters<typeof resolveAgentTrigger>[0],
          row.surface,
        );
        if (trigger.kind !== "event" || trigger.event !== eventType) continue;

        matches.push({
          skill,
          channel: trigger.channel, // "sms" | "email" (validated by the resolver)
          businessName,
          // review-requester reads this; speed-to-lead ignores it.
          reviewUrl: typeof blueprint.reviewUrl === "string" ? blueprint.reviewUrl : null,
          // 2026-06-26 — L2 Verify (T3): project the agent's own VERIFY rubric onto
          // the match so the orchestrator can gate the composed body with it
          // (overriding the per-skill default). A loose object (jsonb) — verifyOutput
          // tolerates loose shapes; null/absent → the orchestrator uses the default.
          verify:
            blueprint.verify && typeof blueprint.verify === "object"
              ? blueprint.verify
              : null,
        });
      }
      return matches;
    },

    loadContact: async (orgId, contactId) => {
      const [row] = await db
        .select({
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
        })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
        .limit(1);
      if (!row) return null;
      const name = [row.firstName, row.lastName]
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter(Boolean)
        .join(" ");
      return {
        name: name || null,
        phone: row.phone ?? null,
        email: row.email ?? null,
      };
    },

    hasAlreadyRequested: async (orgId, contactId, skill) => {
      const tag = sourceTag(skill);
      // Probe BOTH channels — a contact asked for a review by SMS shouldn't then
      // be asked again by email. metadata.source is set by the sends below.
      const [smsHit] = await db
        .select({ id: smsMessages.id })
        .from(smsMessages)
        .where(
          and(
            eq(smsMessages.orgId, orgId),
            eq(smsMessages.contactId, contactId),
            sql`${smsMessages.metadata}->>'source' = ${tag}`,
          ),
        )
        .limit(1);
      if (smsHit) return true;

      const [emailHit] = await db
        .select({ id: emails.id })
        .from(emails)
        .where(
          and(
            eq(emails.orgId, orgId),
            eq(emails.contactId, contactId),
            sql`${emails.metadata}->>'source' = ${tag}`,
          ),
        )
        .limit(1);
      return Boolean(emailHit);
    },

    // The send writes the dedup tag (metadata.source), so there's nothing extra
    // to persist here — the tag IS the mark (same as the missed-call text-back).
    markRequested: async () => {
      return;
    },

    sendSms: async ({ orgId, contactId, toNumber, body, skill }) => {
      await sendSmsFromApi({
        orgId,
        userId: null,
        contactId,
        toNumber,
        body,
        metadata: { source: sourceTag(skill) },
      });
    },

    sendEmail: async ({ orgId, contactId, toEmail, subject, body, skill }) => {
      await sendEmailFromApi({
        orgId,
        userId: null,
        contactId,
        toEmail,
        subject: subject || "A quick note",
        body,
        metadata: { source: sourceTag(skill) },
      });
    },
  };
}
