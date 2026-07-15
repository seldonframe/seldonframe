# Decision log

Written by the `/reflect` skill (`.claude/skills/reflect/`). One line per decision.
Type-1 decisions also get a full entry file: `docs/decisions/YYYY-MM-DD-<slug>.md`.

**Status values:** `open` (outcome pending) · `hit` (outcome ≈ expected) ·
`miss` (outcome diverged — note why) · `moot` (overtaken by events).

Every reflect run starts by scanning this table for past-due `review-by` dates
with status `open`, and surfaces them for calibration review.

| Date | Decision | Call | Type | Expected outcome | Review-by | Status | Agreed? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15 | Wire /reflect into ship-feature's brainstorm phase vs keep standalone | Keep standalone; automate only on evidence | T2 | Manual usage over ~5 features shows where reflect earns its keep; no missed-lens regrets | 2026-08-15 | open | new |
| 2026-07-15 | Greenlight never-fail-compile spec (draft-and-approve + autonomy score) | Approve + build after adding draft-filing dedupe/cap to §5 | T2 | Amended spec builds clean; live smoke shows drafts pass the copy-paste bar; no draft-spam incidents | 2026-08-15 | open | yes |
| 2026-07-15 | Does /reflect beat ad-hoc deciding — keep trusting its calls? | Keep using; judge by the scoreboard, not the vibes | T2 | By 2026-09-15: >=5 entries resolved honestly (hit/miss marked), >=1 decision materially changed by a reflect, review-debt check never skipped | 2026-09-15 | open | yes |
| 2026-07-15 | Repo adoption upgrades + does reflect genuinely help builders? | Shipped LICENSE/CONTRIBUTING/example/first-10-min; mechanism helps (~80%), activation is the real risk | T2 | Within 30 days of posting: >=1 unprompted "it caught X" reply or issue, >=25 stars | 2026-08-15 | open | yes |
| 2026-07-15 | Dark-flag queue: ~15 built features behind unflipped flags | Flip-or-kill policy + one triage session this week | T2 | Within 2 weeks: >=4 flags flipped or killed; every new dark flag gets a logged flip-review date | 2026-07-29 | open | new |
| 2026-07-15 | Reflect output quality: consultant, not cofounder (Max critique) | Shipped disagreement contract: beat-it rule, agreement telemetry, stakes line, voice, PATTERNS.md | T2 | Trailing agreement rate <70% by 09-01 and outputs stop reading flat to Max | 2026-09-01 | open | yes |
| 2026-07-15 | Wedge: adopt positioning + 10-close sprint + freeze (doc §7) | Adopt all 3, but priority #1 = rung 1: A2P today, 10 prospects in 48h, first close attempt in 14d; freeze gets logged enforcement | T1 | A2P resubmitted <48h; first close attempt <14d; agencies-attach-2-in-30d tripwire stands | 2026-08-15 | open | no |
| 2026-07-15 | Distribution allocation next 2-4 wks (Max hours) | Scoreboard first, post ready content in a 2h box, record first 2 /best YouTube videos, closes stay #1, no new channels, blitz stays gated | T2 | By 07-29: funnel report read weekly, 2 videos live on /best pages, reflect content posted, zero new channels started | 2026-07-29 | open | no |
| 2026-07-15 | Reverse-engineer superpowers virality into reflect | Steal enforcement devices (red-flags table, gates, proactive trigger, reflect-review ritual, methodology manifesto); do NOT copy nagging omnipresence; scoreboard stays the moat | T2 | By 08-15: changes shipped; repo stars/installs measurably above pre-change trend; zero "it nags" complaints | 2026-08-15 | open | yes |
