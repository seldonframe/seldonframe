// Magic first-run (Task 2) — the Studio agent BUILD/TEST gate.
//
// Pure decision helper (no DB / env / network) so it's unit-testable and
// shared by both server actions that do the unbounded-COGS Studio work:
//   - generateAgentDraftAction (lib/agent-templates/actions.ts) — LLM draft
//   - testAgentTemplateTurn   (lib/agent-templates/test-actions.ts) — sandbox turn
//
// THE RULE: building/testing a reusable agent in the Studio is the
// unbounded-COGS moment, so it requires the operator's OWN key — i.e. the
// resolved AIClientMode must be "byok". The platform-key modes ("included"
// = within the free allowance, "metered" = past it) are deliberately
// REJECTED here even though getAIClient still returns a usable platform
// client for them. That platform client is reserved for the first-workspace
// magic (URL→workspace extraction + soul + the auto-created website
// chatbot's included allowance), NOT for arbitrary Studio agent building.
//
// We gate on `mode === "byok"` (NOT `client !== null`) precisely so that an
// operator who skipped BYOK at signup — and is therefore on the platform
// key — gets the friendly "add your key" prompt at the Studio instead of
// silently burning platform tokens building agents to resell.

import type { AIClientMode } from "@/lib/ai/client";

export type StudioBuildGateDecision =
  | { ok: true }
  | { ok: false; error: "needs_byok" };

/**
 * Decide whether the unbounded-COGS Studio build/test work may proceed for
 * a given resolved AIClientMode. Only "byok" passes; "included"/"metered"
 * (the platform-key allowance that powers the free first workspace) return
 * needs_byok so the caller can surface a friendly "Add your key →" prompt.
 */
export function resolveStudioBuildGate(mode: AIClientMode): StudioBuildGateDecision {
  return mode === "byok" ? { ok: true } : { ok: false, error: "needs_byok" };
}

/**
 * Shared friendly copy for the needs_byok case. Kept here so the action
 * messages and any UI fallback stay in sync. The first workspace + its
 * embedded chatbot remain free — only Studio agent building needs the key.
 */
export const NEEDS_BYOK_MESSAGE =
  "Add your Anthropic key in Settings to build + test agents — your first workspace stays free.";
