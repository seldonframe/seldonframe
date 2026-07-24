# Nine PRs in two days: teaching my AI agent to stop re-deciding

<!--
Title alternates:
A (search-first): none — this is a process/build story, no real search keyword fits. Forcing one would read as SEO-bait on a technical post.
B (feed-first, chosen): "Nine PRs in two days: teaching my AI agent to stop re-deciding"
C (contrarian one-liner): "Your AI agent doesn't need to be smarter. It needs to stop deciding twice."
Subtitle: why every AI agent action that touches the real world needs a claim ledger before it needs more intelligence.
-->

Word count target: 1,500-2,000. Source commits: PRs #128, #129, #132, #136, #140,
#142, #143, #144, #145 (2026-07-17 to 2026-07-18, origin/main). Migration:
packages/crm/drizzle/0077_replay_gate_v2.sql. Package: @seldonframe/reelier 0.2.0.
Flags: SF_DETERMINISTIC_REPLAY, SF_REPLAY_GATE_V2 (both still off in prod — see
honest limits). Supporting fact: docs/ops "deploy-prod" skill commit #141
(5 prod deploys 2026-07-18, smoke check moved from a ~35-60k-token subagent
dispatch to a 0-token Reelier replay).

===== ARTICLE BODY (paste everything between these lines) =====

Nine pull requests in two days. Not features. Plumbing. The kind nobody sees, all in service of one question: when my AI agent does the same thing it did yesterday, does it have to think about it again?

Every agent turn we ship costs a real LLM call. Same customer, same intent, same tools, same answer nine times out of ten — and I'm still paying for reasoning I already paid for once. That's the boring problem. The interesting problem showed up once I started solving it: if the agent isn't reasoning, it's replaying. And replaying something that sends an email is a different animal than replaying something that reads a database.

Here's how the week actually went.

I record every real agent run first

The first PR didn't touch replay logic at all. It just recorded. Every workflow turn the agent already runs in production gets captured as a trace — inputs, tool calls, outputs, in order. No replay yet, just observation. I built this deliberately dumb on purpose: you cannot replay a decision you never watched the agent make for real. Skipping straight to "let's guess what the agent would do" is how you ship a replay engine that replays wrong things confidently.

Traces became skills next. A skill is the compiled, deterministic version of "here's what happened last time, in a form a machine can just run." That's the L0 layer — replay-before-LLM. Before the agent burns a real model call, it checks: have I seen this exact shape of turn before? If yes, run the compiled skill. If no, fall through to the actual LLM like it always did. The fallback is not a nice-to-have, it's the whole safety model — L0 only ever replaces work that's already been proven, never guesses at new work.

The part that actually took the two days

Recording and replaying reads and lookups is the easy 80%. The next three PRs were about knowing which tool calls in a trace are safe to replay blind and which aren't. A tool that reads a calendar and a tool that sends an SMS look identical in a trace — both are just "tool call, args, result" — until you build the classifier that tells them apart. That's the tool-effect allowlist: every tool the agent can call gets tagged read or write before a trace is trusted to compile into a skill.

I found the classifier's blind spot the ugly way. Composio-routed MCP tools all come through with a server prefix on the name — `composio_gmail_send` instead of `gmail_send` — and my allowlist was matching on exact tool name. Every prefixed tool silently fell through as unclassified, which meant every prefixed write tool could have compiled into a "safe" replay skill without ever being checked. Nobody hit it in the trace data yet, which is the only reason it didn't ship as a live bug. Fixed it by normalizing the prefix before the lookup instead of teaching the allowlist every possible prefix — one function, not a growing list of special cases. That's PR #136, and it's the one commit this week I'd call a real scar: the fix is boring, the near-miss behind it wasn't.

Then trigger vars — letting a compiled skill parameterize on the parts of a turn that actually vary between runs instead of only replaying byte-identical turns — which the commit message calls "the last slice before the first production L0 replay." I like that commit message because it's honest about where we actually were: infrastructure complete, switch still off.

Why I built a claim ledger before I turned anything on

Here's the part that made me stop and change the plan. A read-only replay that's wrong just returns stale data — annoying, recoverable, nobody's hurt. A write replay that's wrong, replayed twice, sends the same email or the same SMS to a real customer twice. That is not a bug you patch after the fact. That's a trust violation you don't get to walk back.

So gate v2 doesn't touch the read path at all. It adds one thing: a skill can carry exactly one destructive step anywhere in its sequence, and that step is guarded by a claim-before-send ledger. The mechanism is almost embarrassingly simple once you see it — a Postgres table with a unique index on (skill, step, idempotency key). Claiming a send is just an INSERT. If the event gets redelivered — a retry, a duplicate webhook, a replay of a replay — the second INSERT hits the unique constraint and throws a 23505 violation. My code catches that specific error and treats it as "already sent, skip, continue." I didn't build a distributed lock. Postgres already had one sitting in the schema; I just pointed it at the right column.

The asymmetric part matters too: a divergence strictly before the destructive step still falls back to a full agentic turn, same as today. A divergence at or after the destructive step never re-executes it — it converges instead. The skill is allowed to be uncertain about everything up to the send. It is never allowed to be uncertain about the send itself.

Then I built the parts that let me trust it

A safety mechanism nobody can see is a safety mechanism nobody believes. So the last two PRs weren't about replay logic at all. One is a dashboard — org-scoped, read-only, querying measured data only, nothing synthetic in it because there's nothing to show yet at the org level worth faking. The other is a cron: if an org has an active deployment on this system and it goes quiet for more than twenty-four hours, someone gets paged. Not "check the logs if you remember to." An actual alert, because a system that fails silently is worse than a system that doesn't exist.

What the numbers actually say

Nine merged PRs, all landed 2026-07-17 to 2026-07-18. One migration, hand-written, additive-only, the house rule here being we never let drizzle-kit generate a migration blind. One real near-miss caught in code review before it became an incident. Zero production replay traffic yet — both feature flags, SF_DETERMINISTIC_REPLAY and SF_REPLAY_GATE_V2, are still off by default. That's not a soft-launch metric I'm hiding. It's the actual state, and it's the right state: the safety net had to exist completely before the switch gets flipped, not the other way around.

The one number I do have is from a different corner of the same week. The deploy skill I run five times a day now uses this same replay engine for its own smoke check — deploy, then replay a recorded "does the app still respond correctly" skill instead of dispatching a subagent to re-verify it live. That subagent dispatch cost roughly 35,000 to 60,000 tokens per deploy. The replay costs zero. Same verification, same confidence, no LLM in the loop, because the thing being checked doesn't change between deploys and there's no reason to re-derive an answer I already have.

Honest limits

I don't have a production replay-hit-rate number yet because there's no production replay yet. I don't know what fraction of real agent turns will actually compile into safe L0 skills versus fall through to the LLM every time — that's a distribution I can only measure once the flag is on. And I don't know yet what happens the first time a v2 skill's destructive step diverges for a legitimate reason, not a redelivery — the asymmetric fallback is designed for that case but it hasn't been tested against a real one. All three are next.

What's next

Turn SF_DETERMINISTIC_REPLAY on for one low-risk internal workflow first, watch the dashboard and the heartbeat actually catch something instead of staying quiet by default, then widen. The whole point of building the ledger and the dashboard and the cron before the switch was so that when something does go wrong, it's a page and a rollback, not a customer finding out first.

Steal this if you're building anything similar:

===== Copy everything between the lines =====
I'm adding replay-before-LLM to an agent that has at least one tool call with a real side effect (sends an email/SMS, writes a record, charges a card).

Before touching replay logic, help me design:
1. A trace recorder that captures real agent turns (tool calls, args, results, in order) with zero replay behavior — pure observation first.
2. A tool-effect classifier that tags every tool the agent can call as read-only or write, normalizing any tool-name prefixes (MCP server names, integration platform prefixes) before matching, not after.
3. A claim-ledger table with a unique index on (skill_id, step_number, idempotency_key), where claiming a side-effecting step is a single INSERT and a unique-constraint violation on that insert means "already executed, skip, continue" rather than an error.
4. A rule that any skill with more than zero destructive steps falls back to a full live agent turn for any divergence detected strictly before the first destructive step, and never re-executes past it.
5. A dashboard and an alert (max 24h silence) scoped to whichever org/tenant boundary the system already uses, showing only measured data.

Design the claim ledger and the effect classifier before you design anything else. The intelligence layer is the easy part to add later; the double-send is the part you can't undo.
===== Copy everything between the lines =====

If you're building agent infrastructure and want the never-lies version of this — replay only what's proven, gate what's irreversible, page a human when it goes quiet — that's the same discipline the rest of SeldonFrame runs on.

===== ARTICLE BODY (paste everything between these lines) =====

FORMATTING MAP (apply in the X Article editor; body above is paste-clean, no markdown):
- Title: as written above.
- Subtitle (editor's subtitle field): "why every AI agent action that touches the real world needs a claim ledger before it needs more intelligence."
- Bold these section-opener lines only (as headings, editor's Heading style, not manual bold):
  "I record every real agent run first"
  "The part that actually took the two days"
  "Why I built a claim ledger before I turned anything on"
  "Then I built the parts that let me trust it"
  "What the numbers actually say"
  "Honest limits"
  "What's next"
- Italicize: the sentence "The intelligence layer is the easy part to add later; the double-send is the part you can't undo." (closing line of the steal-this-prompt block, sits just above it as emphasis if the editor supports it inline — otherwise leave plain, do not force it)
- No underline anywhere.
- Cover image: docs/strategy/x-creatives/2026-07-24/diagram-reelier-pipeline.png (1500x600 — NOT YET RENDERED, see note below)
- Inline image: same diagram, placed directly after the "Why I built a claim ledger before I turned anything on" section (the mechanism it explains)

CREATIVE — GENERATED (cover + inline, same image): docs/strategy/x-creatives/2026-07-24/diagram-reelier-pipeline.html,
1500x600. Real specifics embedded: PR numbers #128/#129/#132/#136/#140/#144/#143/#145,
the Postgres UNIQUE-violation-as-lock mechanism, the "both flags still off in prod" honest
line, @themaxthule attribution. RENDER STATUS: HTML written, but `node
scripts/x-creative-shot.mjs` needs headless Chrome/Edge and this box has neither installed
(Windows-path lookup only, Linux host) — PNG not yet produced. Max: run the script on a
machine with Chrome, or say the word and a future run retries it once Chrome is available.

SUPPORTING TWEETS (paste-ready, spaced across the week this article posts):

1. day 1 evening — number hook
PASTE-READY:
```
𝗡𝗶𝗻𝗲 𝗣𝗥𝘀 𝗶𝗻 𝘁𝘄𝗼 𝗱𝗮𝘆𝘀 and the feature flag at the end of all of them is still off.

Wrote up why the safety net has to ship completely before the switch gets flipped, not after: [link]
```

2. day 3 morning — scar/insight line
PASTE-READY:
```
Found a bug where every MCP tool with a server prefix on its name could silently skip my agent's safety classifier. Nobody had hit it yet in real data. That's the only reason it wasn't already live.

One line fix: normalize the prefix before the lookup, not after. Full build log: [link]
```

3. day 5 afternoon — contrarian/value take
PASTE-READY:
```
Everyone's racing to make their AI agent smarter.

I spent two days making mine incapable of sending the same email twice, using a Postgres unique-index violation as the lock.

Boring beats smart when the mistake is irreversible: [link]
```
