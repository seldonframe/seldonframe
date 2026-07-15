# Dark-flag triage — 2026-07-15 (dogfood run 1 artifact)

From the dark-flag-queue reflect (LOG.md 2026-07-15, review-by 07-29). Census:
20 real boolean feature flags on main (52 SF_* identifiers total; rest are config).
Dates = first commit touching the flag on main. ⚠️ Runtime (Vercel env) state
NOT verifiable from this machine — "verify env" means check Vercel → crm project
→ env vars before acting. Sorted oldest-dark first.

**2026-07-15 CORRECTION (same day):** two rows below were wrong — the MEMORY INDEX was
stale while detail files had flip receipts. WIN_LADDER + WEB_UNGATED_BUILD are ON.
Lesson: trust detail memories over index lines; verify env before acting on any row.

| Flag | On main since | Days | Blocker (from memory) | Triage call |
| --- | --- | --- | --- | --- |
| SF_PARALLEL_ENHANCE | 05-12 | 64 | none recorded | verify env; if ON → delete flag (cleanup); if dark 64d → flip or kill |
| SF_GROUND_RULES | 06-26 | 19 | none recorded | verify env → flip or kill |
| SF_ADAPTIVE_RUNTIME_MODEL | 06-27 | 18 | none recorded | verify env → flip or kill |
| SF_MARKETPLACE_BILLING | 06-28 | 17 | none recorded | verify env → flip or kill |
| SF_VOICE_MANAGED | 07-01 | 14 | A2P campaign (EXTERNAL, real) | keep dark; review at A2P resolution |
| SF_DEPLOY_ENABLED | 07-01 | 14 | none recorded (deploys work in prod?) | verify env — likely already ON → delete from queue |
| SF_OAUTH_ENABLED | 07-03 | 12 | none — memory says "⏳ flip" | **FLIP** (top candidate, no recorded blocker) |
| SF_WEB_UNGATED_BUILD | 07-03 | — | **CORRECTED: ON since 07-08** (wedge doc update block) | remove from queue; weekly funnel report is the follow-through |
| SF_REFERRALS_ENABLED | 07-03 | 12 | unknown | 30-min investigate → flip or kill |
| SF_AGENT_TASTE_MODE | 07-03 | 12 | unknown | 30-min investigate → flip or kill |
| SF_WIN_LADDER | 07-04 | — | **CORRECTED: ON since 07-04** (stale index; detail memory has flip receipt) | remaining: calendar-push smoke + $29 checkout env |
| SF_SIMPLE_HOME | 07-05 | 10 | fresh-claim smoke | run smoke → flip |
| SF_VISION_VERIFY | 07-05 | 10 | none hard; internal quality gate, caught 2 real bugs | **FLIP** (zero user-facing risk) |
| SF_AUTOPAY_CONSOLE | 07-08 | 7 | flip drill | do drill → flip (agency-tier selling point) |
| SF_USAGE_CAP_PAUSE | 07-08 | 7 | none recorded (caps/notify already live) | one cap-pause smoke → flip |
| SF_TIER_LADDER | 07-08 | — | LIVE per memory | verify ON → remove from queue |
| SF_RECORD_TO_AGENT | 07-10 | — | ON per memory (live 07-10) | remove from queue |
| SF_AGENT_LIFECYCLE | 07-11 | 4 | lifecycle smoke | run smoke → flip |
| SF_MOTION_LAB | 07-13 | 2 | Max taste pass (dev surface) | schedule the taste pass; dark is fine |
| SF_DRAFT_APPROVALS | 07-15 | 0 | spec §8 rollout: live smoke then flip | follow spec (dedupe amendment VERIFIED in: agent_action_drafts_pending_step_uniq) |

**The one-sitting plan:** (1) pull Vercel env once, mark actual ON/dark states;
(2) flip the three no-blocker flags (OAUTH, WEB_UNGATED_BUILD, VISION_VERIFY);
(3) run the three cheap smokes (WIN_LADDER, SIMPLE_HOME, USAGE_CAP_PAUSE) and
flip on green; (4) 30-min investigate the four unknowns, flip or kill;
(5) going forward: every new dark flag gets a LOG.md row with a flip-review date
at merge (the policy from the reflect).
