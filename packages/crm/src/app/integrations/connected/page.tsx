// Agent setup mode slice (T3) — the minimal in-place-connect popup callback
// (spec §2). Composio's hosted OAuth completion redirects HERE (never back
// to the agent page — see lib/agent-templates/lifecycle-connect-actions.ts's
// popup-mode callbackUrl). Deliberately OUTSIDE the (dashboard) route group
// so it never pulls in the full sidebar/topbar/SeldonChat chrome (L-18) —
// this tab exists for a few hundred milliseconds and does nothing but signal
// its opener and close itself.
//
// No auth/org read here on purpose: the actual connectedAccount was already
// written by Composio directly against the org's session before this
// redirect ever fires — this page has nothing to verify or write, only to
// announce completion. `?toolkit=` is attacker-controllable in principle
// (it's a public GET param) but carries no privilege — it's echoed back to
// the opener as a plain string label, never trusted for anything but display
// / matching against the toolkit the opener itself requested.

import { ConnectPopupCallback } from "@/components/integrations/connect-popup-callback";

export default async function ConnectPopupCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ toolkit?: string }>;
}) {
  const { toolkit } = await searchParams;
  return <ConnectPopupCallback toolkit={toolkit ?? null} />;
}
