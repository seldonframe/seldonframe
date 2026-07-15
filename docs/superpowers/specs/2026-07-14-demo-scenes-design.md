# Demo scenes — recordable animation stage for product videos

**Date:** 2026-07-14 · **Branch:** `feature/demo-scenes` (off main @ `e5bd50728`) · **Status:** approved (Max, in-chat: "can you build SVG animations like chatbox convo and calendar booking notification using animated-list … and whatever UI animation you think would enhance the demo")

## Purpose

Max is producing demo videos. Screen capture stays the ground truth for the
product wows (never-lies: animations must never fake the product), but
stylized animated INSERTS compress the beats screen recording is bad at:
off-screen notifications, invisible "connected" plumbing, stat payoffs,
intros/outros, and X-post creatives (GENERATED-vs-CAPTURE rule: these read
as clearly stylized, never as fake screenshots).

Deliverable: full-viewport, loopable, brand-tokened scenes Max can screen-
record at any resolution — hosted on a dev-only route, reusing the motion
stack already on main.

## Verified foundation (scouted on main — reuse, don't rebuild)

- `components/ui/animated-list.tsx` (staggered spring list, looping)
- `components/ui/magic/animated-beam.tsx` (ref-to-ref gradient beam)
- `components/ui/magic/terminal.tsx` (+ `TypingAnimation`, `AnimatedSpan`)
- `components/ui/number-ticker.tsx`
- `components/landing/edit-by-chat-demo.tsx` (chat-phase pattern to adapt, not import)
- `/brand/integrations/*.svg` (google-calendar, gmail, stripe, hubspot, …) + `/brand/models/*.svg` + the Seldon mark
- `(dev)/motion-lab` conventions: `SF_MOTION_LAB=1` strict flag, `robots: { index:false, follow:false }`, route-level imports of `landing-theme.css` + `motion-tokens.css`, dark flip via `.lp-root[data-mode="record"]`
- Tokens: cream `#F6F2EA` / card `#FFFDFA` / forest `#1F2B24`; dark bg `#14110D` / card `#1F1A15`; `--motion-*` durations/easings; every scene honors `prefers-reduced-motion`
- `framer-motion` + `motion` both installed — new code uses `motion/react`

## Route design

`app/(dev)/demo-scenes/page.tsx` — index listing scene cards (name, one-line
use, link) — and `app/(dev)/demo-scenes/[scene]/page.tsx` — ONE scene
rendered full-viewport (100svh, no chrome except a small bottom-right
control cluster that auto-hides: Restart · Loop on/off · Light/Dark).
Same gating idiom as motion-lab: `SF_MOTION_LAB` strict check → 404 when
off; `robots: { index: false, follow: false }`; route-level CSS imports
(landing-theme.css + motion-tokens.css — the tsx-has-no-CSS-loader gotcha).
Unknown `[scene]` → `notFound()`. Server page resolves the scene id from a
static registry and renders the matching client component.

Controls detail: "Restart" remounts the scene via a `key` bump; "Loop"
persists in a query param (`?loop=1`) so a recording session can deep-link;
mode flip toggles `data-mode="record"` on the stage root (reuses the
existing token flip). Controls fade to opacity 0 after 3s idle (mousemove
resets) so they never appear in a recording.

## The seven scenes (`components/demo-scenes/*.tsx`, all "use client", all props-defaulted)

1. **`booking-cascade`** — AnimatedList notification stack, product-toast
   styled cards w/ vendored icons: "📅 New booking — Sarah M · Tue 2:30 PM"
   (google-calendar.svg) → "SMS confirmation sent to Sarah" → "Contact added
   to CRM" → "Review request queued for Wednesday". ~1.2s stagger, loop with
   a clean 1.5s hold + fade-reset. THE money-loop B-roll.
2. **`calendar-connected`** — two nodes (Seldon mark ↔ google-calendar.svg)
   joined by AnimatedBeam; after the beam settles, a "Connected" pill pops
   (spring scale), then a small booking-event card slides in beneath the
   calendar node and a dot pulse travels the beam. Loop.
3. **`grounded-chat`** — chat playback (adapt the EditByChatDemo phase
   machine, chat panel only, bigger type for video): typing indicator →
   customer: "Do you do Saturday appointments?" → agent grounded reply
   ("Yes — we're open Saturday 9–2. Want me to book you in?") → customer:
   "Yes, 10am" → agent booking-confirmation bubble w/ calendar chip. Loop
   with hold.
4. **`stat-payoff`** — one row, four NumberTickers with labels: 1 URL →
   1 website · 1 AI chatbot · 1 CRM · 1 booking page; sub-line
   "one booked job pays for it" in AnimatedShinyText. Loop = re-count.
5. **`sms-phone`** — CSS-only phone frame (rounded slab, notch, status bar —
   NO new dependency, ~60 LOC of divs) with an iMessage-style bubble
   sliding in: "You're booked for Tue 2:30 PM with Zen Flow Hydration —
   reply R to reschedule." Subtle haptic-style shake on arrival. Loop.
6. **`live-confetti`** — "zen-flow-hydration.app.seldonframe.com is live."
   headline + a ~48-particle CSS confetti burst (absolutely-positioned
   spans, randomized via a seeded array module-side — NO Math.random in
   render to keep SSR happy, NO canvas-confetti dep). Loop.
7. **`docker-terminal`** — Terminal component: types
   `docker compose up -d`, staggered success lines (pull → db → migrations
   → "✔ SeldonFrame running on http://localhost:3000"), ends with a blinking
   cursor. For the self-host/open-source video. Loop.

Scene registry: `components/demo-scenes/registry.ts` — `{ id, title, blurb,
Component }[]`, imported by both route files (single source of truth).

## Constraints

- **No new dependencies** (worktree junction; also keeps the page zero-cost).
- Every scene: `prefers-reduced-motion` → settle to final frame instantly
  (same idiom as existing components); SSR-safe (no window at module scope);
  no `Math.random()`/`Date.now()` at render (hydration + lint).
- Copy uses the real demo workspace vocabulary (Zen Flow Hydration) — reads
  as product-true, styled as insert.
- Nothing on public routes; no proxy/middleware changes; no flags added
  (reuse `SF_MOTION_LAB`).

## Tests

- `tests/unit/demo-scenes/registry.spec.ts` — registry ids unique, kebab-case,
  every entry has Component + title; index/`[scene]` resolve helpers return
  null for unknown ids.
- Scene components are motion-visual — covered by tsc + the motion-lab-style
  eyeball (vision-verify optional post-deploy; primary consumer is Max
  recording locally). No renderToString specs for framer components (matches
  existing repo practice for magic/*).

## Verification

verify-runner (six checks; no migrations/deps/env). GATE 2 = Max. Post-merge:
Max sets `SF_MOTION_LAB=1` locally (or it's already set from the motion-lab
work), opens `/demo-scenes`, records. Post-deploy nothing is publicly
reachable without the flag.
