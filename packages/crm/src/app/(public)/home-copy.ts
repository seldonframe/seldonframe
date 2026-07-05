// Shared marketing-homepage copy constants.
//
// Extracted from app/(public)/page.tsx so the SAME positioning line is the
// single source for both the human HTML homepage (PublicHomePage metadata +
// hero) and its agent-Markdown twin (/home.md → renderHomeMarkdown). Keeping it
// here — a plain, dependency-free module — lets the pure Markdown renderer import
// the line WITHOUT pulling the server page component (and its auth() call) into
// its module graph.

/** The one-line product positioning used in the homepage metadata/description
 *  and quoted verbatim at the top of /home.md. */
export const POSITIONING_ONE_LINER =
  "SeldonFrame — the all-in-one platform to run and sell your service business: website, booking, CRM, payments, and AI agents that do the work, built from your URL in 60 seconds. Build it free, then $29/mo, cancel anytime.";
