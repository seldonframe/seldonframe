// Agent truth slice (2026-07-16, Task 1) — the generalize-actions server-side
// observability log-line builder.
//
// WHY: Max's real production failure ("Couldn't check for personal details.
// Try again.") left ZERO trace in Vercel logs — proposeTemplateGeneralization
// returns a typed error but generalize-actions.ts never logged anything, so
// the actual upstream cause (model-not-found, 401, overloaded) was
// unrecoverable after the fact. `generalize-actions.ts` calls
// `buildGeneralizeFailureLog` on every non-ok propose result and hands the
// result straight to `console.error`.
//
// Pure + DI'd (no db, no LLM, no fetch) so the failure-log shape is directly
// unit-testable — mirrors generalize.spec's convention of testing the pure
// core in isolation. Never accepts `customSkillMd` as an input (structural
// guarantee: it is impossible for a caller to leak persona/skill-md content
// into a log line through this function, per the design doc's "never log
// skill-md content" rule).

import { scrubSecretShapes } from "@/lib/agent-receipts/write";
import type { ProposeGeneralizationResult } from "./generalize";

export const GENERALIZE_PROPOSE_FAILURE_LOG_PREFIX = "[generalize] propose failed";

/** Review fix NB-1 — same defense-in-depth rationale as the receipts
 *  `deriveReceiptSummary`'s 140-char cap: even after `scrubSecretShapes`,
 *  an upstream SDK error could echo back an oversized fragment (e.g. a
 *  persona/prompt excerpt in a 400's error detail). Capped at 200 (vs.
 *  receipts' 140) since this is a server log line, not operator-facing UI —
 *  a little more room to stay diagnosable, still bounded. */
const UPSTREAM_MAX_LENGTH = 200;

export type GeneralizeFailureLogPayload = {
  templateId: string;
  orgId: string;
  error: Extract<ProposeGeneralizationResult, { ok: false }>["error"];
  model: string;
  upstream?: string;
};

/**
 * Build the `[message, payload]` pair to hand straight to `console.error` on
 * a non-ok `proposeTemplateGeneralization` result. Includes the resolved
 * model id (memory flags stale env model pins as a live risk class — this
 * makes the next failure self-diagnosing) and the upstream error message
 * (scrubbed with the receipts `scrubSecretShapes` helper — never a raw
 * error that could echo a credential shape). A blank/absent
 * `upstreamMessage` omits the `upstream` key entirely rather than logging an
 * empty string. Pure; never throws.
 */
export function buildGeneralizeFailureLog(args: {
  templateId: string;
  orgId: string;
  result: Extract<ProposeGeneralizationResult, { ok: false }>;
  model: string;
  upstreamMessage?: string | null;
}): { message: string; payload: GeneralizeFailureLogPayload } {
  const payload: GeneralizeFailureLogPayload = {
    templateId: args.templateId,
    orgId: args.orgId,
    error: args.result.error,
    model: args.model,
  };

  const upstream = args.upstreamMessage?.trim();
  if (upstream) payload.upstream = scrubSecretShapes(upstream).slice(0, UPSTREAM_MAX_LENGTH);

  return { message: GENERALIZE_PROPOSE_FAILURE_LOG_PREFIX, payload };
}
