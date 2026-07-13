// packages/crm/src/lib/landing/r1-customize-prompt.ts
//
// Prompt builder for the natural-language landing-page editor.
// Takes the CURRENT R1 payload + archetype + operator instruction and returns
// Anthropic message params that produce a NEW payload + a one-sentence summary.
//
// Output contract:
//   { "summary": string, "payload": { ...R1LandingPayload... } }
//
// The caller (r1-customize.ts) parses this JSON and validates the inner
// payload against the same type guard used by r1-payload-generator.ts.

import type { AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import { getArchetype } from "@/lib/workspace/aesthetic-archetypes";
import type { R1LandingPayload } from "./r1-payload-prompt";

const SYSTEM_PROMPT = `You are a precise landing-page editor. You receive the CURRENT landing payload (JSON) for a local-service business plus an operator instruction. Your job is to emit the NEW payload reflecting that instruction.

ABSOLUTE RULES:
1. Output EXACTLY ONE JSON object: { "summary": string, "payload": {...the new payload...} }. Nothing else.
2. No markdown code fences. No triple-backticks. Raw JSON only.
3. Preserve every existing field the instruction doesn't touch. Don't drop sections, don't drop trust badges, don't delete testimonials unless explicitly told to.
4. NEVER violate the archetype's voice profile (lean-into / avoid lists enforced below). All edits must stay in voice.
5. NEVER invent business facts (license numbers, phone numbers, addresses) — only the operator's instruction or the existing payload supplies them.
6. If the instruction includes an image URL (http:// or https://), use it verbatim in the matching image field (e.g. heroImage.src). Do not alter the URL.
6b. If the operator asks to change, improve, or replace a photo/background image but provides NO image URL, DO NOT invent, guess, or fabricate a URL, and DO NOT swap in a random stock URL. Leave the image field exactly as it is and use the "summary" to say a specific image URL (or upload) is needed to change it — e.g. "Kept the current hero background — paste an image URL and I'll swap it in."
7. If the instruction is ambiguous, make a conservative choice that preserves the existing payload as much as possible.
8. The "summary" field is a 1-sentence, past-tense description of what you changed (e.g. "Replaced the hero photo and shortened the subhead.").
9. The JSON must be valid — no trailing commas, no comments, proper string escaping.
10. If you cannot apply the instruction without violating these rules, apply the closest safe version and note it in the summary.

PRESERVATION RULES:
- The current payload may contain photos extracted from the operator's
  actual website. NEVER replace heroImage.src or service tile images
  with a generic Unsplash URL unless the operator explicitly asks
  ("change the photo to a stock plumber image", "use a different
  picture", etc.).
- FAQ answers extracted from the real site (heuristic: longer than
  60 chars, mentions specific business facts) should be left alone
  unless the operator targets them by question. Synthesized FAQ
  answers can be freely rewritten.`;

/**
 * Builds Anthropic message params (system + user message) for the customize
 * step. The caller passes these directly to messages.create.
 */
export function buildR1CustomizeMessages(
  currentPayload: R1LandingPayload,
  archetypeId: AestheticArchetypeId,
  instruction: string,
): { system: string; userMessage: string } {
  const archetype = getArchetype(archetypeId);

  const archetypeBlock = [
    `Archetype: ${archetype.id}`,
    `Label: ${archetype.label}`,
    `Fits: ${archetype.fits}`,
    `Voice tone: ${archetype.voice.tone}`,
    `Voice pace: ${archetype.voice.pace}`,
    `Lean into: ${archetype.voice.leanInto.join(", ")}`,
    `AVOID: ${archetype.voice.avoid.join(", ")}`,
  ].join("\n");

  const userMessage =
    `ARCHETYPE VOICE PROFILE (do not violate):\n${archetypeBlock}\n\n` +
    `CURRENT PAYLOAD:\n${JSON.stringify(currentPayload, null, 2)}\n\n` +
    `OPERATOR INSTRUCTION:\n${instruction.trim()}\n\n` +
    `Apply the instruction and return: { "summary": "...", "payload": { ...updated payload... } }`;

  return { system: SYSTEM_PROMPT, userMessage };
}
