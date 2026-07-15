# Invisible ≠ missing: diagnose "text doesn't show" by color equality, not data flow

## The problem, in one line
The live `/api/og?kind=tool` Open Graph image showed no hook text regardless of
the `?hook=` query param — it looked like the param was being dropped.

## The approach
1. Trace the data flow BEFORE touching anything: route
   (`packages/crm/src/app/api/og/route.tsx`) parses + clamps `hook`, passes it
   to `ToolCard` (`packages/crm/src/lib/seo/og-card.tsx`), which clamps again
   and renders it. Data flow was fully intact — so stop hunting for a dropped
   param.
2. When the data provably reaches the render, the next suspect is
   PRESENTATION: check the style values on the rendered node against its
   container. Here `color: OG_COLORS.green` (#1F2B24) sat on
   `backgroundColor: OG_COLORS.dark` (#1F2B24) — byte-identical. The text was
   drawn, in background-colored ink.
3. Confirm WHERE the equality came from with `git log -S'"#1F2B24"'` on the
   file: a brand rebrand commit changed `green` from emerald #059669 to the
   logo's deep forest #1F2B24 — which happened to equal the existing `dark` —
   without applying the rebrand's own on-dark rule ("forest on light surfaces,
   cream on dark").
4. Pin the regression with a test that asserts VISIBILITY, not presence: walk
   the pure element tree (the card layouts are hook-free function components,
   so `type(props)` expands them without a DOM), collect each text node's
   inherited `style.color`, and assert hook color ≠ card `backgroundColor`.
   A presence assertion would have passed throughout the bug's whole life.
5. Fix minimally at the reported site (hook → `OG_COLORS.paper`), leave a
   CAUTION comment at the palette (the trap's source), and file the sibling
   occurrences (other cards use green-on-dark too) as a separate task instead
   of sweeping them into this change.

## Judgment calls
- Did NOT change `OG_COLORS.green` globally: green is correct as a fill and on
  light surfaces (BestCard text, pills, brand tile on paper) — only
  green-as-text-on-dark is broken. A global change would have "fixed" the bug
  by breaking the light cards.
- Did NOT fix the other five affected card elements in the same commit even
  though it's the same root cause: accent choice on dark cards is
  brand-sensitive (two previous greens were rejected by the founder), so that
  pass needs a visual check, and the task explicitly asked for minimal blast
  radius on a live endpoint. Spawned a follow-up task naming every affected
  element instead.
- Did NOT add the blanket "no text node may match its background" invariant to
  the test yet — it would fail on the not-yet-fixed sibling cards and block
  this fix; it belongs in the follow-up.
- Trusted code reading + git evidence over reproducing the live PNG render:
  color equality is deterministic; a satori render would have added cost
  without adding proof.

## The reusable rule, one line
When rendered output "doesn't show" but the data flow checks out, diff the
foreground style against its container before suspecting the data — and after
any palette/rebrand sweep, grep for the new hex used as BOTH a text color and
a background, because equality there is silent invisibility that presence
tests never catch.
