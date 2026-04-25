// Static allowlist of Soul/theme paths that write_state may modify.
//
// Shipped in SLICE 3 PR 1 C2 per audit G-3-3 Option B-2.
//
// Design choices:
//   - EMPTY v1 allowlist. No archetype today writes to Soul, and
//     scaffold output doesn't produce write_state steps yet.
//     Intentional ship-blank: every future addition requires an
//     explicit PR + review. No silent expansion.
//   - Path format matches the Zod schema exactly: `workspace.soul.*`
//     or `workspace.theme.*`. The allowlist stores the FULL path
//     including the `workspace.` prefix; the dispatcher checks
//     before invoking SoulStore.
//   - L-22 structural enforcement: the validator consults this
//     allowlist at synthesis time + the dispatcher re-checks at
//     runtime (defense-in-depth). Either bypass surfaces as a
//     loud failure.
//
// Why a static set instead of an OrgSoul-embedded flag:
//   - Simpler to grep + audit via PR review.
//   - No runtime Soul inspection on every write (faster).
//   - Adding a path is a code change, not a per-workspace config
//     mutation. Cross-workspace consistency guaranteed.
//   - Dynamic per-workspace allowlists are a future-slice concern;
//     when we need them, we move the check into OrgSoul at that
//     point.

const BASE_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  // appointment-confirm-sms (SLICE 7 PR 2 C5): mark the patient's
  // upcoming appointment as "confirmed" after they reply CONFIRM via
  // SMS. Path is dynamic on contactId (resolved from trigger payload).
  //
  // Guarantees:
  //   - Idempotency: write is monotonic — value is always the literal
  //     "confirmed". Re-running the same archetype run for the same
  //     contact rewrites the same value (no semantic change).
  //   - Monotonicity: status only transitions toward "confirmed";
  //     archetype never writes any other value at this path.
  //   - Scope: write only happens after a successful read_state of
  //     the same upcoming-appointment record + branch on its
  //     existence — won't fabricate appointments out of thin air.
  "workspace.soul.appointments.upcoming.{{contactId}}.status",
]);

// Tests override via _overrideAllowlistForTests — underscore-
// prefixed to keep production callers away.
let activeAllowlist: ReadonlySet<string> = BASE_ALLOWLIST;

export const AGENT_WRITABLE_SOUL_PATHS = BASE_ALLOWLIST;

export function isAgentWritablePath(path: string): boolean {
  return activeAllowlist.has(path);
}

/**
 * TEST ONLY. Pass a Set to override; pass null to restore.
 * Intentionally verbose name to discourage production use.
 */
export function _overrideAllowlistForTests(
  override: ReadonlySet<string> | null,
): void {
  activeAllowlist = override ?? BASE_ALLOWLIST;
}
