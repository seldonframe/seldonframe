# When the UI and the user disagree, read the production row

**Problem, one line:** An operator reported "the agent said it succeeded but nothing happened" (2026-07-11, supervised runs) — twice in one evening, with the UI telling a different story each time.

## The approach
1. Do NOT debug the UI first. Query the durable record directly (Neon MCP `run_sql` against the prod table — here `supervised_runs`: status, summary, `jsonb_array_length(action_log)`, the log itself).
2. Compare THREE stories: what the user observed (their inbox), what the UI showed (their screenshot), what the row says. Any two disagreeing localizes the bug in one step:
   - Row says "0 actions + succeeded" while user saw nothing → the VERDICT logic lied (success derived from "turn completed").
   - Row says "4 actions + rich summary" while the UI showed "no summary" → the DISPLAY pipe dropped evidence (result type never carried the log fields).
3. Pull the platform request log for the same window (Vercel log export, filter POSTs + error levels + durations) — it exposed the third layer nobody suspected: 504s at exactly 300s and a queue of frozen actions behind them.
4. Only then open the code, going straight to the seam the row implicated.

## Judgment calls
- Did NOT reproduce locally first — prod rows were already the reproduction, and local repro of an OAuth-tool + after() flow would have cost hours for less certainty.
- Did NOT trust the agent's own summary text as evidence in either direction — words are the least reliable layer; the action log and the user's inbox are the reliable ones.
- Did NOT patch the UI symptom on incident #1 — the row proved the verdict itself was wrong, one layer deeper.

**Reusable rule:** the durable row is the arbiter between the user's story and the UI's story — query it before touching code; whichever of the two it contradicts is where the bug lives. (Codified as tasks/lessons.md L-33.3.)

Related: `docs/learnings/2026-07-12-fix-that-arms.md`, memory `record-to-agent` (verdict-paradox pair), tasks/lessons.md L-33.
