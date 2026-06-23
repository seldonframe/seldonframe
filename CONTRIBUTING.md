# Contributing to SeldonFrame

Thanks for considering a contribution. SeldonFrame is built on one architectural bet — *thin harness, fat skill, antifragile to LLM improvements* — and the most valuable PRs are the ones that strengthen this pattern, not the ones that add features around it.

This guide explains how to set up the repo, where the interesting parts of the codebase live, and six concrete recipes for high-leverage contributions.

---

## Architecture orientation (read this first)

Before opening a PR, internalize the layering — it's the difference between a contribution that lands and one that gets sent back for redesign:

```
┌──────────────────────────────────────────────────────────┐
│  Operator (HVAC contractor, coach, agency, etc.)         │
└──────────────────────────────────────────────────────────┘
                          ↕  natural language
┌──────────────────────────────────────────────────────────┐
│  IDE-resident agent (Claude Code, Cursor, ...)           │
└──────────────────────────────────────────────────────────┘
                          ↕  Model Context Protocol
┌──────────────────────────────────────────────────────────┐
│  SF MCP server  ───────────────────  thin harness        │
│  140+ typed tools, workspace state, capability map       │
└──────────────────────────────────────────────────────────┘
                          ↕
┌──────────────────────────────────────────────────────────┐
│  Skill-pack registry  ─────────────  fat skill           │
│  markdown · per-archetype · runtime-composed             │
└──────────────────────────────────────────────────────────┘
                          ↕
┌──────────────────────────────────────────────────────────┐
│  Runtime (Next.js + Postgres + Vercel Workflows + ...)   │
└──────────────────────────────────────────────────────────┘
```

**The two principles every PR should respect:**

1. **Don't add intelligence to the harness.** If your PR adds a hardcoded heuristic ("if business is HVAC, use this tone"), it's probably in the wrong layer. Push the decision into a skill pack instead.
2. **Don't add capability to the skill.** If your PR adds a new TypeScript function inside a skill markdown file, it's also in the wrong layer. Markdown is for behavior; runtime is for capability. Push capability into a new MCP tool or block.

These two checks catch ~80% of misplaced PRs at design-time.

---

## The six contribution recipes

Each recipe maps to a layer in the architecture. Pick whichever matches your interest and skill.

### Recipe 1 — Add a skill pack

**Why it's high-leverage**: Skill packs are markdown. Anyone who can write a clear paragraph can ship a skill. Vertical-specific behaviors (HVAC tone, dental refusal patterns, real-estate tour scheduling) belong here.

**Where it lives**: `packages/crm/src/lib/agents/skills/<archetype>/<skill-id>.ts`

**The recipe**:

1. Pick an archetype (e.g. `website-chatbot`) and create a new file under `skills/<archetype>/your-skill-id.ts`.
2. Default-export a markdown string with sections + placeholders:
   ```typescript
   export default `## Late-night SMS posture

   When a customer messages between 9pm and 6am local time:
   - Acknowledge the hour briefly ("Got your message tonight...")
   - Confirm you'll handle it tomorrow morning
   - Don't promise a same-day response unless the operator's
     hours include that
   - Offer a callback link: {{callback_link}}
   `;
   ```
3. Register in `skills/registry.ts`: add `{ id, content, archetypes, renderVars }`.
4. Add an eval scenario in the appropriate eval suite that exercises the new behavior.
5. Run `pnpm test:eval` and verify the agent's pass rate stays ≥87.5%.

**The PR**: 1 markdown file, 1 registry entry, 1 eval scenario. ~30 lines total. Reviewer checks: does the prose teach behavior cleanly, does the eval catch regressions, does the skill respect the placeholder convention.

### Recipe 2 — Add an MCP tool

**Why it's high-leverage**: MCP tools are the surface area. Every tool is one more thing Claude Code can do for operators. Adding tools = expanding what the platform can do without writing new UI.

**Where it lives**: `skills/mcp-server/src/tools.js` (the registry) + `packages/crm/src/app/api/v1/<your-tool>/route.ts` (the handler)

**The recipe**:

1. Decide what the tool does. Naming: `<verb>_<noun>` snake_case.
2. Add the tool entry to `TOOLS` in `tools.js`:
   ```js
   {
     name: "your_tool_name",
     description:
       "One sentence explaining the tool. " +
       "USE-WHEN the operator says: '<trigger 1>', '<trigger 2>'. " +
       "Example: your_tool_name({ arg1: 'value' })",
     inputSchema: obj({ arg1: str("Description.") }, ["arg1"]),
     handler: async (a) => {
       const ws = wsOrDefault(a.workspace_id);
       return api("POST", "/your-route", { body: { ...a, workspace_id: ws }, workspace_id: ws });
     },
   },
   ```
3. Add the matching CRM route at `packages/crm/src/app/api/v1/<your-tool>/route.ts` following the pattern in any existing `/api/v1/theme/*/route.ts` (auth → resolve workspace → validate input → mutate → log → return).
4. Document the tool in `skills/mcp-server/src/welcome.js`'s `FIRST_CALL_BANNER` if it's an important capability.

**The PR**: 1 tool entry (~30 lines), 1 route handler (~80 lines), 1 paragraph in welcome.js. Reviewer checks: USE-WHEN triggers are real natural-language phrases, the handler validates input strictly, the route logs the event for observability.

### Recipe 3 — Add a block component

**Why it's high-leverage**: Block components are what end-customers see. Each new block is a new layout pattern operators (and Claude Code) can compose into pages.

**Where it lives**: `packages/crm/src/components/landing/sections/<block-id>.tsx` + `packages/crm/src/components/landing/block-registry.tsx`

**The recipe**:

1. Create the React component at `sections/<block-id>.tsx`. Server component by default. Receives a typed content prop.
2. Add the type to `sections/types.ts` — the content shape must be JSON-serializable.
3. Register in `block-registry.tsx` with: `type`, `label`, `category`, `grapesId`, `grapesContent` (HTML-stringified default), `render` (returns the React component).
4. Wire motion primitives where they help — `<RevealOnScroll>` is automatic at the renderer level; `<Stagger>` on grids, `<HoverLift>` on cards, `<Counter>` on stats are opt-in inside the component.
5. Add a unit test verifying it renders without crashing for empty / minimal content.

**The PR**: 1 React component (~40-80 lines), 1 type, 1 registry entry, 1 test. Reviewer checks: respects theme tokens (`bg-card`, `text-foreground`, etc.), works server-rendered, no client-only code at the top level.

### Recipe 4 — Tune motion primitives

**Why it's high-leverage**: Motion primitives are the polish layer. They're what makes a SF site feel like Linear vs feel like a 2018 template. Each primitive should be a thin wrapper around `motion/react`.

**Where it lives**: `packages/crm/src/components/motion/primitives.tsx`

**The recipe**:

1. Identify the missing primitive — e.g. `<RotateOnScroll>`, `<MagneticImage>`, `<TypewriterText>`.
2. Add the component below the existing 8. Match the pattern: `"use client"`, sensible defaults, configurable via props.
3. Export from `index.ts`.
4. Document in the `PHILOSOPHY` block at the top of `primitives.tsx`.
5. Optionally wire into a specific block where it makes the most difference.

**The PR**: 1 new primitive (~40 lines), exports, philosophy update. Reviewer checks: respects `prefers-reduced-motion`, has reasonable defaults, doesn't force re-renders.

### Recipe 5 — Add a vertical template (Soul)

**Why it's high-leverage**: A vertical template = an instant Business OS for a new industry. Wedding photography, dog walking, executive coaching, indie consultancies, each with vertical-tuned chatbot tone, custom CRM fields, and pipeline stages.

**Where it lives**: Soul templates are stored in the database, not source. But the seed file at `packages/crm/src/lib/seed/soul-templates.ts` (or equivalent — look for the existing 6 templates) is what ships.

**The recipe**:

1. Pick a vertical you know well. The richer your domain knowledge, the better the template.
2. Define the Soul: name, archetype, greeting, refusal rules, FAQ template, pricing template, custom CRM fields, pipeline stages, default booking types.
3. Write 8 eval scenarios specific to your vertical (typical customer questions, edge cases, compliance constraints if any).
4. Add to the seed file.
5. Test by creating a workspace from the new template and walking through the booking + chatbot flow.

**The PR**: 1 Soul template (~100 lines), 8 eval scenarios. Reviewer checks: terminology matches the vertical, refusal rules are reasonable, eval scenarios catch real failure modes.

### Recipe 6 — Improve the eval gate

**Why it's high-leverage**: The eval gate is the safety net. Every improvement there raises the floor for every agent on the platform. This is the most architecturally sensitive area — sloppy changes here have downstream effects everywhere.

**Where it lives**: `packages/crm/src/lib/agents/eval-runner.ts` + `fallbacks.ts`

**The recipe**:

1. Identify a gap — e.g. a critical-fail validator that doesn't yet exist (no_unauthorized_discount_offered, no_pii_in_logs).
2. Add the validator: a deterministic function (not LLM-as-judge) that scans the agent's response.
3. Add a fallback registry entry in `fallbacks.ts` mapping the validator to a correction prompt + final-fallback text.
4. Wire into the runtime so the validator runs after every agent turn.
5. Test with a synthetic conversation that triggers the validator and confirm the runtime regenerates correctly.

**The PR**: 1 validator (~30 lines), 1 fallback entry, 1 runtime wire-up, 1 test. Reviewer checks: the validator is deterministic, the fallback prompt teaches the right behavior without leaking the rule, telemetry captures the regen rate.

---

## Build & sell agents (not a PR — a business)

The six recipes above contribute *to the platform*. This one is about building *on* it: the agents you create are yours to **sell or rent** on the [Agent Marketplace](https://app.seldonframe.com/marketplace), and you keep the upside.

You don't touch this repo to do it. Build in the product:

1. **Describe the agent in one sentence** at [`/marketplace/build`](https://app.seldonframe.com/marketplace/build) — SeldonFrame generates the bundle (skill, tools, guardrails, voice).
2. **Tune it in the Studio** — edit the skill prose, bind MCP connectors, set surfaces (voice / chat / SMS / email), run the eval gate.
3. **List it** — publish to the public marketplace. Buyers **install** it (it re-grounds on their Soul) or **rent it over MCP** (`/api/v1/agents/<slug>/mcp`), where the renter's own LLM drives and you get paid per use.

**The deal, in writing:**

- **Generic agents are SeldonFrame's; the niche is yours.** We build the commodity head — the AI receptionist, the review-requester, the booking concierge — and ship them as a free-tier floor. The **vertical / niche / deep-edge-case agents are your blue ocean**, and we will not build first-party agents that compete with them.
- **You keep 95%.** We take 5% only when your agent sells or is rented — never a listing fee, never a tax on your own work.
- **You set the price** — per-call, per-outcome, monthly, or one-time.
- **We never clone you.** Your agent's data, prompts, and performance are never used to build a competing first-party agent.

If you want the platform to make selling agents *easier* (better Studio ergonomics, new connector types, richer rental metering), that part *is* a PR — and it's exactly the kind of leverage we want. See the recipes above.

---

## Development setup

```bash
git clone https://github.com/seldonframe/seldonframe.git
cd seldonframe
pnpm install
cp .env.example .env.local
pnpm db:generate
pnpm db:migrate
pnpm dev:crm
```

Visit `http://localhost:3000`.

**Prerequisites:**
- Node.js 20+
- pnpm 9+
- A Postgres database (Neon, Supabase, or local)
- Anthropic or OpenAI API key (set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env.local`)

---

## Workflow

1. Fork the repo and create a focused branch from `main`.
2. **Open a discussion before non-trivial work.** Saves you from rewriting after review. Use [GitHub Discussions](https://github.com/seldonframe/seldonframe/discussions).
3. Keep each PR scoped to one concern.
4. Follow TDD where it applies — write a failing test before the production code.
5. For agent-behavior changes, add eval scenarios. Pass rate must stay ≥87.5%.
6. Run `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, and `pnpm check:syntax` before pushing.
7. Update docs and `.env.example` if your change adds config.
8. Open a PR using the [PR template](.github/PULL_REQUEST_TEMPLATE.md).

---

## What we look for in PRs

**Loved**:
- Single concern, well-tested, with a clear "why" in the PR body
- Architecture-respectful (read the orientation above) — capability in tools/blocks, behavior in skill packs
- Adds an eval scenario for any agent change
- Updates docs alongside code (we treat docs drift as a bug)

**Sent back**:
- Hardcodes a heuristic that should live in a skill pack
- Adds a new abstraction layer "in case we need it later" (we won't; YAGNI)
- Modifies the eval gate without adding a regression test
- Bypasses tenant scoping (`workspaceId` / `orgId`) — this is a hard invariant, never bypass

**Reverted**:
- Anything that breaks the eval gate (`pnpm test:eval` must stay green)
- Schema changes without a migration script in `packages/crm/drizzle/`
- Performance regressions on the public landing-page render path (we benchmark; PRs that slow it down >100ms get reverted)

---

## Code style

- TypeScript strict mode. No `any` without a comment justifying it.
- Prettier + ESLint enforced via `pnpm lint`.
- Prefer composition over inheritance.
- Tenant scoping (`workspaceId` / `orgId`) is a hard invariant — never bypass it.
- Commit messages follow conventional commits: `type(scope): subject`.

---

## License

SeldonFrame is **AGPL-3.0** licensed (as of v1.34.3 — previously MIT). See [LICENSING.md](LICENSING.md) for the full dual-license model.

The short version for contributors:

- **Your PRs are accepted under AGPL-3.0.** By opening a PR you agree your contribution is licensed under AGPL-3.0 to the project.
- **Self-host stays free.** The 99% of operators who use SF as-is aren't affected by AGPL — they're using, not modifying.
- **Commercial path exists.** Operators who need to embed SF in closed-source products or run forks as proprietary SaaS use the hosted Agency tier or a custom commercial license — we don't extract via the AGPL itself, we extract via the paid path.

If you have a corporate policy against AGPL contributions, open an issue or email hello@seldonframe.com — we can usually work out a contributor agreement.

---

## Questions

- General questions → [Discord](https://discord.gg/sbVUu976NW)
- Architecture / "is this a good idea" → [GitHub Discussions](https://github.com/seldonframe/seldonframe/discussions)
- Bug or feature → [GitHub Issues](https://github.com/seldonframe/seldonframe/issues)
- Security → see [SECURITY.md](SECURITY.md)
