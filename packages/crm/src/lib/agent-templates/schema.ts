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
    defaultBookingPolicy: z
      .object({
        durationMinutes: z.number().int().positive().optional(),
        bufferMinutes: z.number().int().min(0).optional(),
        maxPerDay: z.number().int().positive().nullable().optional(),
        leadTimeHours: z.number().min(0).optional(),
        timezone: z.string().min(1).optional(),
        weekdays: z.array(z.number().int().min(0).max(6)).optional(),
        startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
        endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
        requiredFields: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type TemplateBlueprintPatchInput = z.infer<typeof TemplateBlueprintPatchSchema>;
