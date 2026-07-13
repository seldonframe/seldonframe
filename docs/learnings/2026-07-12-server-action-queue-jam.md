# One slow server action freezes every button on the page

**Problem, one line:** Three unrelated buttons ("Run evals", "Run it once", "Deploy for myself") all showed perpetual pending states at once (2026-07-11) — one shared cause, not three bugs.

## The approach
1. Next.js serializes Server Action requests PER BROWSER TAB: a second action clicked while the first is in flight queues client-side and shows its pending state while doing nothing.
2. One action ("Run evals" — N scenarios × multi-turn LLM) ran to Vercel's 300s function ceiling and died as a 504 ("Vercel Runtime Timeout Error"). Every subsequently clicked action sat frozen behind it; when the 504 finally cleared the queue, the next action executed minutes after its click (the prod log showed a supervised run starting 1 second after the preceding 504 — the smoking gun for queued execution).
3. Fix shape: any action that drives LLM/tool work must return immediately (create the poll-target row synchronously, return its id) and continue in `next/server`'s `after()`; the UI polls. This removes both the ceiling exposure and the queue jam in one move.
4. Every polled row needs a staleness reaper (a `running` row older than N minutes reads as failed, reconciled lazily on the poll read) — because `after()` work that dies leaves the row stranded and the poll would spin forever. Both `supervised_runs` and `eval_run_jobs` got one.

## Judgment calls
- Did NOT raise `maxDuration` and keep awaiting in-request — that fixes the 504 but keeps the queue jam and makes the button wait minutes; decoupling fixes both.
- Did NOT add a client-side poll-attempt cap as the primary fix — server-side staleness is authoritative for every future session; a client cap only helps the current one.
- Kept the app-side run timeout (240s) UNDER the 300s platform ceiling with a comment stating the constraint — an app timeout above the platform's is dead code that strands rows.

**Reusable rule:** server actions are a per-tab serial queue — any action that can exceed a few seconds must return a poll id immediately and do its work in `after()`, and every poll-target row must have a staleness reaper.

Related: tasks/lessons.md L-33 (honest verdicts), the F1 stale-run guard in `lib/agents/lifecycle/supervised-run.ts`.
