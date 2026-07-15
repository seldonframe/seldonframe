# Plan — demo scenes (recordable animation stage)

Spec: `docs/superpowers/specs/2026-07-14-demo-scenes-design.md`
Worktree: `.claude/worktrees/demo-scenes` · branch `feature/demo-scenes` (off main @ `e5bd50728`)

Commit per task. Before Task 1: read `app/(dev)/motion-lab/page.tsx` +
`motion-lab-client.tsx` fully (gating, CSS imports, metadata idiom) and skim
`components/ui/animated-list.tsx`, `components/ui/magic/animated-beam.tsx`,
`components/ui/magic/terminal.tsx`, `components/ui/number-ticker.tsx`,
`components/landing/edit-by-chat-demo.tsx` — copy their conventions
(forceStatic / reduced-motion idiom, token usage) rather than inventing.

## Task 1 — registry + routes (+ registry spec, TDD)

- `components/demo-scenes/registry.ts` — `DEMO_SCENES: { id, title, blurb }[]`
  + `getDemoScene(id)`. Component lookup lives in a separate
  `components/demo-scenes/scene-components.tsx` map (client) so the registry
  itself stays server-safe for the spec.
- `tests/unit/demo-scenes/registry.spec.ts` — unique kebab-case ids, every
  registry entry has non-empty title/blurb, `getDemoScene("nope")` → null,
  the component map covers exactly the registry ids.
- `app/(dev)/demo-scenes/page.tsx` — flag gate (same strict `SF_MOTION_LAB`
  check as motion-lab), noindex metadata, route-level CSS imports, index
  cards linking to `/demo-scenes/<id>`.
- `app/(dev)/demo-scenes/[scene]/page.tsx` — same gate + noindex;
  `notFound()` on unknown id; renders `<SceneStage>` (client) with the id.
- `components/demo-scenes/scene-stage.tsx` — full-viewport stage host:
  100svh, token background, `key`-bump Restart, `?loop=1` sync, light/dark
  via `data-mode="record"` on the stage root, controls cluster bottom-right
  that fades after 3s idle (mousemove resets). Placeholder scene body for
  this commit (Task 2+ fill the scenes) — but ship ONE trivial scene inline
  so the route is demonstrably working (e.g. stat-payoff early).

## Task 2 — list + beam + ticker scenes

- `booking-cascade.tsx` (AnimatedList; toast-style cards, vendored icons via
  next/image or plain img from /brand/integrations/, 1.2s stagger, loop with
  hold+fade reset)
- `calendar-connected.tsx` (AnimatedBeam between Seldon mark and
  google-calendar.svg; "Connected" spring pill; booking card slide-in; pulse)
- `stat-payoff.tsx` (4 NumberTickers + AnimatedShinyText sub-line; loop
  re-counts via key bump on an interval when loop is on)

## Task 3 — chat + phone + confetti + terminal scenes

- `grounded-chat.tsx` — phase machine per edit-by-chat-demo's idiom (typing →
  message → reply → confirm → hold → reset). Bubbles: customer light card /
  agent forest bubble, larger type (video-legible at 1080p).
- `sms-phone.tsx` — pure-CSS phone frame + arriving iMessage-style bubble +
  subtle shake keyframe. No deps.
- `live-confetti.tsx` — headline + ~48 span particles; particle transforms
  from a module-level seeded array (deterministic, no Math.random in render).
- `docker-terminal.tsx` — Terminal + TypingAnimation + AnimatedSpan lines per
  the spec copy.
- Register all seven in the registry + component map (spec updated in the
  same commit — the "component map covers registry" test forces this).

## Task 4 — reduced-motion + SSR pass

Sweep every scene: `prefers-reduced-motion` settles to final frame (use the
same hook/idiom the existing magic components use — grep for how
animated-shiny-text / flicker-grid gate motion); no window/document at module
scope; no Math.random()/Date.now() in render paths. Add whatever the sweep
finds to the scenes; re-run registry spec + tsc.

## Verify

- `node --test --import tsx tests/unit/demo-scenes/registry.spec.ts`
- tsc delta 0 vs baseline (record baseline BEFORE first change; no git stash)
- `bash scripts/check-use-server.sh src`
- No migrations, no new deps (git diff package.json must be empty)
- grep: no route.ts touched, nothing outside `(dev)/demo-scenes`,
  `components/demo-scenes/`, `tests/unit/demo-scenes/`, docs.

Then verify-runner (independent) + one reviewer pass + GATE 2 (Max merges).
