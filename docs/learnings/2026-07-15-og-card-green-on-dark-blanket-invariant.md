# OG cards: palette token collision (green === dark) and the blanket visibility invariant

## The problem, in one line

After the forest rebrand set `OG_COLORS.green = #1F2B24` — byte-identical to `OG_COLORS.dark` — every element styled `green` on a dark `/api/og` card (competitor names, kickers, taglines, arrows, the accent bar, the brand tile, pill fills) rendered invisibly on live SEO/social images, and no test or type check could notice.

## The approach

1. **Cherry-pick the sibling fix first.** A one-element fix for the same root cause (the tool-card hook, commit `245ec0c6b`) already existed on another branch with the test helpers (`collectTextNodes` / `rootBackground`). Cherry-picking it (identical patch-id ⇒ git dedupes when both branches merge) meant building on its helpers instead of conflicting with them.
2. **Fix by surface, not by element.** Instead of recoloring eight call sites ad hoc, apply the rebrand's own stated rule — forest on light surfaces, cream on dark — mechanically: primary accent text on dark → `paper #F6F2EA`; secondary/kicker accents → `sand #D8CFBE` (a tone already in the file as the light-pill border, so no new hue enters the brand); shared chrome (`AccentBar`, `BrandMark` tile, filled `Pill`) takes an `onDark` prop and flips its fill with the surface.
3. **Turn the one-element regression test into a blanket invariant.** Extend the pure element-tree walker to track the *nearest ancestor* `backgroundColor` (so pill text is judged against the pill's own fill, not the card), add a fill walker for opaque fills, and assert over ALL seven cards: no text node and no opaque fill may equal the surface directly behind it.
4. **Mutation-test the invariant.** Re-point one accent back at `green` and confirm exactly one failure; restore. A visibility invariant that never failed is untested.
5. **Render + vision-verify before settling.** Drive the real `ImageResponse` path (same fonts, same components) from a scratch script to produce the seven PNGs, eyeball them, then dispatch an independent vision-grader with an explicit rubric (visibility at ~240px, hierarchy, brand coherence). This is what makes a brand-sensitive color choice safe to make autonomously.

## Judgment calls

- **Did NOT change `OG_COLORS.green` itself.** Green is correct on light surfaces (BestCard) and as the light-card fill; the bug was *usage on dark*, so the fix is surface-awareness, not a token change that would re-litigate the settled rebrand.
- **Did NOT introduce a new hue.** Max rejected teal and emerald; every accent stays in the cream/sand family already present in the file. Hierarchy was recovered with *two tones of cream* (paper primary, sand secondary), not a new color.
- **Did NOT test colors by hex-listing.** The invariant is structural ("text ≠ surface behind it"), so any future palette change that reintroduces a collision fails the suite without the test knowing any specific hex.
- **Dead end worth recording:** used `git checkout -- <file>` to undo a sed mutation during mutation-testing — it restored HEAD and wiped all uncommitted fix edits, forcing a full re-apply. Commit (or stash) BEFORE mutating source for a mutation test.

## The reusable rule, one line

When two palette tokens become equal, grep every use of each and add a structural visibility invariant (foreground ≠ nearest background, walked over the real element tree) — and always commit before mutation-testing, because the natural "undo the mutation" command is `git checkout --`, which also destroys uncommitted work.

Related: memory `seldon-rebrand-forest` (the rebrand that caused the collision), memory `vision-verify` (the render → vision-grade gate used here), `docs/learnings/` sibling note in commit `245ec0c6b`'s branch if it lands one.
