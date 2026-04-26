# MCP install path — P0 launch blocker investigation

**Date:** 2026-04-26
**Branch:** `claude/mcp-install-investigation`
**Base:** main HEAD `91b6e557` (post pre-launch-test-protocol merge)
**Trigger:** Pre-launch test protocol Findings #5+6+7 — `claude mcp add seldonframe` fails on a clean environment because (a) the command syntax in marketing is incomplete and (b) the underlying npm package was never published.

---

## Summary

The MCP server source code already exists at `skills/mcp-server/` as a properly-shaped npm package (`@seldonframe/mcp-server` v2.1.0, with `bin` field, runs as stdio transport, no build step required). The npm org `@seldonframe` is **already claimed** (verified via `npm org ls seldonframe` → "owner"). The package has simply never been published — the dev environment uses a path-linked registration in `~/.claude.json` pointing to a local worktree, which is why every dev-machine test succeeded while the cleanroom test failed.

**Recommended fix path:** Option A (publish to npm) + update marketing copy in lock-step. **Estimated work: 4-6 hours** end-to-end including a cleanroom re-run of the protocol §3.1.

**Cannot launch** until the published package + corrected marketing copy + cleanroom re-verification all complete.

---

## Q1 — Where is the MCP server code?

**Location:** `skills/mcp-server/`

| File | Lines | Role |
|---|---|---|
| `skills/mcp-server/src/index.js` | 19 | Entry point; boots the MCP server, registers handlers |
| `skills/mcp-server/src/tools.js` | ~2001 | Tool definitions (75 tools registered) |
| `skills/mcp-server/src/client.js` | 195 | HTTP client to `app.seldonframe.com/api/v1`; device-token persistence |
| `skills/mcp-server/src/welcome.js` | — | Welcome banner shown to users on first connect |
| `skills/mcp-server/package.json` | — | npm package manifest |
| `.claude-plugin/plugin.json` | — | Claude Code plugin manifest (separate, may overlap) |

**Transport:** stdio.
```js
// skills/mcp-server/src/index.js (excerpt)
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const transport = new StdioServerTransport();
await server.connect(transport);
```
Standard MCP — Claude Code spawns the process and pipes JSON-RPC over stdin/stdout.

---

## Q2 — Is it already packaged?

**Yes. Already shaped as a publishable npm package.** Just never published.

```json
// skills/mcp-server/package.json (excerpt)
{
  "name": "@seldonframe/mcp-server",
  "version": "2.1.0",
  "type": "module",
  "bin": { "seldonframe-mcp": "src/index.js" },
  "scripts": { "start": "node src/index.js" },
  "dependencies": { "@modelcontextprotocol/sdk": "^1.0.4" }
}
```

Strengths:
- ✅ Has `bin` field — `npx -y @seldonframe/mcp-server` will execute
- ✅ Pure JavaScript — no TypeScript compilation, no esbuild step
- ✅ Single dependency (`@modelcontextprotocol/sdk`)
- ✅ Shebang `#!/usr/bin/env node` on `src/index.js` (executable)

Missing for publication:
- ❌ No `publishConfig` field in `package.json`
- ❌ No `prepublishOnly` script
- ❌ No `.npmrc` for registry config or auth
- ❌ No GitHub Actions workflow at `.github/workflows/publish-mcp.yml` or equivalent
- ❌ No `files` allowlist in `package.json` (would publish whole dir incl. node_modules unless `.npmignore` exists — verify)
- ❌ No git tag indicating a prior release

**Git history:** Two relevant commits:
- `22dc12b3` — "feat: zero-friction SeldonFrame pipeline (LLM-free backend, Path B)"
- `16207d6b` — "feat(mcp): zero-friction guest mode for SeldonFrame MCP"

No `chore: release v2.1.0` or `npm publish` traces in the log. The version `2.1.0` in package.json was set aspirationally.

---

## Q3 — What does it need at runtime? (CRITICAL)

**No database. No local state required. No env vars required.**

The server is a thin HTTP client that proxies MCP tool calls to a SeldonFrame backend. From `src/client.js`:

```js
// skills/mcp-server/src/client.js
const API_BASE = process.env.SELDONFRAME_API_BASE ?? "https://app.seldonframe.com/api/v1";
// ...
const res = await fetch(`${API_BASE}${path}`, { ... });
```

Every tool — `create_workspace`, `install_caldiy_booking`, `query_brain` (deprecated, see Q4), etc. — translates to an HTTP request against `app.seldonframe.com/api/v1/...`.

**Optional environment variables:**
- `SELDONFRAME_API_BASE` — override backend (for self-hosted or test envs)
- `SELDONFRAME_API_KEY` — auth for Pro features (free tier needs nothing)

**Local persistence:** writes to `~/.seldonframe/device.json` (cached workspace bearer tokens). Created on first use, no setup required.

**Implication:** ✅ **Standalone npm/npx is fully viable.** Users get a working install with zero local infra — the `app.seldonframe.com` backend already runs in production (verified in earlier work — Vercel deployments are live). The MCP server is essentially a thin CLI wrapper; the heavy lifting happens in the hosted Next.js app.

---

## Q4 — Tools exposed

**75 tools** registered in `skills/mcp-server/src/tools.js`. Grouped:

| Category | Count | Examples |
|---|---|---|
| Workspace ops | 7 | `create_workspace`, `list_workspaces`, `clone_workspace`, `claim_guest_workspace`, `switch_workspace`, `link_workspace_owner`, `export_agent` |
| CRM | 21 | `create_contact`, `list_contacts`, `update_contact`, `create_deal`, `move_deal_stage`, `create_activity`, `create_form`, `customize_intake_form`, `send_email`, … |
| Booking & forms | 12 | `create_appointment_type`, `configure_booking`, `create_booking`, `cancel_booking`, `send_sms`, … |
| Landing pages | 9 | `generate_landing_page`, `create_landing_page`, `publish_landing_page`, `update_landing_content`, … |
| Ops & config | 12 | `install_caldiy_booking`, `install_formbricks_intake`, `install_vertical_pack`, `connect_custom_domain`, `list_automations`, `get_workspace_snapshot`, `store_secret`, `list_secrets`, `rotate_secret`, … |
| Invoicing & payments | 10 | `create_invoice`, `send_invoice`, `void_invoice`, `create_subscription`, `cancel_subscription`, `refund_payment`, … |
| Messaging & misc | 4 | `send_conversation_turn`, `list_emails`, `get_email`, `get_sms` |

**Stale tool names in marketing / system reminders:** the system reminder for `seldonframe` MCP at the start of the test session listed `query_brain` and `seldon_it`. Neither exists in current `tools.js`. Per README hints, `query_brain` was renamed to `get_workspace_snapshot`. **Action:** any marketing copy or docs mentioning `query_brain` or `seldon_it` should be reconciled (low-priority — likely just doc drift).

**Marketing-claim coverage:** the marketing claims "scaffold blocks, init workspaces, compose archetypes, query brain" — all of these have corresponding tools EXCEPT no explicit `scaffold_block` tool. Block scaffolding seems to happen via the install_* family (`install_caldiy_booking`, `install_formbricks_intake`, `install_vertical_pack`). If the marketing language "scaffold a block" is meant literally, there's a copy/code mismatch worth resolving.

---

## Q5 — How does the dev machine work?

**Path-linked registration in `~/.claude.json`:**

```json
{
  "mcpServers": {
    "seldonframe": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/Users/maxim/CascadeProjects/Seldon Frame/.claude/worktrees/zealous-nobel-51a52a/skills/mcp-server/src/index.js"],
      "env": {}
    }
  }
}
```

Every dev test resolves through this path-linked entry. The dev never exercised the published-package path because no published package exists. **This is the root cause of the launch-blocker not being caught earlier.** L-29 (below) codifies the prevention pattern.

**Guest mode at `~/.seldonframe/guest/`:** the system reminder mentioned a "guest mode simulator" that runs everything locally with no API key. Searching the codebase: this concept appears in the welcome banner / docs but **is not implemented in the current `tools.js` code path** — every tool calls the HTTP backend. Either it's a legacy concept or a future feature. Worth verifying with the original author (Max) before relying on the marketing claim.

---

## Q6 — Fix options assessment

### Option A — Publish to npm 🟢 RECOMMENDED PRIMARY

**Feasibility:** HIGH. Code is already npm-shaped; org is claimed.

**What needs to happen (4-6 hours total):**

1. **Package hardening** (~1h)
   - Add `publishConfig: { access: "public" }` to `package.json`
   - Add `files: ["src/", "README.md", "LICENSE"]` to limit publish payload
   - Add a minimal `README.md` inside `skills/mcp-server/` (npm shows this on the package page)
   - Verify `.npmignore` or `files` field excludes `node_modules`, tests, dev docs

2. **First publish** (~30m — Max-action)
   - Max runs `npm login` locally (one-time)
   - `cd skills/mcp-server && npm publish --access public --dry-run` to verify payload
   - `npm publish --access public` to actually publish
   - Verify: `npm view @seldonframe/mcp-server` returns metadata

3. **CI workflow for future releases** (~1h)
   - Add `.github/workflows/publish-mcp-server.yml` — trigger on git tag `mcp-server-v*` → npm publish using a `NPM_TOKEN` secret
   - Document the release process in `CONTRIBUTING.md`

4. **Marketing copy update** (~30m, blocking on §1 above)
   - Change every reference from `claude mcp add seldonframe` to `claude mcp add seldonframe -- npx -y @seldonframe/mcp-server`
   - Or shorter: `claude mcp add seldonframe npx @seldonframe/mcp-server` (verify Claude Code accepts shorthand without `--` separator)

5. **Cleanroom re-verification** (~1-2h, blocking)
   - Fresh Codespace → `claude mcp add seldonframe -- npx -y @seldonframe/mcp-server` → start `claude` → `/mcp` shows ✓ Connected → `create_workspace({ name: "test" })` succeeds → workspace appears at `app.seldonframe.com`
   - Repeat protocol §3.1 from a NEW environment

**Risks:**
- Marketing's elegant `claude mcp add seldonframe` (5 tokens) cannot be made to work — no implicit-lookup mechanism exists in Claude Code. Expectation must be reset to the longer form.
- One-time coordination: package must be live before marketing copy ships
- Future package drift if no CI workflow — `prepublishOnly: "npm test"` recommended

---

### Option B — Hosted HTTP MCP endpoint 🟡 SECONDARY (defer)

**Feasibility:** MEDIUM. Vercel's serverless model is awkward for long-lived MCP connections; would need either Edge runtime + SSE or a non-Vercel Node deployment.

**What it would buy:**
- Slightly shorter command: `claude mcp add --transport http seldonframe https://app.seldonframe.com/mcp` (still not the marketed 5-token form)
- Eliminates the need for users to have `npx`/Node installed (though Claude Code itself requires Node, so this is moot)
- Centralized control (server-side feature flags, instant updates)

**What it costs:**
- Net-new HTTP transport layer wrapping the stdio server (~3-4h)
- Vercel deployment + routing for `/mcp` endpoint (~2-3h)
- Auth/tenancy story (the server currently uses local device tokens; HTTP transport needs per-request auth)
- Cold-start latency on first tool call

**Estimated work:** 8-12 hours net-new, on top of Option A's 4-6 hours.

**Recommendation:** **Defer to v1.1.** Option A unblocks launch; Option B is polish.

---

### Option C — Both 🟡 EVENTUALLY (post-launch)

Same per-component costs as A + B, ~12 hours total. Future-state: npm for CLI users, HTTP for browser-based or no-Node clients. Not a launch dependency.

---

### Option D — Local clone path 🔴 FALLBACK ONLY

Already works on dev machines. The README technically demonstrates this in §14 ("self-host"). Command:

```bash
git clone https://github.com/seldonframe/seldonframe.git
cd seldonframe
claude mcp add seldonframe -- node "$(pwd)/skills/mcp-server/src/index.js"
```

Pros: no npm dependency, version-locked to exact commit
Cons: clunky, requires Git, manual updates, not discoverable, not what marketing claims

**Use case:** contributors, advanced self-hosters. **Not a primary launch path.** Worth documenting as a sidebar in /docs/quickstart but not the headline.

---

## Q7 — Marketing surface inventory (every file with the broken command)

| File | Line | Current | Status |
|---|---|---|---|
| `README.md` | ~32 | "install once with `claude mcp add seldonframe`" | ❌ broken |
| `README.md` | ~40 | code block: `claude mcp add seldonframe` | ❌ broken |
| `packages/crm/src/app/(public)/landing-client.tsx` | ~137 | hero terminal: `$ claude mcp add seldonframe` | ❌ broken |
| `packages/crm/src/app/(public)/landing-client.tsx` | ~240 | How-it-works step 1 card: `code="claude mcp add seldonframe"` | ❌ broken |
| `packages/crm/src/app/(marketing)/docs/quickstart/page.tsx` | ~84 | step 1 code block: `code="claude mcp add seldonframe"` | ❌ broken |
| `docs/pre-launch-test-protocol.md` | multiple | internal QA references | ⚠ acceptable (internal) |

**Five user-facing surfaces** must be updated in lock-step with the npm publish.

**Note on package name:** even after publishing `@seldonframe/mcp-server`, the marketing surfaces above need to show:
- `claude mcp add seldonframe -- npx -y @seldonframe/mcp-server` (verbose but explicit)

OR consider renaming the npm package to `@seldonframe/mcp` (shorter — but `mcp-server` is the more conventional name in the MCP ecosystem).

---

## Recommended fix path (decision basis for Max)

**Option A as primary. Total estimated effort: 4-6 hours of focused work + 1-2h cleanroom re-verification.**

Sequence:

1. ⏳ **Package hardening branch** (`claude/mcp-server-publish-prep`)
   - Add `publishConfig`, `files`, README, etc.
   - PR + merge — does not yet publish
2. 🔑 **Max action: `npm login` + `npm publish`** (one-time, ~30m)
3. 🔍 **Verify** `npm view @seldonframe/mcp-server` works
4. ⏳ **Marketing-copy branch** (`claude/launch-content-mcp-fix`)
   - Update all 5 user-facing surfaces to the working command
   - PR + merge
5. 🧪 **Cleanroom re-test** (Max executes pre-launch-test-protocol §1-3.1 in a fresh Codespace) — verify install actually works end-to-end
6. ✅ **Sign off + proceed with rest of protocol** (Sections 3.2-10 as originally planned)

**Why this order:** publishing before marketing means we never ship copy that points at a 404. Cleanroom re-test before sign-off enforces L-29.

---

## Files that need to change (when Max approves the fix path)

### Phase 1 — npm package readiness
- `skills/mcp-server/package.json` — add `publishConfig`, `files`, `prepublishOnly`, optionally bump version
- `skills/mcp-server/README.md` — create (currently doesn't exist; npm displays this on the package page)
- `skills/mcp-server/.npmignore` — verify or create (exclude tests, dev configs)
- `.github/workflows/publish-mcp-server.yml` — new CI workflow for future releases
- `CONTRIBUTING.md` — add "Releasing the MCP server" section

### Phase 2 — marketing surface updates
- `README.md` (≥ 2 lines)
- `packages/crm/src/app/(public)/landing-client.tsx` (≥ 2 lines)
- `packages/crm/src/app/(marketing)/docs/quickstart/page.tsx` (≥ 1 line)
- Optional: a sidebar in `/docs/quickstart` documenting the local-clone fallback (Option D)

### Phase 3 — lessons file
- Wherever lessons L-21 / L-27 / L-28 live, add **L-29** (text below)

---

## L-29 — Distribution path verification

**Per Max's spec, codify into the lessons doc:**

> **L-29 — Distribution path must be tested end-to-end on a clean environment before any marketing claims reference it.**
>
> Before any marketing surface (landing page, docs, README, hero terminal, blog) shows an install command, that exact command must succeed on a fresh environment with no local code, no cached dependencies, and no pre-configured environment variables. The test must be run by someone following only the published documentation.
>
> "Works on my machine" is not "works." Distribution path verification is as important as architectural verification (L-27 Vercel-preview observation, L-28 credential patterns). Add it to the green-bar checklist for any slice that ships a distribution-facing artifact.
>
> *Background:* SLICE 11 + repo-polish + marketing-website all validated their changes via Vercel preview observation (L-27) and unit-test green bars, but no slice ever validated the `claude mcp add seldonframe` install path against a published artifact, because the development environment uses a path-linked local MCP server. The pre-launch test protocol surfaced the gap on day-1 of cleanroom testing.
>
> *Application going forward:* any slice that introduces or modifies a distribution-facing command (`npx`, `npm install`, `pip install`, `docker run`, `claude mcp add`, etc.) must include a cleanroom-test step in its green-bar checklist. Codespaces, fresh OS user, or Docker container all qualify as "cleanroom"; the dev machine does not.

**Suggested location:** wherever L-27 and L-28 currently live. (Investigation did not locate the lessons file in this branch — likely in a tasks/ or docs/ subdirectory under a different naming convention. Max to confirm.)

---

## Questions that need Max's input before any code changes

1. **Package name confirmation** — keep `@seldonframe/mcp-server` (current package.json) or rename to `@seldonframe/mcp` (shorter, easier to type)?
2. **npm publish auth** — does Max have an npm account that's a member of the `seldonframe` org? (Org claimed, but local `npm whoami` not authenticated — needs `npm login` once.)
3. **CI publish workflow** — automated on git tag, or manual `npm publish` for v1? (Manual is simpler for v1; auto for v1.1+.)
4. **Marketing-copy form** — accept the longer `claude mcp add seldonframe -- npx -y @seldonframe/mcp-server`, OR also build Option B (hosted HTTP) so the command can be `claude mcp add --transport http seldonframe https://app.seldonframe.com/mcp` (also longer than current marketing, but shorter than the npx form)?
5. **Version bump** — current `package.json` shows `2.1.0` aspirationally. Publish as `2.1.0`, or reset to `1.0.0` since this is the actual first publish?
6. **Guest mode story** — the welcome banner / system reminder advertises guest mode at `~/.seldonframe/guest/` with no API key needed, but the code unconditionally calls `app.seldonframe.com`. Is guest mode a future feature, a vestigial copy, or actually implemented somewhere I missed?
7. **Stale tool names** — `query_brain` and `seldon_it` appear in the welcome banner / system reminder but not in `tools.js`. Reconcile (rename in banner) or restore (re-add to tools)?
8. **L-29 location** — where do L-27 / L-28 live? (Need the file path before adding L-29.)

---

## Bottom line

The fix is **smaller than feared but more delicate than typical**. The code already works; it just needs to be published and the marketing copy needs to be honest about the actual command form. **3-6 hours of focused execution + 1-2h cleanroom re-verification = launch unblocked.**

Standing by for Max's decision on the open questions above. **No code changes will be made until those answers come back.**
