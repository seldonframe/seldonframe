# Theme tokens have ROLES: an inverting token on a theme-invariant surface flips it wrong

## The problem, in one line
In dark record mode the landing's final-CTA section rendered as a light parchment band on the dark page — caught only by the vision gate (every unit test and grep gate was green).

## The approach
1. During a light↔dark token migration, classify each token by ROLE, not just by color value. `--lp-cta-bg` was defined as an INVERTING pair (light mode: deep green `#1F2B24` for buttons on parchment; dark mode: parchment `#F6F2EA` for buttons on near-black). Inversion is correct for BUTTONS — a light button pops on a dark page.
2. The final-CTA *section slab* also happened to be `#1F2B24` in light mode, so the mechanical sweep mapped it to the same token — and in dark mode the whole slab flipped to parchment. Same source hex, opposite intended behavior.
3. The fix is a role-named invariant pair: `--lp-cta-slab` / `--lp-cta-slab-ink` declared with IDENTICAL values in both theme blocks (deep green / light text), with a comment stating why it exists ("inverting --lp-cta-bg is for buttons"). The slab's children (headline, fine print, and the button — inverted *relative to the slab*) remap accordingly.
4. Detection: this class of bug is invisible to text-based gates (the grep says "no raw hexes", the tests say "copy unchanged") — only a rendered dark-mode screenshot shows it. Budget a vision pass for any theme-flip work.

## Judgment calls
- Did NOT keep the slab's original hexes as literals to dodge the "no raw hex" grep — that trades one invariant (token-native styling) for another (correct color); a new named token satisfies both.
- Did NOT change `--lp-cta-bg` itself — nav, footer, and hero pill buttons rely on its inversion and were correct; the fix isolates the exception instead of redefining the rule.
- A clue was available earlier and missed: the slab's sage-green eyebrow `rgba(111,194,143,…)` was left literal precisely because "it sits on a theme-invariant deep-green slab" — the reviewer wrote that sentence while the slab itself was mapped to an inverting token. When a rationale asserts a surface is invariant, check that its background token actually is.

## The reusable rule, one line
When migrating hardcoded colors to theme tokens, map by the element's ROLE (inverting button vs invariant slab vs adaptive surface), never by matching hex values — and vision-gate every theme flip, because role-misuse renders green in every text-based check.

Related: `docs/learnings/2026-07-13-host-spoof-proxy-kills-hydration.md` (how that vision gate ran), memory `dual-path-landing-record-mode`.
