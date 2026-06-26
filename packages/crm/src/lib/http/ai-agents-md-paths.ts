// Pure path math for the /ai-agents Markdown negotiation — kept out of proxy.ts
// (which imports the auth/db graph) so it unit-tests in isolation. This is where
// the M1 dotted-DYNAMIC-segment lesson lives: the PUBLIC `.md` URLs
// (`/ai-agents/<job>.md`, `/ai-agents/<job>/for/<vertical>.md`) are mapped to the
// STATIC `/ai-agents/listing.md?job=…&vertical=…` route's query params — there is
// no `[job].md` bracket folder, so Next 16's route-type validator stays happy.
//
// No Next, no I/O — just string → string(s). Unit-tested exhaustively.

/** The static rewrite target route (slug carried as query params). */
export const AI_AGENTS_LISTING_MD_ROUTE = "/ai-agents/listing.md";
/** The static index Markdown route. */
export const AI_AGENTS_INDEX_MD_ROUTE = "/ai-agents.md";

/** The query the static `listing.md` route should receive for a page. */
export type AiAgentMarkdownTarget = { job: string; vertical?: string };

/**
 * Parse an EXPLICIT public `.md` URL into the job (+ optional vertical) the
 * static route needs, or null when the path isn't an /ai-agents page `.md` URL.
 *
 *   /ai-agents/ai-receptionist.md                  → { job: "ai-receptionist" }
 *   /ai-agents/ai-receptionist/for/plumbers.md     → { job, vertical: "plumbers" }
 *   /ai-agents.md / /ai-agents/listing.md          → null (handled separately)
 *   /ai-agents/ai-receptionist                     → null (no `.md`)
 */
export function parseExplicitAiAgentMarkdownPath(pathname: string): AiAgentMarkdownTarget | null {
  // Tier-2 first (more specific): /ai-agents/<job>/for/<vertical>.md
  const t2 = /^\/ai-agents\/([^/]+)\/for\/([^/]+)\.md$/.exec(pathname);
  if (t2) return { job: t2[1], vertical: t2[2] };
  // Tier-1: /ai-agents/<job>.md  (but not the static listing.md route)
  const t1 = /^\/ai-agents\/([^/]+)\.md$/.exec(pathname);
  if (t1 && t1[1] !== "listing") return { job: t1[1] };
  return null;
}

/**
 * For a NEGOTIABLE HTML path, return both the page's `{job, vertical?}` (so the
 * proxy can build the rewrite query) and the PUBLIC `.md` twin path (for the
 * advertised `Link`/`<link>`), or null when the path is not a negotiable
 * /ai-agents HTML page.
 *
 *   /ai-agents                              → null   (index handled separately)
 *   /ai-agents/ai-receptionist             → { target:{job}, twin:"/ai-agents/ai-receptionist.md" }
 *   /ai-agents/ai-receptionist/for/plumbers→ { target:{job,vertical}, twin:".../for/plumbers.md" }
 *   /ai-agents/listing.md                  → null   (it's the rewrite target itself)
 *   anything with a dotted final segment    → null   (let the `.md` branch own it)
 */
export function negotiableAiAgentPage(
  pathname: string,
): { target: AiAgentMarkdownTarget; twin: string } | null {
  // Tier-2: /ai-agents/<job>/for/<vertical>
  const t2 = /^\/ai-agents\/([^/]+)\/for\/([^/]+)$/.exec(pathname);
  if (t2) {
    const job = t2[1];
    const vertical = t2[2];
    if (job.includes(".") || vertical.includes(".")) return null;
    return { target: { job, vertical }, twin: `/ai-agents/${job}/for/${vertical}.md` };
  }
  // Tier-1: /ai-agents/<job>
  const t1 = /^\/ai-agents\/([^/]+)$/.exec(pathname);
  if (t1) {
    const job = t1[1];
    if (job.includes(".")) return null; // dotted → the explicit `.md` branch owns it
    return { target: { job }, twin: `/ai-agents/${job}.md` };
  }
  return null;
}
