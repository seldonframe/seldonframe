// ICP-3 — the agent-template editor's patch allow-list (a plain module).
//
// Lives OUTSIDE actions.ts (NOT "use server") so it can be imported by both
// actions.ts (which validates the editor's save) AND any test. A "use server"
// file may export only async functions, so this const cannot live in actions.ts
// (next build + scripts/check-use-server.sh both reject it) — same split the
// voice-receptionist editor uses (automations/voice-receptionist/schema.ts).
//
// .strict(): the allow-list of blueprint fields a builder may edit on a template
// from the Agents Studio editor (greeting / persona script / FAQ / voice /
// tools). Any undeclared key is rejected. Mirrors the voice editor's
// VoiceBlueprintPatchSchema surface, minus the per-workspace-only fields (number
// assignment, missed-call text-back, notifyPhone) which are deployment concerns,
// not template concerns.

import { z } from "zod";
import { VOICE_OPTIONS } from "@/lib/agents/voice/card-status";
import { connectorBindingsSchema } from "@/lib/agents/mcp/connectors";

const FaqRow = z.object({
  q: z.string().min(1),
  a: z.string().min(1),
  // Preserve provenance fields on round-trip (v1.45 faq-from-url), all optional.
  source: z.enum(["extracted", "synthesized", "operator"]).optional(),
  sourceUrl: z.string().url().optional(),
  synthesizedAt: z.string().optional(),
  synthesizedFromSoulVersion: z.number().optional(),
});

export const TemplateBlueprintPatchSchema = z
  .object({
    greeting: z.string().max(2000).optional(),
    // The agent's core persona script (blueprint.customSkillMd). Capped to keep
    // the prompt budget sane — same 8k cap as the agent editors.
    customSkillMd: z.string().max(8000).optional(),
    voice: z.enum(VOICE_OPTIONS).optional(),
    capabilities: z.array(z.string()).optional(),
    // Never-fail-compile: honest autonomy math from the recording's coverage.
    // Mirrors AgentBlueprint.autonomy (db/schema/agents.ts).
    autonomy: z
      .object({
        green: z.number().int().min(0),
        yellow: z.number().int().min(0),
        red: z.number().int().min(0),
        total: z.number().int().min(0),
        autonomousPct: z.number().int().min(0).max(100),
      })
      .optional(),
    faq: z.array(FaqRow).optional(),
    // The operator-configured price ranges for the get_quote_range tool (voice
    // R1 quote guard). A service with no entry returns { hasRange:false } and
    // the agent says a tech will confirm on-site. Mirrors AgentBlueprint.quoteRanges.
    quoteRanges: z
      .array(
        z.object({
          service: z.string().min(1),
          low: z.number(),
          high: z.number(),
          note: z.string().optional(),
        }),
      )
      .optional(),
    // MCP connector bindings (#3 — Studio "Connectors & Tools" picker). Reuses
    // #2's vetted+BYO discriminated-union schema verbatim (HTTPS-only for BYO,
    // length-bounded) so the template editor's connector save is validated by the
    // exact same rules the agent-scoped path uses. Stored on blueprint.connectors
    // (jsonb — no migration); the runtime seam (getToolsForCapabilities) reads it.
    connectors: connectorBindingsSchema.optional(),
    // The template's RECOMMENDED booking rules (per-client booking policy). Sparse
    // — every field optional; resolveBookingPolicy clamps anything malformed, so
    // this is a loose allow-list (shape + obvious bounds), not the final guard.
    // Mirrors AgentBlueprint.defaultBookingPolicy (Partial<BookingPolicy>).
    // Accepts BOTH the new per-day `hours` map AND the legacy uniform-window
    // fields (resolveBookingPolicy normalizes either to `hours`).
    defaultBookingPolicy: z
      .object({
        durationMinutes: z.number().int().positive().optional(),
        bufferMinutes: z.number().int().min(0).optional(),
        maxPerDay: z.number().int().positive().nullable().optional(),
        leadTimeHours: z.number().min(0).optional(),
        timezone: z.string().min(1).optional(),
        hours: z
          .record(
            z.string().regex(/^[0-6]$/),
            z
              .object({
                start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
                end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
              })
              .strict(),
          )
          .optional(),
        weekdays: z.array(z.number().int().min(0).max(6)).optional(),
        startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
        endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
        requiredFields: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    // What FIRES this agent (unified agent model P1). The three-arm Trigger
    // shape: inbound (a call/chat/email/SMS arrives), event (a domain event
    // fires → outbound), or schedule (a cron cadence fires). LOOSE on purpose —
    // we accept the shape and let resolveAgentTrigger clamp anything malformed
    // (wrong channel-for-kind, blank event/cron) to the inbound default at
    // runtime. Mirrors AgentBlueprint.trigger (jsonb — no migration).
    trigger: z
      .object({
        kind: z.enum(["inbound", "event", "schedule"]),
        channel: z.string().min(1),
        event: z.string().optional(),
        cron: z.string().optional(),
        // F2 (send delay) — event triggers only. The outbound send is deferred by
        // this many minutes (0/absent → immediate). LOOSE on purpose: a finite
        // number; resolveAgentTrigger clamps it (negative/NaN → omitted = 0, > 7d →
        // 7d) when normalizing, so this is just a shape gate. Mirrors
        // AgentTrigger.event.delayMinutes.
        delayMinutes: z.number().optional(),
      })
      .strict()
      .optional(),
    // The maker≠checker VERIFY RUBRIC (agent loop L2). An ordered list of
    // deterministic checks that gate the agent's outbound output before send.
    // LOOSE on purpose — each check is just `{ kind, ... }` (passthrough), so the
    // editor can carry any of the runtime kinds (max_length / must_include /
    // must_not_include / …) without this allow-list enumerating them; the runtime
    // verifyOutput tolerates/clamps unknown shapes (an unknown kind fails THAT
    // check, never the gate). Mirrors AgentBlueprint.verify (jsonb — no migration).
    // `.nullable()`: the Studio editor sends `null` to CLEAR an override (flip
    // "Use smart defaults" back ON), which mergeTemplateBlueprint deletes from the
    // blueprint so defaultRubricForSkill applies fresh at runtime.
    verify: z
      .object({
        checks: z
          .array(z.object({ kind: z.string() }).passthrough())
          .optional(),
      })
      .nullable()
      .optional(),
    // The per-agent GUARDRAILS / brakes (agent loop L3). The kill switch + quiet
    // hours + frequency cap + daily budget that gate the agent's outbound sends.
    // LOOSE on purpose — every field optional, and the runtime evaluateGuardrails
    // is fully defensive (a bad tz fails the quiet-hours check open, an
    // unparseable last-sent skips the frequency check), so this is a shape +
    // obvious-bounds allow-list, not the final guard. Mirrors
    // AgentBlueprint.guardrails (jsonb — no migration).
    // `.nullable()`: the Studio editor sends `null` to CLEAR an override (flip
    // "Use smart defaults" back ON), which mergeTemplateBlueprint deletes from the
    // blueprint so defaultGuardrailsForSkill applies fresh at runtime.
    guardrails: z
      .object({
        enabled: z.boolean().optional(),
        maxPerDayPerAgent: z.number().int().positive().optional(),
        minMinutesBetweenPerContact: z.number().int().min(0).optional(),
        quietHours: z
          .object({
            startHour: z.number().int().min(0).max(23),
            endHour: z.number().int().min(0).max(24),
            tz: z.string().min(1),
          })
          .strict()
          .optional(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

export type TemplateBlueprintPatchInput = z.infer<typeof TemplateBlueprintPatchSchema>;
