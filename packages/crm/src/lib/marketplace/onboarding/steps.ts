// Marketplace buyer onboarding — the generic step ENGINE (pure; no DB, no I/O).
//
// A marketplace buyer purchases ONE agent and configures the non-technical
// parts (business info, hours, connect a calendar, point a phone). Rather than
// hardcode a wizard per agent, `buildOnboardingSteps(blueprint)` turns the
// agent's NEEDS — its surface (does it speak? does it post?) and the external
// tools it binds — into an ordered list of one-thing-per-screen steps. The
// 24/7 Receptionist is the reference agent.
//
// ── Why a NORMALIZED input (not the raw AgentBlueprint)
//
// The real `AgentBlueprint` (db/schema/agents.ts) has NO `surface` field — the
// channel is derived from the LISTING's `agentType` ('voice_receptionist' |
// 'chat_assistant') via surfaceForType — and its `connectors` are a
// `ConnectorBinding` discriminated union (composio carries `enabledToolkits[]`;
// vetted/byo carry a `serviceName`/`id`), not a flat `{ kind, toolkit }`. So the
// engine takes a small NORMALIZED shape, and `normalizeBlueprintForOnboarding`
// maps the real blueprint onto it. This keeps the engine trivially testable and
// the wiring (the buyer→deployment seam) responsible for the real-shape mapping.
//
// Nothing here throws: jsonb is untyped at the edge, so a malformed/empty
// blueprint degrades to a sensible default (business_info … go_live) rather than
// crashing the buyer's first-run.

import type { AgentTemplateType } from "@/lib/agent-templates/store";
import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";

// ─── types ───────────────────────────────────────────────────────────────────

export type OnboardingStepKind =
  | "business_info"
  | "brand_info"
  | "connect_tool"
  | "phone"
  | "cadence"
  | "preview"
  | "test"
  | "go_live";

export type OnboardingStep = {
  kind: OnboardingStepKind;
  /** Buyer-facing screen title ("About your business", "Connect googlecalendar"). */
  label: string;
  /** Whether go-live is gated on this step. The first step + go_live are always
   *  required; connectors and the test/preview step are skippable-but-nudged. */
  required: boolean;
  /** For `connect_tool`: the Composio toolkit slug this step connects. Drives the
   *  step's label/provider. Absent on every other kind. */
  toolkit?: string;
};

/** A single normalized connector input — one Composio toolkit the buyer connects. */
export type OnboardingConnector = { kind: string; toolkit?: string };

/** The engine input: a surface list + the bound connector toolkits. The buyer
 *  seam derives this from the listing's agentType + blueprint.connectors via
 *  `normalizeBlueprintForOnboarding`. */
export type OnboardingBlueprint = {
  /** voice | chat | sms | email | social. Drives the phone step (voice) + the
   *  test-vs-preview step kind (social → preview). */
  surface: string[];
  /** The external tools the agent binds. Each toolkit becomes one connect_tool
   *  step. */
  connectors?: OnboardingConnector[];
};

/** The normalizer's output — same as the engine input but with `connectors`
 *  guaranteed concrete (the normalizer always returns an array), so downstream
 *  reads needn't null-guard it. Assignable to `OnboardingBlueprint`. */
export type NormalizedOnboardingBlueprint = {
  surface: string[];
  connectors: OnboardingConnector[];
};

// ─── the engine ──────────────────────────────────────────────────────────────

const hasVoice = (surface: string[]): boolean =>
  Array.isArray(surface) && surface.includes("voice");
const hasSocial = (surface: string[]): boolean =>
  Array.isArray(surface) && surface.includes("social");

/**
 * Build the ordered onboarding step list for an agent blueprint. Pure.
 *
 * Order:
 *   1. brand_info (social) | business_info (everything else) — always required.
 *   2. one connect_tool per bound toolkit — skippable (booking fail-softs to
 *      native; a social poster can be previewed before connecting).
 *   3. phone — only for a voice surface; required (a voice agent with no number
 *      can't answer).
 *   4. cadence — only for a social surface; skippable.
 *   5. preview (social) | test (everything else) — the "hear it work" peak;
 *      skippable.
 *   6. go_live — always required + last.
 *
 * A malformed/empty blueprint (no surface) yields [business_info, test, go_live].
 */
export function buildOnboardingSteps(bp: OnboardingBlueprint): OnboardingStep[] {
  const surface = Array.isArray(bp?.surface) ? bp.surface : [];
  const connectors = Array.isArray(bp?.connectors) ? bp.connectors : [];
  const social = hasSocial(surface);

  const steps: OnboardingStep[] = [];

  // 1. The first "tell us about you" step — branded vs business.
  steps.push(
    social
      ? { kind: "brand_info", label: "About your brand", required: true }
      : { kind: "business_info", label: "About your business", required: true },
  );

  // 2. One connect step per bound toolkit (skippable).
  for (const c of connectors) {
    if (c?.toolkit) {
      steps.push({
        kind: "connect_tool",
        label: `Connect ${c.toolkit}`,
        required: false,
        toolkit: c.toolkit,
      });
    }
  }

  // 3. Phone — voice surfaces only (required: a voice agent needs a number).
  if (hasVoice(surface)) {
    steps.push({ kind: "phone", label: "Your phone", required: true });
  }

  // 4. Cadence — social surfaces only (skippable).
  if (social) {
    steps.push({ kind: "cadence", label: "Posting cadence", required: false });
  }

  // 5. The "hear it work" peak — preview a post (social) or test the agent.
  steps.push(
    social
      ? { kind: "preview", label: "Preview a post", required: false }
      : { kind: "test", label: "Hear it work", required: false },
  );

  // 6. Go live — always required + last.
  steps.push({ kind: "go_live", label: "Go live", required: true });

  return steps;
}

// ─── normalize: REAL blueprint → engine input ────────────────────────────────

/** Vetted connector ids that publish to social channels — their presence flips
 *  the agent's surface to `social` (so the wizard asks for brand info + a
 *  posting cadence instead of a phone). Today: Postiz. */
const SOCIAL_CONNECTOR_IDS = new Set(["postiz"]);

/**
 * Map the REAL agent blueprint + the listing's agentType onto the engine's
 * normalized `OnboardingBlueprint`. Pure; shape-tolerant (jsonb edge).
 *
 *   - surface: derived from agentType via surfaceForType ('voice' | 'chat'),
 *     then upgraded to also include 'social' when the blueprint binds a social
 *     connector (e.g. Postiz). A poster agent is social even on a chat type.
 *   - connectors: each `composio` binding's `enabledToolkits[]` expands to one
 *     `{ kind, toolkit }` row (the Studio binds toolkits, the buyer connects
 *     them one OAuth at a time). vetted/byo bindings don't carry a Composio
 *     toolkit, so they add no connect_tool step (their key is set in Studio).
 *
 * `blueprint` is typed loosely because it arrives off a jsonb column / listing.
 */
export function normalizeBlueprintForOnboarding(
  agentType: AgentTemplateType | string | null | undefined,
  blueprint: { connectors?: ConnectorBinding[] } | null | undefined,
): NormalizedOnboardingBlueprint {
  // agentType drives the base surface; default to voice (the reference agent)
  // for an unknown/missing type.
  const baseSurface: string = agentType === "chat_assistant" ? "chat" : "voice";
  const surface = new Set<string>([baseSurface]);

  const rawConnectors = Array.isArray(blueprint?.connectors)
    ? blueprint.connectors
    : [];

  const connectors: { kind: string; toolkit?: string }[] = [];
  for (const binding of rawConnectors) {
    if (!binding || typeof binding !== "object") continue;

    // A social publisher (Postiz) makes the whole agent a social poster.
    if (SOCIAL_CONNECTOR_IDS.has((binding as { id?: string }).id ?? "")) {
      surface.add("social");
    }

    if (binding.kind === "composio") {
      const toolkits = Array.isArray(binding.enabledToolkits)
        ? binding.enabledToolkits
        : [];
      for (const toolkit of toolkits) {
        if (typeof toolkit === "string" && toolkit.trim()) {
          connectors.push({ kind: "composio", toolkit: toolkit.trim() });
        }
      }
    }
  }

  return { surface: [...surface], connectors };
}
