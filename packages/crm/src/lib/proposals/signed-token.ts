// packages/crm/src/lib/proposals/signed-token.ts
// 2026-05-19 — Proposal Builder. Generates URL-safe tokens for public
// /p/[token] routes. Uses crypto.randomBytes (32 bytes → ~43 char base64url
// string). Tokens are stored in proposals.signed_token UNIQUE. Spec:
// 2026-05-19-proposal-builder-design.md §"Public proposal URL".

import { randomBytes } from "node:crypto";

export function generateProposalToken(): string {
  return randomBytes(32).toString("base64url");
}
