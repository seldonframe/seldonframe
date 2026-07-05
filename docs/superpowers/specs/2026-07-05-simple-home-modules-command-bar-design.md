# Simple Home + Modules + SeldonChat Command Bar — design spec

**Date:** 2026-07-05 · **Status:** cofounder-locked (Max approved direction, command bar, minimal-default-for-fresh-claims; simplification mandate: "make /dashboard simpler and more intuitive... use simple easy to understand language")
**Goal:** A first-time owner lands on a Home page with ONE spine and zero jargon; the rest of
the product exists as modules that wake up when asked for — by talking to SeldonChat or by a
plain "Turn on more features" list. SeldonChat graduates from a corner bubble to part of the
page frame: the front door, physically.

## Why (first principles, from Max's live smoke 2026-07-05)
- The owner who just claimed a workspace is a roofer/medspa owner, not a SaaS operator. Their
  mental model is "my new online storefront." Every nav item or card that names an internal
  concept (blocks, BLOCK.md, WIP limits, MCP, workspaces-count chips) taxes their confidence.
- Observed on the current Home (screenshots on file): "Newly installed blocks", "Live kanban
  from BLOCK.md view metadata", a Claude-Code/MCP banner, "1/0 workspaces", an empty watch
  list, KPI cards reading "↓100% ($1) vs last month" on test data, a $1 revenue chart, a
  0-lead donut. That is builder vocabulary and empty-state math on an owner's screen.
- The dead-SeldonChat lesson still binds: a copilot nobody can find is a copilot nobody uses.
  Two unlabeled bubbles in two corners is how it dies again.

## Locked decisions
1. **Module / progressive-disclosure direction: APPROVED.**
2. **SeldonChat = persistent command bar** in the workspace chrome (not a corner bubble).
3. **Minimal-by-default for FRESH CLAIMS ONLY.** Existing orgs are grandfathered with
   everything visible (no surprise removals); they can slim down via SeldonChat later.
4. Day-one module set (Max may still adjust): **Home, Website, Bookings, Customers**
   (+ Settings, always reachable but visually quiet).

## Part A — The simple Home (one spine)
Render order, and NOTHING else above the fold:
1. **Greeting + "«Business» is live"** with a live thumbnail/link of their site (exists).
2. **The win ladder** (exists; SF_WIN_LADDER) — until all 4 steps are done, then it retires
   itself (already does).
3. **SeldonChat command bar** — see Part C.
Below the fold, sections appear ONLY when they carry real data or a real next action:
- "Your latest bookings" once ≥1 real booking exists (test bookings count — momentum).
- "New leads" once the lead form has ≥1 submission.
- Money/revenue sections only when Stripe is connected AND revenue > $0.
**Kill/demote list (owner sessions):** the Claude-Code/MCP banner (builder-only surface — show
it only to builder/agency operator sessions, never owner sessions), "Newly installed blocks"
section (fold into the ladder's steps), the BLOCK.md kanban caption (the kanban itself moves
behind the Customers module; the caption dies everywhere — internal file names never render),
watch-list chips when all zero, KPI/LeadSources/RevenueFlow cards until they have real data
(a $1 chart is worse than no chart).

## Part B — Modules (the surface becomes per-business config)
- **One registry** (code constant, fixed allowlist): home, website, bookings, customers,
  leads (intake), inbox, messaging, money, agents, integrations. Each entry = nav item +
  Home-section eligibility + a one-line plain-English description ("Money — send invoices and
  take payments").
- **Per-org state:** `organizations.settings.surface = { modules: string[], version: 1 }`
  (jsonb; COALESCE-merge idiom; NO migration). Absent key ⇒ grandfathered ⇒ all modules on.
  Fresh claims (the /claim-build path) write the minimal set at claim time.
- **Waking a module:** two doors, same write:
  (a) SeldonChat tools `enable_module` / `disable_module` (zod enum over the registry ids —
  the model arranges the room, it never invents furniture), with read-back ("Money is now in
  your sidebar — you can send your first invoice from there.").
  (b) A quiet "Turn on more features" item at the bottom of the nav → plain list with
  descriptions + toggles (for people who don't like chatting). Same settings write.
- **Rules:** disable hides, never deletes (data persists); a module with live obligations
  cannot hide (Money while a Stripe subscription/invoice is active; Agents while a deployed
  agent is running); Home/Settings can never hide; every SeldonChat change is read back.
- **Grandfathering:** existing orgs see zero change until they ask SeldonChat to simplify.

## Part C — SeldonChat command bar (the front door, physically)
- A persistent bar in the workspace chrome on every (dashboard) page — placeholder:
  **"Ask SeldonChat — change anything"**. Enter opens the full panel (existing chat + live
  preview pane) prefilled with the typed text. The bottom-left bubble is REPLACED by the bar
  (one entry point; the help "?" bubble stays where it is).
- **First post-claim visit:** the panel opens itself once, with 3 suggestion chips derived
  from ladder state (e.g. "Change my colors", "Book a test appointment", "Put my real hours
  on the site"). Never auto-opens again after the user closes it (settings.surface flag).
- Capped/entice, preview-bust, undo behaviors: unchanged from the shipped dock.
- v1.1 tools riding along: `enable_module`, `disable_module` (Part B), `pin_card` (choose
  which sections lead Home) — added to the existing 9-tool registry, same safe()/org-context
  pattern, template placeholder comment style.

## Copy rule (product-wide, this build enforces it on touched surfaces)
Simple language, roughly grade-6: feature not block, lead form not intake form, "your
website" not "landing page", no file names (BLOCK.md), no protocol names (MCP) on owner
surfaces, no percentage deltas computed from test/zero data. Buyer copy rule still binds:
never GMV/fees.

## Flags & rollout
- New flag **SF_SIMPLE_HOME** (strict "1", policy.ts pattern): gates Part A's Home rewrite +
  Part C's command bar + minimal-default writing at claim time. Dark until flipped.
- Part B's registry + settings plumbing ship inert (no reader honors settings.surface until
  the flag is on). SF_WIN_LADDER stays as-is (already live).
- Money-safe: no Stripe surface changes. No schema changes. No new deps expected.

## Out of scope (v1)
- Arbitrary layout editing ("move revenue to the left") — pin_card is the only ordering knob.
- Custom/user-defined modules; marketplace modules.
- Agency-side pre-shaping UI for client surfaces (fast-follow — agencies will want to ship a
  client a 3-module workspace; the settings key already supports it, only the UI is deferred).
- Migrating existing orgs to minimal (their call, via SeldonChat, later).

## Open items for the plan
1. Exact fresh-claim module set — proposed Home/Website/Bookings/Customers; Max may adjust.
2. Command bar placement: top (under the workspace header) vs bottom-center — decide with a
   quick visual in the plan; recommend top (always visible, no mobile-keyboard collision).
3. Where the "Turn on more features" list lives: nav bottom (recommended) vs Settings page.
4. The kanban's new home when Customers module is on (default collapsed section vs own page).
