# Decision log

Written by the `/reflect` skill (`.claude/skills/reflect/`). One line per decision.
Type-1 decisions also get a full entry file: `docs/decisions/YYYY-MM-DD-<slug>.md`.

**Status values:** `open` (outcome pending) · `hit` (outcome ≈ expected) ·
`miss` (outcome diverged — note why) · `moot` (overtaken by events).

Every reflect run starts by scanning this table for past-due `review-by` dates
with status `open`, and surfaces them for calibration review.

| Date | Decision | Call | Type | Expected outcome | Review-by | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15 | Wire /reflect into ship-feature's brainstorm phase vs keep standalone | Keep standalone; automate only on evidence | T2 | Manual usage over ~5 features shows where reflect earns its keep; no missed-lens regrets | 2026-08-15 | open |
| 2026-07-15 | Greenlight never-fail-compile spec (draft-and-approve + autonomy score) | Approve + build after adding draft-filing dedupe/cap to §5 | T2 | Amended spec builds clean; live smoke shows drafts pass the copy-paste bar; no draft-spam incidents | 2026-08-15 | open |
