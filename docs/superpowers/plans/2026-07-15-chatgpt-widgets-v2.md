# ChatGPT app v2 — widgets (inline card + browse carousel) + invocation strings

Status: PLANNED — **blocked until the rate-limit re-key session lands** (it edits the
same lib/chatgpt-app files). Build in a fresh worktree off main AFTER that merge.

## Why
Satisfaction/completion are the inputs OpenAI ranks for enhanced distribution;
text-only tool output is the weakest part of the current UX. Widgets are the
biggest available upgrade. Build on the **MCP Apps standard** (`_meta.ui.resourceUri`,
`ui/*` bridge) with the ChatGPT alias (`_meta["openai/outputTemplate"]`) — the same
widget then works in any MCP Apps host (never-goes-stale).

## Scope (deliberately small — 3 pieces)

1. **Invocation strings** (zero-risk, pure metadata):
   - build_workspace: invoking "Building your workspace…" / invoked "Workspace live."
   - browse_marketplace: "Browsing free agents…" / "Agents found."
   - deploy_agent: "Installing agent…" / "Agent installed."
   Via `_meta["openai/toolInvocation/invoking"|"invoked"]` (≤64 chars).

2. **build_workspace inline card** — dark card: business name, live URL as the
   hero link, three chips (Website · Booking · CRM · AI chat), one primary CTA
   "Open your site ↗" (link-out to the workspace URL) + secondary "Claim it"
   (claim URL — FREE, so policy-clean; still NO prices/paid anything anywhere).
   No remote images in v2 (empty CSP = easiest review); the card is typographic.

3. **browse_marketplace carousel** — 3–8 free agents, each: name, one-line
   description, category badge, single CTA "Add to my workspace" which calls
   `deploy_agent` from the widget (`tools/call` via the bridge; requires the
   workspace_token to be present in widget state — pass it through
   `structuredContent` only when build_workspace ran earlier in the convo,
   else the CTA falls back to `ui/message` "Install <slug>").

## Implementation notes
- Handler must add `resources/list` + `resources/read` to the RPC dispatch
  (current: initialize / tools/list / tools/call / notifications). Resources:
  `ui://widget/build-result.html`, `ui://widget/agent-carousel.html`, served as
  `text/html;profile=mcp-app`, self-contained (inline CSS/JS, no external hosts).
- Widget JS: listen for `ui/notifications/tool-result`, render from
  `structuredContent`; treat it as untrusted; support the approval-gated case
  (missing initial input is normal). Use `window.openai` ONLY behind feature
  detection.
- `structuredContent` must keep matching declared `outputSchema` exactly
  (review checks this) — extend schemas + content together.
- Tool descriptors get `_meta.ui.resourceUri` + `_meta["openai/outputTemplate"]`
  on build_workspace and browse_marketplace only (deploy_agent stays text +
  invocation strings).
- Keep the wire layer unit-tested with fakes (extend chatgpt-mcp-rpc/handler specs):
  resources round-trip, descriptor meta present, structuredContent↔schema parity.

## Submission checklist (Max)
1. Deploy to prod, verify `resources/read` over the live endpoint.
2. Plugin portal → new draft version → **Scan Tools** AFTER deploy → verify the
   scanned meta shows the resource URIs + CSP → submit with release notes
   ("adds inline result card + agent carousel; no new data collected").
3. Screenshots now allowed/expected (app has a UI) — capture card + carousel.
4. `_meta.ui.domain`: needed for submission review of UI apps (unique origin);
   decide the origin (e.g. https://chatgpt-widgets.seldonframe.com) or keep the
   default sandbox origin if scan accepts it — verify in the portal during scan.
5. Publish after approval; old version keeps serving until then (backward-compatible
   contract: only ADD meta/fields, never rename/remove).

## Policy tripwires (do not cross)
- No prices, no paid agents, no upsell language in any widget. Claim = free.
- Minimal data: widgets render only what the tools already return.
- No iframes (`frameDomains` stays unset), no external fetches (empty `connectDomains`).
