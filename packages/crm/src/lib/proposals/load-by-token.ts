// packages/crm/src/lib/proposals/load-by-token.ts
// 2026-05-19 — Proposal Builder. Public-route helper. Validates the
// shape of a signed_token (cheap defense against scanner bots before
// hitting the DB) and loads the proposal row. Spec: §"Public proposal page".

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { proposals, type Proposal } from "@/db/schema";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,}$/;

export function validateToken(token: string | null | undefined): boolean {
  if (!token) return false;
  return TOKEN_PATTERN.test(token);
}

export async function loadProposalByToken(
  token: string,
): Promise<Proposal | null> {
  if (!validateToken(token)) return null;
  const [row] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.signedToken, token))
    .limit(1);
  return row ?? null;
}
