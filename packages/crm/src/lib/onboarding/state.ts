// packages/crm/src/lib/onboarding/state.ts
//
// 2026-05-27 — Unified onboarding shell — server-side helper.
//
// Single source of truth for the question "should the onboarding shell
// render for this user, and on which step?". Called from each of the
// three shell-wrapped pages (/signup/connect-ai, /clients/new,
// /clients/[slug]/ready) so the shell's `step={1|2|3}` and visibility
// are computed in one place rather than re-derived per page.
//
// Decision tree:
//
//   users.onboarding_completed_at IS NOT NULL
//     → { completed: true, currentStep: null }     (shell never renders)
//
//   no BYOK Anthropic key on the operator's agency org
//     → { completed: false, currentStep: 1 }       (Connect AI page)
//
//   has BYOK key, no owned/parented workspace
//     → { completed: false, currentStep: 2 }       (Build page)
//
//   has BYOK key + at least one workspace
//     → { completed: false, currentStep: 3 }       (Make it yours page)
//
// `currentStep` is a PAGE IDENTITY (1=Connect-AI, 2=Build, 3=Ready), not
// the number shown in the progress strip. Each onboarding page guards on
// its own `currentStep === N`, so this number must stay stable.
//
// 2026-06-22 — The Anthropic-key step is no longer a FORCED stop in
// first-run: a brand-new (keyless) account is routed straight to /clients/new
// and builds on the platform key, so it never lands on /signup/connect-ai
// unless it chooses to. The progress strip therefore counts a SHORTER arc
// for keyless operators so they don't awkwardly start at "Step 2 of 3":
//
//   keyless operator → forced arc is  Build (1 of 2) → Make it yours (2 of 2)
//   keyed   operator → full arc is    Connect AI (1 of 3) → Build (2 of 3)
//                                       → Make it yours (3 of 3)
//
// `display` carries the position + total to render in the strip. It is
// derived alongside `currentStep` so the shell never has to re-derive the
// arc length (it would need the BYOK fact, which lives only here).
//
// The shell decides what to render based on `currentStep`. The page
// itself is always allowed to render — we never *block* navigation,
// only annotate the page with the progress strip when the user is in
// onboarding. This way a returning operator who already onboarded sees
// /clients/new as a normal "new workspace" form, not as "step 2 of 3".
//
// Backed by a single users-table lookup for the completion flag plus
// at-most-two integration/workspace lookups when the user IS mid-
// onboarding. Pure server-side; never imported by client components.

import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { operatorHasByokAnthropicKey } from "@/lib/web-onboarding/byok-resolver";

export type OnboardingStep = 1 | 2 | 3;

/**
 * What the progress strip should render: the operator's position in the
 * forced arc and the arc's total length. Distinct from `currentStep`
 * (a page identity) because the key step is skipped for keyless operators,
 * so the *displayed* arc is shorter than the page-id space.
 */
export type OnboardingDisplay = { step: number; total: number };

export type OnboardingState =
  | { completed: true; currentStep: null; display: null }
  | { completed: false; currentStep: OnboardingStep; display: OnboardingDisplay };

/**
 * Derive the progress-strip {step, total} from the page identity plus
 * whether the operator has a BYOK key.
 *
 * Keyless operators never get forced through Connect-AI (they build on the
 * platform key), so their arc is the 2-step Build → Make-it-yours. A keyed
 * operator (one who chose to add a key, or is returning mid-arc) walks the
 * full 3-step arc with Connect-AI as step 1.
 */
export function deriveOnboardingDisplay(
  currentStep: OnboardingStep,
  hasByokAnthropicKey: boolean,
): OnboardingDisplay {
  if (hasByokAnthropicKey) {
    // Full 3-step arc: page identity === displayed position.
    return { step: currentStep, total: 3 };
  }
  // Keyless 2-step arc. currentStep is 1 only when the operator chose to
  // visit Connect-AI (handled by the keyed branch normally, but a keyless
  // operator sitting ON connect-ai shows as step 1 of 2); Build → 1,
  // Make-it-yours → 2.
  const step = currentStep === 1 ? 1 : currentStep - 1;
  return { step, total: 2 };
}

/**
 * Resolve the current onboarding state for a given user. Pure read; safe
 * to call from any server component on every render (3 SELECTs max,
 * indexed lookups all).
 *
 * `orgId` is optional — if you've already resolved the operator's
 * agency org elsewhere (most pages do via session.user.orgId / getOrgId()),
 * pass it in to skip the redundant lookup. When omitted, we resolve it
 * from the users row.
 */
export async function getOnboardingState(
  userId: string,
  orgId?: string | null,
): Promise<OnboardingState> {
  if (!userId) {
    // Defensive: a missing userId means the caller doesn't have an auth'd
    // session, so the shell shouldn't render. Treat as completed=true
    // (shell hidden) rather than throwing — the auth gate on each page
    // is responsible for redirecting unauthed users away.
    return { completed: true, currentStep: null, display: null };
  }

  const [userRow] = await db
    .select({
      orgId: users.orgId,
      onboardingCompletedAt: users.onboardingCompletedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow) {
    // User row missing (deleted? mid-bootstrap?) — same defensive
    // posture as the empty-id branch above.
    return { completed: true, currentStep: null, display: null };
  }

  if (userRow.onboardingCompletedAt) {
    return { completed: true, currentStep: null, display: null };
  }

  const resolvedOrgId = orgId ?? userRow.orgId ?? null;

  // Step 1 gate — no BYOK Anthropic key on the agency org. We can't even
  // ask the workspace-count question if we don't have an org reference,
  // and a brand-new user might not yet (edge case during the post-magic-
  // link auth callback). In that case we know they're on step 1.
  if (!resolvedOrgId) {
    return {
      completed: false,
      currentStep: 1,
      display: deriveOnboardingDisplay(1, false),
    };
  }

  const hasKey = await operatorHasByokAnthropicKey(resolvedOrgId);
  if (!hasKey) {
    return {
      completed: false,
      currentStep: 1,
      display: deriveOnboardingDisplay(1, false),
    };
  }

  // Step 2 gate — has the BYOK key but hasn't successfully built a
  // client workspace yet. A "workspace they built" is any org where they
  // are owner OR parent operator (matches the gate used by the /clients
  // listing page so the count we use here is the same count the user
  // sees in the sidebar). The agency org itself doesn't count — that's
  // their own org, created at signup, not a workspace they built.
  //
  // Load up to 2 rows (limit=2) so we can tolerate the case where the
  // agency org happens to come back first in the result set — if the
  // first row IS the agency org, the second row tells us whether a
  // client workspace exists. Without limit=2 we'd false-negative for
  // operators whose first owned/parented org is their own agency.
  const workspaceRows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      or(
        eq(organizations.ownerId, userId),
        eq(organizations.parentUserId, userId),
      ),
    )
    .limit(2);

  // True iff at least one of the up-to-2 rows is NOT the agency org id.
  const hasClientWorkspace = workspaceRows.some(
    (row) => row.id !== resolvedOrgId,
  );

  if (!hasClientWorkspace) {
    return {
      completed: false,
      currentStep: 2,
      display: deriveOnboardingDisplay(2, true),
    };
  }

  return {
    completed: false,
    currentStep: 3,
    display: deriveOnboardingDisplay(3, true),
  };
}

/**
 * Stamp users.onboarding_completed_at = NOW() for the given user.
 * Idempotent — if the column is already non-NULL we don't overwrite
 * (preserves the original completion timestamp for any analytics that
 * cares).
 *
 * Called from the Ready page's "Maybe later" form action AND from the
 * /settings/domain successful-save path (when the operator was in
 * onboarding and just connected a custom domain — either way they're
 * done with the arc).
 *
 * Safe to call multiple times. Safe to call for already-completed users.
 */
export async function markOnboardingComplete(userId: string): Promise<void> {
  if (!userId) return;

  await db
    .update(users)
    .set({
      onboardingCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(users.id, userId),
        // Idempotency: WHERE onboarding_completed_at IS NULL makes this
        // a no-op for already-completed users. Without it, every call
        // would touch the row and bump updatedAt for no reason — and,
        // more importantly, would overwrite the original completion
        // timestamp with a later one, breaking any analytics that care
        // about the moment the operator finished the arc.
        isNull(users.onboardingCompletedAt),
      ),
    );
}

/**
 * Pure helper — derive the step from a set of inputs the caller has
 * already gathered. Useful in tests and in callsites that already
 * know the BYOK + workspace-count answers and don't want a second DB
 * round-trip just to ask the question.
 *
 * Encodes the exact same decision tree as getOnboardingState above —
 * the latter is just a DB-aware wrapper around this. Keep the two in
 * lockstep.
 */
export function deriveOnboardingState(input: {
  onboardingCompletedAt: Date | string | null;
  hasByokAnthropicKey: boolean;
  hasClientWorkspace: boolean;
}): OnboardingState {
  if (input.onboardingCompletedAt) {
    return { completed: true, currentStep: null, display: null };
  }
  if (!input.hasByokAnthropicKey) {
    return {
      completed: false,
      currentStep: 1,
      display: deriveOnboardingDisplay(1, false),
    };
  }
  if (!input.hasClientWorkspace) {
    return {
      completed: false,
      currentStep: 2,
      display: deriveOnboardingDisplay(2, true),
    };
  }
  return {
    completed: false,
    currentStep: 3,
    display: deriveOnboardingDisplay(3, true),
  };
}
