// voice R1 — the operator-editable voice blueprint patch schema.
//
// This lives in its own plain module (NOT "use server") so it can be imported
// by both actions.ts (which validates the editor's save) AND the unit tests. A
// "use server" file may only export async functions, so this const cannot live
// in actions.ts (next build + scripts/check-use-server.sh both reject it).
//
// The schema is .strict(): it is the allow-list of fields an operator may edit
// from /automations/voice-receptionist. Any key not declared here is rejected,
// which is why each new editable field must be added explicitly.

import { z } from "zod";
import { VOICE_OPTIONS } from "@/lib/agents/voice/card-status";

const FaqRow = z.object({
  q: z.string().min(1),
  a: z.string().min(1),
  // v1.45 (faq-from-url) provenance fields — optional, preserved on round-trip.
  source: z.enum(["extracted", "synthesized", "operator"]).optional(),
  sourceUrl: z.string().url().optional(),
  synthesizedAt: z.string().optional(),
  synthesizedFromSoulVersion: z.number().optional(),
});

// voice R1 — a per-service price band for the get_quote_range quote guard.
// low/high are whole-currency amounts (e.g. dollars). high must be ≥ low.
const QuoteRangeRow = z
  .object({
    service: z.string().min(1).max(120),
    low: z.number().nonnegative(),
    high: z.number().nonnegative(),
    note: z.string().max(200).optional(),
  })
  .refine((r) => r.high >= r.low, { message: "high must be ≥ low" });

export const VoiceBlueprintPatchSchema = z
  .object({
    greeting: z.string().max(2000).optional(),
    voice: z.enum(VOICE_OPTIONS).optional(),
    capabilities: z.array(z.string()).optional(),
    faq: z.array(FaqRow).optional(),
    // voice R1 — the agent's core persona script (blueprint.customSkillMd). The
    // live call reads this directly, so saving it here takes effect on the next
    // call. Capped to keep the prompt + a single edit within sane bounds.
    customSkillMd: z.string().max(8000).optional(),
    // voice R1 — operator-editable quote ranges + team callback number.
    quoteRanges: z.array(QuoteRangeRow).optional(),
    notifyPhone: z.string().trim().max(40).optional(),
    // voice R1 — missed-call text-back toggle + copy. Default ON (the page
    // seeds enabled:true). message supports {business}/{link} placeholders; a
    // blank message falls back to the default copy at send time.
    missedCallTextBack: z
      .object({
        enabled: z.boolean().optional(),
        message: z.string().max(480).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
