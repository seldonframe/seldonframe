# MCP Distribution Shelf Mechanics — Research (verified July 2026)

> **Scope:** current submission mechanics for 7 distribution "shelves" for
> `@seldonframe/mcp` (npm, v1.58.1) — monorepo `github.com/seldonframe/seldonframe`,
> remote endpoint `https://mcp.seldonframe.com/v1` (streamable HTTP, bearer) + `npx`
> stdio. Read-only research — **nothing was submitted**. Cross-checked against the
> prior submission kit at `docs/distribution/mcp-registry-submission.md` (dated
> 2026-06-26, based on the ChatGPT-app endpoint) — that doc is still directionally
> correct on strategy but predates some mechanism changes noted below.
>
> Research date: 2026-07-03.

---

## 1. Official MCP Registry — `registry.modelcontextprotocol.io`

1. **Submission URL/repo:** No web form — submission is via the **`mcp-publisher` CLI** talking to the registry API. Binaries: `github.com/modelcontextprotocol/registry/releases/latest` (`mcp-publisher_<os>_<arch>.tar.gz`, incl. Windows amd64/arm64). Source repo: `github.com/modelcontextprotocol/registry`.
2. **Required artifact:** `server.json` — **lives at repo root by default** (registry docs/CLI use plain `mcp-publisher publish`, which looks for `./server.json`; override the path with `mcp-publisher publish --file=./sub/dir/server.json` — relevant for SeldonFrame's monorepo since the MCP server package likely isn't at repo root). Minimal valid shape:
   ```json
   {
     "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
     "name": "io.github.seldonframe/mcp",
     "description": "Build and deploy AI agents for local-service businesses.",
     "version": "1.58.1",
     "packages": [
       {
         "registryType": "npm",
         "identifier": "@seldonframe/mcp",
         "version": "1.58.1",
         "transport": { "type": "stdio" }
       }
     ]
   }
   ```
   For the **remote** endpoint (`https://mcp.seldonframe.com/v1`), use a `remotes` array instead of/alongside `packages`:
   ```json
   "remotes": [{ "type": "streamable-http", "url": "https://mcp.seldonframe.com/v1" }]
   ```
   A server.json can declare **both** `packages` (npx stdio) and `remotes` (hosted) — you are not forced to pick one, which fits SeldonFrame's dual-mode server exactly.
3. **Auth/prereqs:**
   - `io.github.seldonframe/*` namespace → `mcp-publisher login github` (interactive OAuth against the `seldonframe` GitHub org/account; CI can use `login github-oidc`).
   - `com.seldonframe/*` namespace (branded, reverse-DNS of the owned domain) → `mcp-publisher login dns --domain seldonframe.com`, which requires a DNS TXT record (`v=MCPv1; k=ed25519; p=<base64 pubkey>`) on `seldonframe.com` first.
   - **Package ownership verification:** the registry cross-checks that the npm package's README contains an `<!-- mcp-name: io.github.seldonframe/mcp -->` (or `com.seldonframe/mcp`) comment matching `server.json`'s `name` field — you must publish a README update to npm *before* the server.json publish succeeds validation.
4. **Review time / auto-index:** **Instant, no manual review** — `mcp-publisher publish` writes directly to the registry API; it's live and searchable at `registry.modelcontextprotocol.io` within seconds. This is the **upstream source of truth** — the GitHub MCP Registry and (per multiple directories) Glama/PulseMCP increasingly mirror/crawl from it, so this is the one to do first.
5. **Gotchas:**
   - **Schema URL date drift, flag this explicitly:** two current official sources disagree — the community `generic-server-json.md` spec (and the prior SF submission kit) cite `2025-12-11`; a Microsoft Learn quickstart *updated 2026-03-04/06* still shows `2025-10-17`. **Confirm the live current dated schema at publish time** (`https://static.modelcontextprotocol.io/schemas/<date>/server.schema.json`); the CLI will reject a stale/mismatched schema at validation.
   - `name` is **case-sensitive** and immutable-in-practice (treat it as a permanent ID).
   - `description` is capped at ~100 characters in the reference examples — keep it tight, not the long marketing copy.
   - The registry is still labeled **"preview"** (API entered a v0.1 freeze Oct 2025) — expect continued minor breaking changes to CLI flags/schema.

**Prepared artifact we must create:** `server.json` at the **repo root of `github.com/seldonframe/seldonframe`** (or wherever `mcp-publisher publish --file=` is pointed if the monorepo keeps it under `packages/mcp/server.json`), naming decision pending: `io.github.seldonframe/mcp` (zero-prereq) vs `com.seldonframe/mcp` (branded, needs the one-time DNS TXT record — worth doing since SeldonFrame owns the domain).

**Sources:**
- [server.json Format Specification (raw)](https://raw.githubusercontent.com/modelcontextprotocol/registry/refs/heads/main/docs/reference/server-json/generic-server-json.md)
- [Quickstart – Publish a .NET MCP server to the MCP Registry — Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/ai/quickstarts/publish-mcp-registry) (updated 2026-03-04, shows schema `2025-10-17` — the discrepancy)
- [modelcontextprotocol/registry — GitHub repo/README](https://github.com/modelcontextprotocol/registry)
- [Official MCP Registry](https://registry.modelcontextprotocol.io/)
- [Official MCP Registry Reference/docs](https://registry.modelcontextprotocol.io/docs)

---

## 2. Smithery — `smithery.ai`

1. **Submission URL:** `smithery.ai/new` (paste a public HTTPS URL directly for a hosted/remote server) — this is the primary path for SeldonFrame since `https://mcp.seldonframe.com/v1` is already streamable-HTTP. There is **also** a CLI path: `smithery mcp publish <url> -n seldonframe/mcp`, and a raw API: `PUT /servers/{qualifiedName}/releases` (multipart, `payload` = JSON `DeployPayload`, Bearer `SMITHERY_API_KEY`).
2. **Required artifact:** **No mandatory manifest file** for a remote/external server — Smithery auto-scans the live URL for tool schemas. Optional but recommended: a `/.well-known/mcp/server-card.json` on `mcp.seldonframe.com` (JSON, MCP-spec server-info shape) for servers that need auth or whose auto-scan is incomplete — since SeldonFrame's endpoint is **bearer-gated**, this is likely needed for Smithery to render tools without a live connection.
3. **Auth/prereqs:** Smithery account (GitHub or email sign-in) to use `/new`; `SMITHERY_API_KEY` only for the CLI/API path. The manifest requires declaring the auth method (API key/OAuth/none) so Smithery prompts the end user correctly — SeldonFrame should declare **bearer token**.
4. **Review time / auto-index:** No formal review queue documented — "Smithery handles client registration automatically," and a successful publish via the API returns `202 Accepted` with a live `mcpUrl` immediately (`deploymentId` + optional `warnings`). Effectively same-day/instant.
5. **Gotchas:**
   - Qualified name format is `namespace/server` (e.g. `seldonframe/mcp`), and forward slashes must be **URL-encoded as `%2F`** if hitting the raw API.
   - Because the SeldonFrame endpoint requires a bearer token, plain auto-scan will likely fail/timeout on `tools/list` — publish the `server-card.json` (or accept a degraded auto-generated listing) to avoid an empty tool list on the server page.
   - The CLI flow (`smithery mcp add <name>`) lets you self-install and dry-run before the actual publish — use it to sanity-check the bearer-auth prompt renders correctly.

**Prepared artifact we must create:** optional `/.well-known/mcp/server-card.json` served from `mcp.seldonframe.com` (static JSON, MCP server-info shape: name/description/tools summary) — improves the auto-scanned listing quality for a bearer-gated remote server. No repo file required for the base listing.

**Sources:**
- [Smithery Docs — Build/Publish overview](https://smithery.ai/docs/build)
- [Smithery Docs — Publish guide](https://smithery.ai/docs/build/publish.md)
- [Smithery API Reference — Publish a Server](https://smithery.ai/docs/api-reference/servers/publish-a-server.md)
- [smithery-ai/cli — GitHub](https://github.com/smithery-ai/cli)

---

## 3. mcp.so

1. **Submission URL:** `mcp.so/submit` (web form; nav bar "Submit" button links here). Alternative: open a GitHub issue against mcp.so's backing repo (community-documented fallback when the form is unavailable).
2. **Required artifact:** No manifest file — form fields are name, description, connection URL/repo, category, and logo. (Exact field list could not be scraped directly — the page 403'd to the fetch tool twice; the fallback GitHub-issue path corroborates name/description/features/connection-info as the substantive fields.)
3. **Auth/prereqs:** Site account to submit via the form (GitHub OAuth commonly used on mcp.so-style sites); GitHub account only, if using the issue fallback.
4. **Review time / auto-index:** **Manual review, not instant** — mcp.so's own hosting docs describe uploading server code to GitHub, then "submit your MCP Server to mcp.so **for review**" — implies a human/moderation pass rather than immediate auto-publish (contrast with the official registry's instant CLI publish).
5. **Gotchas:** The submit and server-hosting doc pages (`mcp.so/submit`, `docs.mcp.so/server-hosting`) returned **403/429 to automated fetches** during this research — mcp.so appears to bot-block scrapers harder than the other shelves; plan to submit by hand in a real browser session rather than scripting it.

**Prepared artifact we must create:** none (form-only); have the one-liner + long description + `https://mcp.seldonframe.com/v1` connect URL + a logo image ready to paste.

**Sources:**
- [mcp.so — MCP Servers directory](https://mcp.so/)
- [mcp.so/submit](https://mcp.so/submit) (fetch blocked 403; URL confirmed via search-result snapshot)
- [docs.mcp.so/server-hosting](https://docs.mcp.so/server-hosting) (fetch blocked 403)

---

## 4. PulseMCP — `pulsemcp.com`

1. **Submission URL:** **`pulsemcp.com/submit`** — confirmed live and current. **Flag:** do **not** confuse this with `pulsemcp.com/use-cases/submit`, which is a *different*, now-closed form — that page explicitly states *"Sorry! We are no longer accepting new use case submissions."* The server-submission form at `/submit` is unaffected by that closure.
2. **Required artifact:** No manifest file; the form is the artifact. PulseMCP separately maintains a REST API (`pulsemcp.com/api`) that also surfaces official-registry-sourced entries, so a clean `server.json` published to the official registry (shelf #1) may get PulseMCP to pick SeldonFrame up passively in addition to the direct form submit.
3. **Auth/prereqs:** none beyond the form itself (no PulseMCP account requirement documented).
4. **Review time / auto-index:** Directory is described as "**20,100+ servers, updated daily**" and blends manual submissions with automated scraping/curation and official-registry mirroring — treat as same-day to a few days for a direct submit to surface, faster (near-instant) via the official-registry mirror path.
5. **Gotchas:** The **use-case submission channel is dead** (confirmed above) — this is a "changed recently" item worth flagging if any older internal doc pointed there. The actual server-submit form remains open.

**Prepared artifact we must create:** none (form-only).

**Sources:**
- [PulseMCP — Submit a server](https://www.pulsemcp.com/submit)
- [PulseMCP — closed use-case submission notice](https://www.pulsemcp.com/use-cases/submit)
- [PulseMCP — MCP Server Directory](https://www.pulsemcp.com/servers)
- [PulseMCP API](https://www.pulsemcp.com/api)

---

## 5. Glama — `glama.ai/mcp`

1. **Submission URL:** `glama.ai/mcp/servers` → **"Add MCP Server"** button. For an already-deployed **remote** server (SeldonFrame's case), the relevant sub-flow is **"Add MCP Server → Connector"** on the connectors page (distinct from the GitHub-crawl path for installable/stdio servers).
2. **Required artifact:** **`glama.json`** — an optional-but-recommended metadata file dropped in the repo root that controls how Glama's crawler indexes the listing: display name, description, category, environment variables, build spec. Without it, Glama free-crawls the repo and infers metadata (works, but you lose control of copy/category).
3. **Auth/prereqs:** Glama account. **Important constraint: "servers must be on GitHub today"** for the standard automated-form submission path — for non-GitHub-hosted or private-repo servers, official guidance is to reach out on **Discord** for a manual/alternative path. Since SeldonFrame's monorepo *is* public on GitHub, the standard path applies; the remote-URL "Connector" flow is the right one to add the hosted `https://mcp.seldonframe.com/v1` endpoint specifically (as opposed to just indexing the npm/npx package).
4. **Review time / auto-index:** **Automated quality checks run at submission time; most submissions pass within minutes** and become searchable/categorized immediately after. No manual moderation queue for compliant submissions.
5. **Gotchas:** Glama **also auto-crawls GitHub** independently of manual submission — SeldonFrame's public repo may already show up as an unclaimed/anonymous listing before anyone submits anything. Check for an existing auto-indexed entry and **claim** it (rather than creating a duplicate) if one exists — claiming unlocks editing the description/links and moves it out of the "anonymous crawl" bucket.

**Prepared artifact we must create:** `glama.json` at the **repo root of `github.com/seldonframe/seldonframe`** (or the MCP package's directory root) — sets display name "SeldonFrame", description, category, and (if applicable) required env vars for the npx stdio mode.

**Sources:**
- [Glama — MCP Server Registry](https://glama.ai/)
- [Glama — Open-Source MCP Servers directory](https://glama.ai/mcp/servers)
- [Glama — MCP FAQ](https://glama.ai/mcp/faq)
- [Official MCP Registry server.json Requirements — Glama blog, 2026-01-24](https://glama.ai/blog/2026-01-24-official-mcp-registry-serverjson-requirements)

---

## 6. Cursor's MCP directory — `cursor.directory` / Cursor docs

**Flag — this shelf changed meaningfully and recently; do not use the old mental model of "a flat MCP server list."**

1. **Submission URL:** **`cursor.directory/plugins/new`**. The previously-community-known `github.com/cursor/mcp-servers` repo is **explicitly deprecated**, redirecting people to submit via cursor.directory instead. There is also a native path at **`cursor.com/marketplace/publish`** per Cursor's own docs.
2. **Required artifact:** Cursor has moved from "raw MCP server listing" to a **plugin bundle model** (spec: `github.com/cursor/plugins`). The manifest is **`plugin.json`** (technically only requires a `name` field — everything else is auto-discovered):
   ```json
   {
     "name": "seldonframe",
     "description": "Build, deploy, and sell AI agents for local-service businesses.",
     "version": "1.58.1",
     "author": { "name": "SeldonFrame" }
   }
   ```
   MCP servers inside a plugin are declared via **`mcp.json`** (or `.mcp.json`) at the plugin root, using the standard `mcpServers` key shape. A plugin can also bundle `rules/*.mdc`, `skills/*/SKILL.md`, `agents/*.md`, `hooks/hooks.json` — but for SeldonFrame, only the `mcp.json` piece is relevant. Multi-plugin repos add a `.cursor-plugin/marketplace.json` index.
3. **Auth/prereqs:** Sign in to cursor.directory with **GitHub or Google**, then submit by **pasting the GitHub repo URL** — the system auto-detects the plugin components (mcp.json, rules, skills, etc.) rather than asking for a manual form fill of name/description/icon (those come from `plugin.json`).
4. **Review time / auto-index:** Submitted plugins are **auto-reviewed by a Cursor SDK agent ("composer-2") running locally against a fresh clone of the repo** — i.e., an automated code-review gate, not a human queue, but also not instant like the official MCP registry. Treat as "minutes to same-day," gated on the review agent's clone+analysis succeeding rather than a fixed SLA.
5. **Gotchas:**
   - This is a genuine **mechanism change** vs. older docs/blog posts that describe cursor.directory as a simple crawled MCP-server list — it is now **plugin-first**, and a bare MCP server needs to be wrapped in a minimal plugin (`plugin.json` + `mcp.json`) to be submittable at all.
   - Icon: referenced in the spec but exact dimensions/format were not confirmed in this pass (surfaced in search snippets only) — check `cursor.com/docs/reference/plugins` directly before finalizing assets.
   - There is a known community forum complaint ("no buttons after filling out the form") — worth a dry run before relying on the flow for a real submission.

**Prepared artifact we must create:** `plugin.json` **and** `mcp.json` (or `.mcp.json`) — likely best placed in a small dedicated directory of the monorepo (e.g. `packages/mcp/.cursor-plugin/` or repo-root `.cursor-plugin/`) since the SF repo is a monorepo and Cursor's spec expects one plugin per submitted repo/URL.

**Sources:**
- [Cursor Docs — Plugins](https://cursor.com/docs/plugins)
- [cursor/plugins — spec + official plugins repo (GitHub)](https://github.com/cursor/plugins)
- [Cursor Directory — Plugins](https://cursor.directory/plugins)
- [Cursor forum — plugin upload issue](https://forum.cursor.com/t/how-do-i-upload-my-plugin-after-filling-out-the-form-there-are-no-buttons-am-i-doing-something-wrong/155138)

---

## 7. Vercel Template gallery

1. **Submission URL:** **`vercel.com/templates/submit`** (form, requires Vercel login) is the current, direct path for the `vercel.com/templates` gallery. A parallel/older mechanism is a **PR to `github.com/vercel/examples`** — this repo has its own stricter conventions (see below) and may feed a related-but-distinct "Examples" surface rather than the polished Templates gallery; treat the form as primary and the PR route as the fallback/legacy path.
2. **Required artifact (PR route, `vercel/examples`):**
   - Example must live under the **`solutions/`** or **`edge-functions/`** folder.
   - `package.json` modeled on `plop-templates/example/package.json`.
   - `README.md` modeled on `plop-templates/example/README.md`.
   - `.gitignore` modeled on `plop-templates/example/.gitignore`.
   - **MIT license.**
   - If env vars are needed: a `.env.example` file **plus setup instructions in the README**.
   - Must have a working **demo URL** — Vercel's own team deploys it as part of onboarding the example.
   - If Next.js: also needs `.eslintrc.json` matching the template, and should use `@vercel/examples-ui` for consistent styling/layout.
   - A scaffolding CLI (`plop`-based, run from repo root) can generate the skeleton matching all of the above automatically.
3. **Auth/prereqs:** Vercel account + login for the form route; GitHub account + PR for the repo route.
4. **Review time / auto-index:** Not instant — both routes are **human-reviewed** (the form is a submission queue; the PR route is a standard code-reviewed GitHub PR). No stated SLA found in this pass.
5. **Gotchas — the monorepo-subdirectory question, answered:** Nothing in the current docs or the `vercel/examples` contribution conventions describes accepting "a subdirectory of an external monorepo" as a template source directly. The pattern is the **inverse**: `vercel/examples` **is itself** a monorepo of independent single-purpose examples, each living in its own top-level folder (`solutions/<name>` or `edge-functions/<name>`) with its own self-contained `package.json`/README/license. Practical implication for SeldonFrame: **do not point Vercel at a subdirectory of `github.com/seldonframe/seldonframe`.** Instead, either (a) submit via the `vercel.com/templates/submit` form pointing at a small **standalone** demo repo purpose-built to showcase `@seldonframe/mcp` (e.g. "SeldonFrame MCP quickstart" Next.js app), since Vercel's own Root-Directory picker for monorepo *deployments* is a deploy-time setting, not a documented template-submission field; or (b) contribute a self-contained example folder to `vercel/examples` following the plop-scaffold conventions. Given SF's actual deliverable is an MCP server (not a deployable Next.js app template), this shelf is a **lower-priority/weaker fit** than the other six — it's designed for app templates, not MCP servers.

**Prepared artifact we must create:** if pursued, a **new standalone repo** (not a subdir of the monorepo) — e.g. `github.com/seldonframe/seldonframe-mcp-quickstart` — containing `package.json`, `README.md` (with setup + demo instructions for connecting to `@seldonframe/mcp` / `https://mcp.seldonframe.com/v1`), `.env.example` if any config is needed, and an MIT license, then either submit via the `/templates/submit` form or PR it into `vercel/examples` under `solutions/`.

**Sources:**
- [Vercel — Templates](https://vercel.com/templates)
- [Vercel Community — "Submitting a template" thread, confirms `vercel.com/templates/submit`](https://community.vercel.com/t/submitting-a-template/6016)
- [vercel/examples — GitHub repo](https://github.com/vercel/examples)
- [Vercel Docs — Using Monorepos](https://vercel.com/docs/monorepos)
- [Vercel Docs — Getting started with Vercel](https://vercel.com/docs/getting-started-with-vercel/template)

---

## Plus: GitHub repo topics top MCP servers actually use

Confirmed via GitHub's own topics page and cross-referenced against high-star repos surfaced under it:

- **Primary/canonical topic:** `mcp-server` — this is the topic GitHub itself curates a landing page for (`github.com/topics/mcp-server`), described as: *"MCP servers are lightweight programs that expose specific capabilities to AI applications through the Model Context Protocol (MCP)."*
- **Companion topics** shown as "related" on that same page (i.e., the set most top repos co-tag with `mcp-server`):
  - `model-context-protocol`
  - `mcp`
  - `llm`
  - `ai-agent` (note: singular, not `ai-agents`)
- **Secondary/observed topic:** `model-context-protocol-servers` also exists as its own GitHub Topics page, used by curated-list repos (less common on individual server repos than on "awesome-list" aggregator repos).
- **Recommendation for SeldonFrame's repo topics:** `mcp-server`, `mcp`, `model-context-protocol`, `llm`, `ai-agent`, plus domain-specific ones reflecting the actual product: `crm`, `small-business`, `agents`, `website-builder` (these match the tag set already drafted in the prior submission kit for directory categories — reuse them as GitHub topics too for consistency).
- **Caveat:** attempts to scrape the exact topic-pill list off two specific popular repos (`github/github-mcp-server`, `modelcontextprotocol/servers`) did not return the topic pills through the fetch tool (GitHub renders them client-side in a way that didn't surface in the fetched markdown) — the `mcp-server` + related-topics list above comes from the **topic landing page itself**, which is reliable, but treat any single-repo topic list as unconfirmed until checked by hand in a browser.

**Sources:**
- [github.com/topics/mcp-server](https://github.com/topics/mcp-server)
- [github.com/topics/model-context-protocol-servers](https://github.com/topics/model-context-protocol-servers)

---

## Summary of what changed recently vs. older docs/assumptions

1. **Cursor's directory is no longer a flat MCP-server list** — it's now a plugin-bundle system (`plugin.json` + `mcp.json`, `github.com/cursor/plugins` spec) with an automated code-review-agent gate. The old `github.com/cursor/mcp-servers` repo is deprecated.
2. **PulseMCP's "use case" submission form is closed** ("no longer accepting new use case submissions") — but the actual **server**-submission form at `pulsemcp.com/submit` is a separate, still-open form. Don't conflate the two.
3. **Official registry schema date is inconsistent across current official/near-official sources** (`2025-12-11` vs. a Microsoft Learn quickstart updated March 2026 showing `2025-10-17`) — re-check the live schema constant at publish time rather than hardcoding either.
4. **Glama now gates automated GitHub-based submission on "servers must be on GitHub today"** — non-GitHub sources require a manual Discord ask. Not an issue for SeldonFrame (public monorepo) but worth knowing if any future closed-source variant needs listing.
5. **Vercel's Template gallery is a weaker fit than assumed** — it's built for deployable app templates living in their own repo/folder, not for listing an MCP server package; the "does it accept a monorepo subdir" question resolves to **no** in any documented convention — the practical path is a small standalone demo repo, not a subdir pointer into `seldonframe/seldonframe`.
