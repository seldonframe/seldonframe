# Listings Batch-Day Kit (Max — one sitting, ~60-90 min)

> Mechanics verified 2026-07-03 against live sources: see
> [shelf-mechanics-research.md](./shelf-mechanics-research.md). All artifacts
> below are ALREADY IN THE REPO (this branch) — you paste, click, and 2FA.
> **Sequencing rule: do Step 0 first; shelves 1-5 any order after; nothing
> before the 1.59.0 npm publish** (the registry validates an ownership marker
> that ships in that version's README).

## Canonical copy (paste everywhere, keep identical for SEO consistency)

- **One-liner (≤100 chars):** `Build, deploy, and sell AI agents for local-service businesses — from your IDE.`
- **Short:** `SeldonFrame is an open-source, MCP-native Business OS. One conversation in Claude Code or Cursor creates a live workspace — website, booking page, intake form, CRM, and an AI receptionist — on a real subdomain in about 3 minutes.`
- **Connect URLs:** remote `https://mcp.seldonframe.com/v1` (streamable HTTP, bearer) · stdio `npx -y @seldonframe/mcp@latest`
- **Links:** repo `github.com/seldonframe/seldonframe` · site `seldonframe.com/build` · marketplace `seldonframe.com/marketplace`
- **Logo:** the SF logo used on /marketplace (have a 512×512 PNG export ready).

## Step 0 — prerequisites (blocks shelf 1 only)

- [ ] The improve-verb wave merges → **publish @seldonframe/mcp 1.59.0** (one 2FA — the README in that version carries the required `<!-- mcp-name: io.github.seldonframe/mcp -->` marker, already committed).
- [ ] GitHub topics (30 seconds, repo Settings → edit topics — `gh` isn't authed on this machine): `mcp-server` `mcp` `model-context-protocol` `llm` `ai-agent` `crm` `small-business` `agents` `website-builder`

## Shelf 1 — Official MCP Registry (do first; others mirror it)

Artifact ready: **`server.json` at repo root** (dual: npm package + remote endpoint).
- [ ] Download `mcp-publisher` (Windows amd64): github.com/modelcontextprotocol/registry/releases/latest
- [ ] `mcp-publisher login github` (OAuth as the seldonframe org owner)
- [ ] From repo root: `mcp-publisher publish` — if it rejects the schema date, update the `$schema` date in server.json to the one the error names (known drift: 2025-12-11 vs 2025-10-17) and retry.
- [ ] Verify: search "seldonframe" at registry.modelcontextprotocol.io — instant, no review queue.
- Optional upgrade later: the branded `com.seldonframe/mcp` namespace needs one DNS TXT record (`v=MCPv1; k=ed25519; p=<pubkey>`) — skip on batch day.

## Shelf 2 — Glama (check for an existing crawl FIRST)

Artifact ready: **`glama.json` at repo root**.
- [ ] Search glama.ai/mcp/servers for "seldonframe" — if an auto-crawled entry exists, **CLAIM it** (don't create a duplicate).
- [ ] Else: "Add MCP Server" → Connector flow → paste `https://mcp.seldonframe.com/v1`. Auto-checks pass in minutes.

## Shelf 3 — Smithery

Artifact ready: **server card served live** at `https://mcp.seldonframe.com/.well-known/mcp/server-card.json` (ships with this wave's deploy — verify it 200s before submitting).
- [ ] smithery.ai/new → paste `https://mcp.seldonframe.com/v1` → declare auth = **bearer token** → publish (instant).

## Shelf 4 — PulseMCP

- [ ] pulsemcp.com/**submit** (NOT /use-cases/submit — that form is closed). Paste the canonical copy + URLs. Same-day-ish; also picks us up via the official-registry mirror.

## Shelf 5 — mcp.so

- [ ] mcp.so/submit **by hand in a real browser** (the site bot-blocks aggressively). Fields: name/description/connect URL/category(Business)/logo. Human review — expect days, fire and forget.

## Shelf 6 — Cursor directory (CHANGED: plugin-bundle model now)

Artifacts ready: **`plugin.json` + `.mcp.json` at repo root** (the deprecated flat-list repo is dead; cursor.directory now auto-reviews plugin bundles with an SDK agent).
- [ ] cursor.directory/plugins/new → sign in (GitHub) → paste `https://github.com/seldonframe/seldonframe` → it auto-detects plugin.json + .mcp.json. Known flaky form (community reports) — if buttons don't render, retry in a fresh session.

## Shelf 7 — Vercel Template gallery: **SKIP on batch day**

Verified weak fit: it wants a standalone deployable app repo, not an MCP server in a monorepo. Queued separately: a `seldonframe-mcp-quickstart` standalone repo → vercel.com/templates/submit. Not worth your sitting today.

## Shelf 8 — awesome-lists skills pack (already prepared)

- [ ] Follow `skills/seldonframe-agent-business/SUBMISSION-KIT.md` (branch feature/agent-business-skill-pack): repo topics → smoke `npx skills add` → PRs to the 3 lists it names.

---

# Creator-seeding playbook (the Greg-audience wave — light touch)

**The asset:** the AI-audit kit lead magnet (already built) + the 3-minute live build as the demo. **The pitch is a demo, not a deck.**

**Who (10-15 targets, one pass):**
- X/YouTube builders in the Greg Isenberg orbit talking "agent businesses / AI agencies / boring businesses + AI" (search recent posts quoting his agent-business thesis).
- Skool/Discord owners of AI-agency communities (the GHL-expat wedge: "$29 flat vs $297 + usage taxes").
- 2-3 build-in-public devs who post Claude Code/Cursor workflows.

**The DM (short, no ask-stack):**
> Saw your take on [their specific post]. We built the thing that thesis needs: type one sentence in Claude Code and a real business front office goes live — site, booking, CRM, AI receptionist — on a real subdomain, ~3 min. Open source, $29 flat, builders keep their margins. Want a 3-min screen-share, or just try it: seldonframe.com/build. If your audience bites, we have a white-label audit kit you can give away as a lead magnet.

**The public post template (for you to post batch-day evening):**
> Every shelf where AI builders look now stocks SeldonFrame: the official MCP registry, Smithery, Glama, PulseMCP, Cursor. One MCP server = build → deploy → sell AI agents for local businesses, from your IDE. First workspace free: seldonframe.com/build

**Rules:** never pay for placement; the referral-credit rail (shipping this wave, inert until you flip `SF_REFERRALS_ENABLED`) becomes the creator offer AFTER it's live — don't promise commissions yet.

**Follow-up cadence:** one bump after 4-5 days max, then stop. Track replies as leads in the Seldon Studio workspace CRM (dogfood).
