# Research fan-out rate-limit storm

**The problem, in one line.** Two research subagents dispatched in parallel each spawned ~5-10 of their OWN sub-agents, and the whole tree (≈20 concurrent agents) died with "Server is temporarily limiting requests · Rate limited" — losing all results except one.

**The approach that works.**
1. Research subagent prompts MUST include: "Do NOT spawn sub-agents or delegate; run your searches yourself, sequentially."
2. For a research task needing fewer than ~10 queries, run WebSearch inline in the main loop instead of dispatching at all — synthesis stays in one context and there is no fan-out to storm.
3. When a fleet dies rate-limited, do not immediately re-dispatch the fleet; wait for the limiter to cool and run the queries sequentially yourself.

**Judgment calls.** We did NOT retry the agent tree (a second storm would burn more of the window); the one surviving report (Shopify) was kept and the rest re-researched inline. We did not add a global "never delegate" rule — delegation is right for large independent workloads; the rule is scoped to research prompts where each unit of work is one HTTP call.

**The reusable rule.** A subagent brief that involves web research must explicitly forbid delegation; the dispatcher — not the subagent — decides the parallelism.
