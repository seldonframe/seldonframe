# Clock-rotted test fixtures — frozen dates + a real-clock cutoff

## The problem, in one line
Booking-availability unit specs failed "identically on certain days" on main
CI with no code change — every slot-expecting assertion red, every
empty-expecting assertion green.

## The approach
1. Read the failing spec first. The fixtures were FROZEN calendar dates
   (2026-07-01…2026-07-06) — that alone is not a bug.
2. Grep the code under test for `new Date()` / `Date.now` — found
   `generateCandidateSlots(policy, dayISO, new Date())` at three call sites
   in `packages/crm/src/lib/agents/tools.ts`, and the policy filter drops any
   slot earlier than `now + leadTimeHours` (leadTimeHours default 0 still
   drops PAST slots).
3. Diagnosis: the moment the real calendar passed the fixture dates, all
   fixture slots became "in the past" and were filtered. The failure pattern
   (slots-expected fail, empty-expected pass) confirms it without running
   anything.
4. Fix at the seam the file already advertises: the tool takes an optional
   `deps` object ("DI over module mocking" — stated in the spec header). Add
   `now?: () => Date` to the deps type, default `() => new Date()`
   (production byte-identical), use it at all three call sites.
5. In the spec, pin `const FROZEN_NOW = () => new Date("2026-06-28...")` —
   a date BEFORE every fixture — and pass it in every deps object.
6. Reproduce the failure before the spec change (the deps.now addition is
   inert until a test passes it), then verify 7/7 green.

## Judgment calls
- Did NOT use `node:test` `mock.timers` to freeze the global Date: the repo's
  stated convention is dependency injection over global/module mocking, and
  the pure function (`generateCandidateSlots`) already took an injected `now`
  — only the tool layer hardwired the clock. Extend the seam, don't mock.
- Did NOT make fixtures relative to the real clock ("next Friday from now"):
  that keeps tests day-dependent (walk-horizon and weekday assertions shift
  meaning) and makes failures irreproducible. Frozen fixtures + frozen clock
  is strictly more deterministic.
- Kept `FROZEN_NOW` a shared const with a comment naming the rot mechanism,
  so the next fixture added to the file gets pinned by default.

## The reusable rule, one line
A test that mixes frozen calendar fixtures with code reading the real clock
is a time bomb — always inject the clock through the existing deps seam and
pin it earlier than every fixture date.
