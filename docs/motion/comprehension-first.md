# Comprehension-first motion — the rubric

This is the one page every animation on SeldonFrame surfaces (marketing,
guides, tools, dashboard) is judged against. Source: `docs/superpowers/specs/2026-07-13-motion-foundation-marketing-design.md`
§3. If a proposed animation doesn't pass the kill rule below, it doesn't
ship — no exceptions for "it looked cool in the demo."

## The kill rule

**Every animation must name the one concept, step, or state it makes
clearer. If the honest answer is "it looks cool," it is cut.**

Before adding any animation, write down the single sentence a viewer
should understand *because* of the motion — not despite it, not in
addition to it. "This beam shows SF pushing data outward to the client's
tools, not pulling through middleware" is a reason. "It adds some energy
to the hero" is not. When Slice 1 (marketing) was scoped, this rule cut
more candidate components than it kept — `scroll-progress`, `highlighter`,
`file-tree`, `dock`, and most of `flickering-grid` / `animated-shiny-text`
were deferred or capped to a single low-opacity accent precisely because
a landing page couldn't name a concept they clarified. That's the rule
working as intended, not a compromise.

The static state is the real design. Motion is an enhancement layered on
top of a UI that already reads correctly with zero motion — never the
thing carrying the meaning by itself.

## The guardrails (non-negotiable, every animation)

- **Complete, correct static state.** The reduced-motion / no-JS render
  is not a degraded fallback — it is the actual design, fully legible on
  its own. Build the static state first; add motion after.
- **Honors `prefers-reduced-motion: reduce`.** No motion plays; the
  static state shows instead. This is a hard OS-level user preference,
  not a nice-to-have.
- **No CLS.** Animations never shift layout. Animate `transform` and
  `opacity` only — both are GPU-composited and never trigger reflow.
  Never animate `width`, `height`, `top`, `left`, `margin`, or anything
  that moves other elements.
- **Below-the-fold motion lazy-mounts.** Use an IntersectionObserver
  (or `whileInView`) so offscreen animation never runs before it's
  visible. Nothing burns cycles or battery off-screen.
- **Works in both landing modes.** Light build and warm-dark record,
  driven by the shared `--lp-*` tokens. An animation must never fight
  the in-place mode flip — it should just re-theme with it.

## Timing tokens

Read `packages/crm/src/components/motion/motion-tokens.css`, imported at
the route level (same pattern as `landing-theme.css`). Nothing hardcodes
milliseconds:

- `--motion-fast: 180ms` — micro-interactions (hover, focus, toggle).
- `--motion-base: 280ms` — standard transitions (reveal, fade, slide-in).
- `--motion-slow: 420ms` — larger compositional moves (section-level,
  multi-element sequences).
- `--motion-ease` — the default ease-out-ish curve for most motion.
- `--motion-ease-inout` — for motion that needs a symmetric in/out feel
  (e.g. looping or back-and-forth motion).

All three durations collapse to `0ms` under `prefers-reduced-motion:
reduce`, so components that read the tokens get reduced-motion behavior
for free without a separate code path.

## How to add a new animation (checklist)

1. Name the one concept it clarifies — if you can't, stop, it's cut.
2. Build the static state first; confirm it's correct with zero motion.
3. Animate `transform`/`opacity` only, timed from the `--motion-*`
   tokens above — never a hardcoded duration or a new easing curve.
4. Verify it respects `prefers-reduced-motion: reduce` and, if
   below the fold, lazy-mounts via `whileInView`/IntersectionObserver.
5. Check it in both landing modes (light build + warm-dark record) and
   confirm it doesn't fight the mode flip.
6. Add it to `/motion-lab` (dev-only gallery) with its labelled
   comprehension purpose so it's reviewable and becomes part of the
   permanent regression catalog.

Future slices (guides, tools, dashboard) inherit this doc as-is — don't
fork it per surface. If a surface needs a rule this page doesn't cover,
extend this page rather than writing a competing one.
