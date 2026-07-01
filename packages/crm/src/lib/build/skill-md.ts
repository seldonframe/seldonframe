// SKILL.md — the SeldonFrame-for-Builders funnel doc (spec 1ff09dcb, P0).
//
// `set up https://seldonframe.com/SKILL.md` is the one-command entry point for
// the agent BUILDER (indie devs / AI engineers living in Claude Code, Cursor,
// Codex). Reading this Markdown teaches their IDE agent to connect the
// SeldonFrame MCP and then build → test → list → price an agent end to end,
// never opening the dashboard.
//
// Shape is adapted from Monid's SKILL.md, but for BUILD-and-SELL (not just
// run): connect the MCP → create_agent from one sentence → run_agent_evals →
// publish_agent → set_usage_price. Pure (no I/O, no React) so it unit-tests
// with a plain string assertion and the route just serves the string. The MCP
// URL + the key path are the load-bearing facts the funnel depends on.

/** The SeldonFrame MCP server — added as a Streamable-HTTP connector in the
 *  dev's IDE. The 149-tool build/run/sell surface lives behind this origin. */
export const SKILL_MD_MCP_URL = "https://mcp.seldonframe.com/v1";

/** Where a developer mints + reveals + revokes the bearer key the MCP uses. */
export const SKILL_MD_KEYS_PATH = "/build/keys";

/** The builder entry / quickstart page (human-browsable twin of this doc). */
export const SKILL_MD_BUILD_PATH = "/build";

/**
 * Render the builder SKILL.md. Deterministic: same output every call. Kept as a
 * single template so the funnel reads as one continuous walkthrough; the tests
 * pin the load-bearing steps (MCP URL, connect, key path, build→eval→list→price,
 * the per-call example, and the "listing is free" honesty).
 */
export function buildSkillMd(): string {
  return `# Build & sell an AI agent on SeldonFrame — from your IDE

> SeldonFrame lets you **build, test, and sell an AI agent without leaving the
> editor you already live in.** Describe the agent in one sentence, run its
> evals, list it on the marketplace, and set a usage price. Listing is free —
> you only earn when someone runs it. No dashboard, no subscription, no human in
> the loop.

This file is a skill: \`set up https://seldonframe.com/SKILL.md\` and your agent
learns the whole flow below.

## Start here — you are the builder's guide

The moment you're connected, call **\`get_workspace_state\`** and read its
**\`builder\`** block. It tells you the builder's current rung on the build→sell
ladder and the ONE next action. **Follow the \`builder\` block. Ignore the
\`counts\` (contacts / bookings / deals) and the operator \`next_steps\` — those
are for SMB operators, not builders.** Your job is to help the human **build an
agent to SELL**, one rung at a time:

> **build → test → eval → list → price → observe & earn**

Move one rung at a time, narrate what each step does and what it costs or earns,
and don't touch the CRM tools unless the human explicitly asks. If
\`get_workspace_state\` returns **401**, the key didn't load into the MCP process
— tell the human to reconnect (\`/mcp\` → reconnect, or restart the IDE), then
retry.

## 1. Connect the SeldonFrame MCP

Add SeldonFrame as an MCP connector (Streamable HTTP) in your IDE — Claude Code,
Cursor, or Codex:

\`\`\`
MCP server (Streamable HTTP): ${SKILL_MD_MCP_URL}
Header: Authorization: Bearer <YOUR_KEY>
\`\`\`

Claude Code, one line:

\`\`\`bash
claude mcp add seldonframe --transport http ${SKILL_MD_MCP_URL} \\
  --header "Authorization: Bearer <YOUR_KEY>"
\`\`\`

Once connected you get the SeldonFrame build/test/run/sell tools (\`create_agent\`,
\`update_agent_blueprint\`, \`send_conversation_turn\`, \`run_agent_evals\`,
\`publish_agent\`, \`set_usage_price\`, \`tail_agent_conversations\`,
\`get_agent_metrics\`, \`list_my_listings\`, \`list_agents\`, …).

## 2. Get a key

Your \`<YOUR_KEY>\` is a SeldonFrame workspace bearer token (it starts with
\`wst_\`). Mint and reveal it once at:

\`\`\`
https://seldonframe.com${SKILL_MD_KEYS_PATH}
\`\`\`

The raw key is shown **exactly once** — store it in your secrets manager. It
encodes your workspace, so every MCP call is automatically scoped to you. Lost
it or leaked it? Revoke it from the same page and mint a new one. (First
workspace is free forever.)

## 3. Build an agent from one sentence

Just ask your agent — natural language is the input. For example:

> build me a 24/7 receptionist that answers calls, qualifies the lead, and books
> the job, then list it for $0.10 per call.

Under the hood your IDE agent calls:

- **\`create_agent\`** — turns the sentence into a full agent blueprint (surface,
  skill, tools, knowledge, guardrails, voice). One sentence in, a working agent
  out.
- **\`update_agent_blueprint\`** — refine the greeting, FAQ, tools, or guardrails.

## 4. Test it before you sell it

- **\`send_conversation_turn\`** — send the agent one live message and read its
  reply (and the tools it called). Try it like a customer before you publish.
- **\`run_agent_evals\`** — runs the agent's eval suite and returns a pass-rate
  summary with the judge's findings. Publishing a *live* agent is eval-gated, so
  fix what fails here first.

## 5. List it and set a usage price

- **\`publish_agent\`** — lists the agent on the SeldonFrame marketplace so
  buyers (and other agents over MCP) can discover and run it.
- **\`set_usage_price\`** — set how you charge. **Listing is free; this sets your
  price, it does not charge anyone.** You earn only on real, successful runs —
  SeldonFrame's only fee is a clean 5% on usage (you keep the rest), with no
  upfront cost. Models:
  - \`per_call\` — e.g. **$0.10 per call** → \`set_usage_price({ listingId, model: "per_call", amountCents: 10 })\`
  - \`per_outcome\` — e.g. **$10 per booking** → \`set_usage_price({ listingId, model: "per_outcome", amountCents: 1000, outcomeType: "booking" })\`

## 6. Observe & improve

- **\`tail_agent_conversations\`** / **\`get_agent_conversation\`** /
  **\`replay_conversation\`** — stream the logs of every real run, read a full
  transcript, or replay one to debug it.
- **\`get_agent_metrics\`** — per-agent conversations, eval pass-rate, validator
  pass-rate, and health at a glance.
- **\`list_my_listings\`** — your listings with installs, runs, and net earnings
  (after the clean 5% usage fee).
- **The Brain learns.** Every run is logged, and the eval findings plus your
  edits become lessons (\`write_brain_note\` / \`read_brain_path\`) that are
  recalled into your next \`create_agent\` — so each agent you build is a little
  smarter than the last.

## 7. Run anything in the catalog: discover → inspect → run

The same MCP key lets you RUN what's already on the marketplace — whole **agents**
AND single **tools** (1000+ connected actions) — through one consistent
flow. Every sellable thing is discovered, priced, and run the same way:

- **discover** — natural-language search → ranked results, each with its price:

  \`\`\`
  POST https://seldonframe.com/api/v1/build/discover
  { "query": "send an email to a customer", "limit": 5 }
  → { "results": [ { "id", "type": "agent"|"tool", "provider?", "name",
                     "description", "price": { "type", "amountCents" }, "score" } ] }
  \`\`\`

- **inspect** — the input schema + pricing + docs, so you know how to call it:

  \`\`\`
  POST https://seldonframe.com/api/v1/build/inspect
  { "type": "tool", "id": "GMAIL_SEND_EMAIL" }
  → { "id", "type", "name", "description", "inputSchema", "price", "docUrl?" }
  \`\`\`

- **run** — execute with structured input; get the result back inline:

  \`\`\`
  POST https://seldonframe.com/api/v1/build/run
  { "type": "agent", "id": "ace-receptionist", "input": { "message": "Do you do emergency calls?" } }
  → { "runId", "status": "completed", "output", "price",
      "billing": { "calculatedCost", "amountCents", "charged": false } }
  \`\`\`

  An agent is run by sending it a \`message\`; a tool is run with the arguments
  its \`inputSchema\` describes. **A run returns its \`calculatedCost\` (the
  cost is recorded) but is NOT charged yet — a prepaid wallet draws it down in a
  later phase.** Errors are never billed (only successful runs accrue).

---

## The one-paragraph flow

\`set up https://seldonframe.com/SKILL.md\` → add the MCP connector with a
\`wst_\` key from \`${SKILL_MD_KEYS_PATH}\` → *"build me a 24/7 receptionist and
list it for $0.10/call"* → \`create_agent\` → \`run_agent_evals\` →
\`publish_agent\` → \`set_usage_price\`. Build, test, list, price — without ever
opening a dashboard. And to USE the catalog: **discover** → **inspect** →
**run** any agent or tool, each priced, the cost recorded (not charged in P1).

Human-browsable quickstart: https://seldonframe.com${SKILL_MD_BUILD_PATH}
`;
}
