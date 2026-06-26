// Primitive-Composition Agent Generator — P1, Task 4: the thin-harness composer.
//
// This is the deterministic HEART of the authored-agent path. The LLM author
// already WROTE the playbook and DECLARED the primitives (trigger / channel /
// tools) into a validated {@link AuthoredAgent} (authored-agent.ts). This composer
// wires SF's safety floor around that draft and emits a ready-to-persist
// {@link AgentBundle} — the SAME bundle type the heuristic assembler produces, so
// an authored agent and a template agent persist + gate identically.
//
// "Thin harness" = the LLM is trusted ONLY to write prose + pick primitives;
// everything that protects the operator is supplied deterministically here:
//   • the ground rules         — SF_GROUND_RULES is ALWAYS appended to the skill,
//                                so the never-invent-facts floor never depends on
//                                the LLM having authored it;
//   • the verify rubric        — defaultRubricForShape (shape-keyed, channel-aware,
//                                review-URL-aware) supplies the maker≠checker gate;
//   • the guardrails           — defaultGuardrailsForShape supplies the brakes
//                                (quiet hours / caps for a messaging shape; a
//                                budget brake only for an action-only / inbound one);
//   • the trigger              — resolveAgentTrigger re-clamps defensively;
//   • the connectors           — bindToolIds maps the authored tool ids onto real
//                                ConnectorBindings (same shapes as a hand bind).
//
// It is intentionally PURE:
//   • no I/O, no clock, no env, no "use server";
//   • it never mutates `authored` / `ctx`;
//   • it NEVER throws — every input is already normalized, and each wired default
//     is itself total. Safe from a Server Component, action, route handler,
//     runtime, or test.

import type { AgentBlueprint } from "@/db/schema/agents";
import type { AuthoredAgent } from "@/lib/agents/generate/authored-agent";
import type { AgentBundle } from "@/lib/agents/generate/agent-bundle";
import { bindToolIds } from "@/lib/agents/generate/bind-tools";
import {
  SF_GROUND_RULES,
  defaultGuardrailsForShape,
  defaultRubricForShape,
} from "@/lib/agents/generate/shape-defaults";
import { resolveAgentTrigger } from "@/lib/agents/triggers/agent-trigger";

// ─── tunables ─────────────────────────────────────────────────────────────────

/** A skill shorter than this is almost certainly a stub — flag it for review
 *  before publish (the normalizer already rejects an EMPTY skill, so this catches
 *  the "one terse line" case, not the missing-playbook case). */
const SHORT_SKILL_CHARS = 40;

// ─── helpers (pure) ────────────────────────────────────────────────────────────

/** Append SF's canonical ground rules to the authored skill. ALWAYS appended —
 *  safety never depends on the LLM having written it. Trims the author's prose so
 *  there's exactly one blank line before the rules block. */
function withGroundRules(skillMd: string): string {
  return `${skillMd.trim()}\n\n${SF_GROUND_RULES}`;
}

/** A readable description fallback when the author supplied no summary. Mirrors
 *  agent-bundle's "A generated X agent." voice so authored + heuristic agents read
 *  consistently. Never empty (name is itself never empty post-normalization). */
function describeFallback(name: string): string {
  return `A generated ${name} agent.`;
}

// ─── the composer ───────────────────────────────────────────────────────────────

/**
 * Compose a complete, safe {@link AgentBundle} from a normalized
 * {@link AuthoredAgent}. Pure; never throws; never mutates `authored` / `ctx`.
 *
 * The wiring (the thin harness):
 *   1. trigger     — resolveAgentTrigger(authored.trigger). It's already valid;
 *                    we re-resolve defensively so the blueprint trigger is never
 *                    a malformed hand-edit.
 *   2. skill       — authored.skillMd.trim() + SF_GROUND_RULES, ALWAYS (the
 *                    safety floor doesn't depend on the LLM authoring it).
 *   3. guardrails  — defaultGuardrailsForShape({ kind, channel }) — a messaging
 *                    shape gets quiet hours + caps; an action-only ("none") /
 *                    inbound shape gets a budget brake only.
 *   4. verify      — defaultRubricForShape({ kind, channel }, { reviewUrl }) —
 *                    channel-aware length cap + the no-placeholder guard + the
 *                    review-link check WHEN a URL is known.
 *   5. connectors  — bindToolIds(authored.tools); assigned ONLY when non-empty
 *                    (matching agent-bundle: a no-tool agent leaves it undefined).
 *   6. actionOnly  — true ⇔ channel "none" (a poster/logger sends no message), so
 *                    the runtime can route it past the message gate.
 *   7. reviewUrl   — set on the blueprint only when known (ctx wins over the hint).
 *
 * `reviewUrl` precedence: `ctx.reviewUrl` overrides `authored.knowledgeHints
 * .reviewUrl` (an explicit deploy-time context beats a draft-time hint).
 */
export function composeBundleFromAuthored(
  authored: AuthoredAgent,
  ctx?: { reviewUrl?: string },
): AgentBundle {
  // 1. trigger — already valid; re-resolve defensively (never trust a stored shape).
  const trigger = resolveAgentTrigger(authored.trigger);

  // The shape the safety defaults key off: trigger kind × outbound channel.
  const shape = { kind: trigger.kind, channel: authored.channel };

  // reviewUrl — ctx (deploy-time) wins over the author's draft-time hint.
  const reviewUrl = ctx?.reviewUrl ?? authored.knowledgeHints?.reviewUrl;

  const blueprint: AgentBlueprint = {
    trigger,
    // 2. ALWAYS append the ground rules — the thin-harness safety floor.
    customSkillMd: withGroundRules(authored.skillMd),
    // 3. shape-keyed guardrails (brakes).
    guardrails: defaultGuardrailsForShape(shape),
    // 4. shape-keyed verify rubric (maker≠checker gate), review-URL-aware.
    verify: defaultRubricForShape(shape, { reviewUrl }),
    // 6. action-only ⇔ no outbound customer message (a poster / logger).
    actionOnly: authored.channel === "none",
  };

  // 5. connectors — bind the authored tool ids; assign ONLY when non-empty so a
  //    no-tool agent leaves blueprint.connectors undefined (matches agent-bundle).
  const connectors = bindToolIds(authored.tools);
  if (connectors.length > 0) {
    blueprint.connectors = connectors;
  }

  // 7. reviewUrl on the blueprint only when actually known.
  if (reviewUrl) {
    blueprint.reviewUrl = reviewUrl;
  }

  // name / description: the author's, with a humanized description fallback.
  const name = authored.name;
  const description = authored.summary || describeFallback(name);

  // warnings — operator-facing "before you publish" notes. A very short skill is
  // almost certainly a stub; flag it. (Tool-not-connected warnings need the live
  // workspace authorization check, so they belong to the action layer, not here.)
  const warnings: string[] = [];
  if (authored.skillMd.trim().length < SHORT_SKILL_CHARS) {
    warnings.push("Review this generated agent before publishing.");
  }

  return { name, description, blueprint, warnings };
}
