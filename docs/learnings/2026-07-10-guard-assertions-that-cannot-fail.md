# A guard captured after the event it guards is a test that cannot fail

## The problem, in one line
Rot-proofing a registry-isolation invariant ("global archetype count remains
6" — broken when archetype #7 landed) produced a replacement that could never
fail: a snapshot of the registry keys taken AFTER the import it was supposed
to police.

## The approach
1. The rotted original: 4 specs asserted `Object.keys(archetypes).length === 6`
   to prove a workspace-scoped HVAC archetype never leaks into the global
   registry. Any legitimate registry growth breaks all 4 (and did).
2. First rewrite (wrong): `const SNAPSHOT = Object.keys(archetypes).sort()` at
   module top, then a test asserting the registry still deep-equals SNAPSHOT.
   Looks airtight — but the HVAC module is imported ABOVE the snapshot line,
   so an import-time leak is already IN the snapshot; and nothing mutates the
   registry between module evaluation and the test body. The assertion
   compares a value to itself. An independent reviewer caught this; the
   maker did not.
3. Correct rewrite: assert the things that carry meaning by NAME —
   (a) the leaked-id check `archetypes["hvac-..."] === undefined` (catches
   import-time leaks of the archetype under test), and (b) a named-presence
   superset check that each of the 6 original baseline ids is still present
   (catches accidental removal, survives unlimited registry growth).
4. Litmus test applied before shipping: "describe the code change that makes
   this assertion fire." If no such change exists, the test is decoration.

## Judgment calls
- Did NOT pin the full expected key list (the 7 current ids): that is the
  same count-rot bug wearing a different shirt — archetype #8 breaks it again.
- Did NOT keep the snapshot test alongside the named checks "for extra
  safety": a test that cannot fail is not safety, it is noise that erodes
  trust in the suite.
- Kept the invariant in every spec file (4× duplication of BASELINE_IDS)
  rather than extracting a shared helper — these specs each guard their own
  archetype's isolation and must stay independently runnable; a helper
  coupling them is the Wrong Abstraction for a 6-line list.

## The reusable rule, one line
Before committing any invariant test, name the concrete regression that would
make it fail — if the guarded event (an import, a registration, a write)
happens before the guard captures its baseline, the test guards nothing.
