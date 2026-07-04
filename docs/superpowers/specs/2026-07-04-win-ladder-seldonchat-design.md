# Win Ladder + SeldonChat (workspace copilot) — design spec

**Date:** 2026-07-04 · **Status:** cofounder-locked (Max + Claude), ready for plan
**Goal:** After a /try claim lands on the "«Workspace» is live." hero, walk the owner through
four state-detected wins that each deepen investment, with the $29 ask arriving exactly at
the custom-domain moment. Center the experience on SeldonChat — a ChatGPT-familiar copilot
that IS the front door to the workspace, not a helper beside it.

## Positioning doctrine (locked)
- SeldonChat v1 is **the beginning of the interface**: docked on every workspace page,
  first-class in the ladder, settings sprawl progressively demoted behind it.
- The dead-SeldonChat lesson (removed 2026-05-18: a talking helper nobody used) is a design
  CONSTRAINT: this copilot must visibly **act** — type "make the buttons gold" → watch the
  site change in a live preview, with one-click undo. Never "how can I help?"
- Never-lies: the copilot only claims what a tool call confirmed. Read-back before
  destructive actions.
- "$10,000 for $29" comes from ACCUMULATION: bookings → edits → domain → inbox → agents.
  Each step raises switching cost; the paid step is a door they ask to open, never a wall.

## The ladder (rendered under the claimed-workspace hero, each step state-detected)

### Step 1 — "See it book a real appointment"
- Card: connect your calendar (Google/Outlook **via Composio** — keys already in Vercel)
  → then chat with your receptionist on your live site and book a test appointment.
- The booking lands in THEIR REAL CALENDAR via the existing pluggable booking backend
  (`resolveCalendarBackend` seam, shipped 2026-06-24, fail-soft to native) + a Resend
  confirmation email (+ existing .ics attachment) to their real inbox.
- No-connect path still works (native calendar) — connect is the upsell-of-investment, not
  a gate. Detected by: first booking exists (bonus state: calendar connected).
- ⚠️ Planning note: memory records ONE open live-smoke on the Composio free-slots slug +
  MCP response shape (else it fail-softs silently). Verify during build.

### Step 2 — SeldonChat (the wow)
- ChatGPT/Claude-familiar chatbox wired to the workspace MCP tool surface: images, fonts,
  text, colors, spacing, sections, pages, booking config, intake fields.
- **Model: Sonnet** (founder call — quality of the wow; the LLM routes intents while
  deterministic tools do the work, system prompt cache_control'd, so tokens stay small).
- **Free cap: 20 copilot queries/day** → at cap, the entice: "$29/mo lifts the cap" (same
  no-wall doctrine: cap message is warm, shows what they could do next, one-click upgrade).
- v1 tool scope: site/landing editing + theme + pages + booking/intake config. NOT in v1:
  billing, workspace deletion, secrets. Destructive-ish actions (delete section/page)
  require an in-chat confirm. Undo affordance surfaces landing version history
  (list_landing_versions / revert_landing).
- Layout: side-by-side chat + live preview on desktop; dock-overlay on mobile. Persistent
  dock entry point on every (dashboard) page (the front-door doctrine).
- Detected by: first successful copilot-driven change.

### Step 3 — "Make it yours: your domain"
- Free half: copy link, download QR, swap GBP/Instagram link (share assets card).
- The $29 moment: "Ready for «business».com? Connect your domain — Workspace $29/mo. One
  booked job pays for the year." Routes to the REAL $29 checkout (existing
  GROWTH_BASE_PRICE_ID rail) — includes the /pricing truth pass (kill the stale
  $19/$49/$297 pageview wherever the ladder/plan-gate can send people).
- Rails exist: add_custom_domain + upgrade gate. Detected by: domain attached (paid) or
  share-assets used (free half).

### Step 4 — "Plug the leak: hire an agent"
- Contextual suggestion of TWO agents by vertical (extraction already knows it): med spa →
  review-requester + reminders; trades → missed-call-text-back + speed-to-lead; everyone
  sees the 24/7 phone receptionist as the flagship (Tier-0 provisioning exists; voice usage
  = wallet revenue). Starters/marketplace rails exist; the delta is the contextual picker
  on the ladder. Detected by: first agent enabled beyond the default chatbot.

## Cross-cutting
- Every step completion fires a PostHog event (funnel: claimed → step1..4 → paid) — the
  activation dashboard Max watches.
- All flag-gated dark until flipped; money-safe (no new Stripe surface — reuse the $29
  checkout); no schema changes expected beyond possibly a jsonb ladder-state marker on
  organizations.settings (decide in planning; prefer deriving state from existing data).
- Reuse inventory (nothing rebuilt): agent chat loop (receptionist runtime) · MCP tool
  layer · resolveCalendarBackend/Composio · Resend + .ics · NL landing editor semantics ·
  landing version history · add_custom_domain + upgrade gate · starter agents ·
  $29 checkout · PostHog capture helpers.

## Out of scope (v1)
- Email-connect as its own ladder step (Composio Gmail/Outlook connect may ride along with
  step 1's calendar OAuth where the toolkit grants both; a dedicated "send as you" email
  step is a fast-follow).
- Copilot over billing/danger surfaces; LLM analytics; multi-workspace ladder.

## Open items for the plan
1. Ladder-state detection queries per step (prefer derived state; only add a settings
   marker if derivation is expensive).
2. SeldonChat runtime binding: reuse runChannelTurn/agent loop vs a thin dedicated
   operator-copilot loop with the workspace-admin toolset; org-scoped auth = the session.
3. Cap enforcement: per-org daily counter (Upstash if present, DB fallback) + the entice UI.
4. Composio free-slots live-smoke (the recorded open item) before step-1 marketing copy
   promises "in your calendar."
