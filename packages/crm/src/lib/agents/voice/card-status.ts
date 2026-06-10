// Stage C1 — pure status derivation for the /automations Voice Receptionist
// card. Kept pure (no DB) so the catalog card's badge logic is unit-tested.
//
// The voice receptionist is an `agents` row (channel:'voice',
// archetype:'voice-receptionist'), NOT a settings.agentConfigs automation, so
// it has its own status vocabulary distinct from resolveCatalogStatus:
//   - "not_configured" — no voice agent row exists yet (never opened the editor)
//   - "no_number"       — agent exists but no Twilio fromNumber is assigned, so
//                          calls can't route to it (live/paused is moot)
//   - "live"            — agent.status === 'live' AND a number is assigned
//   - "paused"          — agent.status === 'paused'
//   - "draft"           — agent exists, number assigned, not yet live/paused
//
// A number is required before "live" is meaningful: without it, no call reaches
// this workspace's agent. Surfacing "no_number" tells the operator the one
// missing step.

import { toE164 } from "@/lib/sms/providers";

// The OpenAI Realtime TTS voices the editor offers. Lives here (a plain module),
// NOT in actions.ts — a "use server" file may only export async functions, so a
// const array there fails the next build (check-use-server.sh). Both the server
// action's zod enum and the editor's <select> import it from here.
// cedar/marin are the newest gpt-realtime voices; if OpenAI rejects cedar for this model, "sage" is the safe fallback.
export const VOICE_OPTIONS = [
  "alloy",
  "echo",
  "shimmer",
  "ash",
  "ballad",
  "cedar",
  "coral",
  "marin",
  "sage",
  "verse",
] as const;

export type VoiceOption = (typeof VOICE_OPTIONS)[number];

export type VoiceCardStatus =
  | "not_configured"
  | "no_number"
  | "draft"
  | "live"
  | "paused";

/**
 * Normalize loose operator phone input to the E.164 form the dialed-number
 * resolver compares against (it runs toE164 on both the inbound number and the
 * stored fromNumber). Pure — used by assignVoiceNumberAction. An empty/blank
 * input is a deliberate "clear the number" and returns `{ ok:true, value:"" }`;
 * anything that doesn't normalize to a valid E.164 (+ and 8–15 digits) is
 * rejected so a typo can't silently un-route the workspace.
 */
export function normalizeVoiceNumber(
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: "" };
  const normalized = toE164(trimmed);
  if (!/^\+\d{8,15}$/.test(normalized)) {
    return { ok: false, error: "not a valid phone number" };
  }
  return { ok: true, value: normalized };
}

export function resolveVoiceCardStatus(input: {
  /** The voice agent's status, or null when no voice agent row exists. */
  agentStatus: string | null | undefined;
  /** Whether organizations.integrations.twilio.fromNumber is set. */
  hasNumber: boolean;
}): VoiceCardStatus {
  // No agent row at all → never configured.
  if (!input.agentStatus) return "not_configured";

  // Paused is an explicit operator choice — surface it regardless of number
  // (the operator turned it off on purpose; nudging about the number would be
  // noise here).
  if (input.agentStatus === "paused") return "paused";

  // Live requires a routable number. An agent flagged live with no number
  // can't actually take a call, so we down-rank it to "no_number" to point
  // the operator at the missing piece.
  if (!input.hasNumber) return "no_number";

  if (input.agentStatus === "live") return "live";

  // draft / test / anything else with a number assigned.
  return "draft";
}
