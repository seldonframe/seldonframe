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
  })
  .strict();

export type TemplateBlueprintPatchInput = z.infer<typeof TemplateBlueprintPatchSchema>;
