import { redirect } from "next/navigation";

/**
 * Legacy URL — kept as a permanent redirect so any bookmarks /
 * inbound links from earlier docs continue to work.
 *
 * `/deals/pipeline` was originally a separate page rendered by the
 * BLOCK.md schema-driven `<DealsCrmSurface>`. As of WS2.2 v2, the
 * polished kanban (HTML5-free dnd-kit, cookie-driven view toggle,
 * inline +Add deal, Twenty-style cards) lives at `/deals`. There's
 * no reason to maintain two parallel pipeline UIs — the `/deals`
 * route owns both Kanban and Table views via the cookie-persisted
 * view toggle.
 *
 * Operators land on `/deals` by default; this redirect catches the
 * old URL and forwards them. `redirect()` issues a 307 so the method
 * is preserved (relevant if anything POSTs to /deals/pipeline,
 * though nothing currently does).
 */
export default function LegacyPipelineRedirect() {
  redirect("/deals");
}
