// packages/crm/src/lib/onboarding/links.ts
// 2026-06-04 — Tokenized onboarding links. Clients receive a no-login
// /onboard/[token] URL after paying; this module mints, validates, and
// loads those tokens from the onboarding_links table.
// Mirrors the proposal signed-token pattern (lib/proposals/load-by-token.ts).

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { onboardingLinks, type OnboardingLink } from "@/db/schema";

// ─── Validator ────────────────────────────────────────────────────────────────

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,}$/;

/**
 * Pre-validates the shape of a token before hitting the DB.
 * Cheap defense against scanner bots and malformed requests.
 */
export function isValidOnboardingToken(t: string): boolean {
  return TOKEN_PATTERN.test(t);
}

// ─── Mint ─────────────────────────────────────────────────────────────────────

/**
 * Returns a cryptographically-random base64url token (≥ 32 chars, always
 * URL-safe — no +, /, or = characters).
 */
export function mintOnboardingToken(): string {
  return randomBytes(32).toString("base64url");
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Inserts an onboarding_links row for `orgId` with status "pending" and
 * returns the fresh token. Call this after the client pays.
 */
export async function createOnboardingLink(
  orgId: string,
): Promise<{ token: string }> {
  const token = mintOnboardingToken();
  await db.insert(onboardingLinks).values({
    orgId,
    token,
    status: "pending",
  });
  return { token };
}

// ─── Load ─────────────────────────────────────────────────────────────────────

/**
 * Validates the token shape then does a DB lookup.
 * Returns the row or null (invalid token / not found).
 * Mirrors `loadProposalByToken` in lib/proposals/load-by-token.ts.
 */
export async function loadOnboardingLinkByToken(
  token: string,
): Promise<OnboardingLink | null> {
  if (!isValidOnboardingToken(token)) return null;
  const [row] = await db
    .select()
    .from(onboardingLinks)
    .where(eq(onboardingLinks.token, token))
    .limit(1);
  return row ?? null;
}
