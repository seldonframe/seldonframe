# MCP Registry Submission Kit — SeldonFrame

> **Audience:** Max (the operator). Everything in here that requires an
> authenticated submit — pushing to the official registry, filing a PR, filling a
> directory form, submitting the ChatGPT app — is **done by you**. This doc gives
> you the exact `server.json`, the per-directory copy, and the precise steps. No
> code change ships with this doc.
>
> **Date:** 2026-06-26 · **Branch context:** `feature/chatgpt-app-submission`

---

## 0. TL;DR — what is actually publishable, and the honest caveat

SeldonFrame already exposes **two distinct MCP-over-HTTP servers** (both JSON-RPC
2.0, Streamable HTTP, protocol `2025-06-18`):

| # | Server | Endpoint | Auth | Publishable as a standalone registry server? |
|---|--------|----------|------|-----------------------------------------------|
| **A** | **ChatGPT App / Platform server** | `POST https://app.seldonframe.com/api/chatgpt/mcp` | **None — public, keyless** | **YES, cleanly.** One stable public URL, no per-user secret. This is the flagship registry entry. |
| **B** | **Per-agent marketplace rental server** | `POST https://app.seldonframe.com/api/v1/agents/{slug}/mcp` | **Per-renter signed rental key** (`Authorization: Bearer rk_…`), scoped to one `{slug}` | **PARTIALLY.** The URL is per-agent (`{slug}`) and needs a rental key the renter mints from the listing page. It is NOT a single keyless endpoint. |

### The honest answer to "is SF a standalone connectable server?"

- **Server A (ChatGPT/platform)** is a textbook standalone remote server: publicly
  reachable, no credential, three high-level tools. **Publish this as the flagship.**
- **Server B (per-agent)** is *connectable*, but it is **not** a single
  fixed-URL keyless server. Two things make it non-standard for a registry listing:
  1. **The URL embeds the agent `slug`** — there is no one canonical agent; there are
     N published agents. The registry models this with a **URL template variable**
     (`{slug}`), which is a first-class supported pattern.
  2. **It requires a per-renter rental key** the user generates on the marketplace
     listing ("Rent via MCP" → "Generate rental key"). The registry can declare a
     required secret header, but it cannot *issue* the key — the user still has to get
     it from SeldonFrame first.

  **Recommendation:** list Server B as **one umbrella "SeldonFrame Marketplace" entry**
  using the `{slug}` URL-template form, with the auth note that the Bearer key is minted
  per agent on the listing page. Do **not** attempt to publish one registry entry per
  published agent — that would spam the registry and break on every new/edited listing.
  Per-agent discovery is better served by SeldonFrame's own `/marketplace` storefront
  (already SEO/GEO-optimized) and the programmatic `/ai-agents/[job]` pages.

So: **simplest publishable unit = the keyless ChatGPT/platform server (A).** The
per-agent rental rail (B) ships as a single templated umbrella entry plus a clear
"how to get a key" note.

---

## 1. Verified endpoint findings (from source)

All paths below are under `packages/crm/src/`.

### 1A. Per-agent marketplace rental server (Server B)

- **Route:** `app/api/v1/agents/[slug]/mcp/route.ts`
  - `POST` only (plus `OPTIONS` for CORS). CORS is `Access-Control-Allow-Origin: *`.
  - Canonical URL builder (`resourceUrl`): `${NEXT_PUBLIC_APP_URL || "https://app.seldonframe.com"}/api/v1/agents/${slug}/mcp`.
  - Thin wrapper → `handleAgentRentalRpc(slug, rawBody, bearer, REAL_DEPS, headers)` in `lib/marketplace/agent-mcp-handler.ts`.
- **Wire layer (pure):** `lib/marketplace/agent-mcp-rpc.ts`
  - `MCP_PROTOCOL_VERSION = "2025-06-18"`.
  - `initialize` → `{ protocolVersion: "2025-06-18", capabilities: { tools: {}, prompts: {} }, serverInfo: { name: <agentName>, version: "1.0.0" } }`.
  - **JSON-RPC methods handled:** `initialize`, `ping`, `notifications/initialized`
    (→ 202, no body), `tools/list`, `tools/call`, `prompts/list`, `prompts/get`.
  - **Tools exposed (`tools/list`):**
    - `get_quote_range` — deterministic, blueprint-carried (reads `quoteRanges`); zero owner compute. Input `{ service: string }`.
    - `provide_faq_answer` — deterministic FAQ keyword match (reads `faq`); zero owner compute. Input `{ question: string }`.
    - `ask` — **optional** "agent-as-a-service": delegates the whole task to the live agent on the **creator's** LLM key + workspace. Input `{ message: string, conversation_id?: string }`.
  - **Prompt exposed (`prompts/list` / `prompts/get`):** `act_as_<slug>` — returns the agent's `blueprint.customSkillMd` (its playbook) framed so the *renter's own model* can drive the deterministic tools at zero owner cost. This "renter brings the fuel" model is the default; `ask` is the paid fallback.
  - Workspace-stateful tools (`book_appointment`, `look_up_availability`, `take_message`, CRM writes) are **deliberately NOT exposed** over rental — they'd write to the creator's workspace. They stay install-only.
- **Auth — signed rental key (no DB):** `lib/marketplace/rental-token.ts`
  - Token format: `rk_<base64url(payload)>.<base64url(hmacSha256(secret, payload))>`.
  - Payload: `{ v: 1, s: <slug>, o: <renterOrgId>, n: <nonce>, x: <expiresAtMs> }`.
  - Algorithm: **HMAC-SHA-256** over the base64url payload; constant-time verify (`timingSafeEqual`); **90-day TTL** (`RENTAL_KEY_DEFAULT_TTL_SECONDS`).
  - The `slug` is signed into the payload **and** cross-checked against the URL path slug on every call — a key for agent A can't authenticate agent B.
  - Header: `Authorization: Bearer rk_…`. Missing/invalid/expired/wrong-agent each return a distinct JSON-RPC error (`-32000`).
  - Secret resolution: `lib/marketplace/rental-secret.ts` (`getRentalSigningSecret`).
- **How a renter gets a key (UI):** marketplace listing detail page
  `app/(public)/marketplace/[slug]/page.tsx` → island
  `components/marketplace/listing-actions-client.tsx` → **"Rent via MCP"** panel →
  **"Generate rental key"** calls `generateAgentRentalKeyAction({ slug })`
  (`lib/marketplace/rental.ts`). The panel shows the endpoint + a copyable config
  snippet with the live key spliced in.
  - Canonical endpoint + snippet helpers: `components/marketplace/marketplace-data.ts`
    - `mcpEndpointFor(slug)` → `https://app.seldonframe.com/api/v1/agents/${slug}/mcp`
    - `mcpSnippetFor(slug)` → the `mcpServers` config below (placeholder `Bearer sk_live_…`, replaced with the real `rk_…` key after generation).
  - **Exact snippet shape shown to renters:**
    ```json
    {
      "mcpServers": {
        "<slug>": {
          "url": "https://app.seldonframe.com/api/v1/agents/<slug>/mcp",
          "headers": {
            "Authorization": "Bearer rk_…"
          }
        }
      }
    }
    ```
- **Metering (inert, money-safe):** `tools/call` may return HTTP **402** with an x402
  `accepts` body. The settlement verifier is the **dev stub** (`devStubVerifier` in
  `lib/marketplace/x402.ts`) — **no money moves**. Lanes/pricing in
  `lib/marketplace/rental-pricing.ts` (`SF_FREE_CALLS = 100`, `SF_FLOOR_CENTS_PER_CALL = 2`;
  builder agents add a 5% fee). Live USDC settlement is a documented TODO gated on
  `X402_PAY_TO` + a real facilitator — until then the rail serves free. **None of this
  affects the registry listing** (the deterministic tools + `ask` work without payment
  config).

### 1B. ChatGPT App / platform server (Server A)

- **Route:** `app/api/chatgpt/mcp/route.ts`
  - `POST` (JSON-RPC), `GET` (health probe for the connector wizard), `OPTIONS` (CORS).
  - **Keyless by design** — no OAuth, no API key in v1. `build_workspace` mints an
    anonymous workspace bearer returned as `workspace_token`, which threads
    `deploy_agent` later in the same chat.
  - Thin wrapper → `handleChatGptRpc(raw, buildRealDeps(ip))` in
    `lib/chatgpt-app/chatgpt-mcp-handler.ts`.
- **Wire layer:** `lib/chatgpt-app/chatgpt-mcp-rpc.ts` (re-exports `MCP_PROTOCOL_VERSION = "2025-06-18"`).
  - `initialize` → `serverInfo: { name: "SeldonFrame", version: "1.0.0" }`, plus an
    `instructions` string describing the build → browse → deploy flow.
  - **JSON-RPC methods:** `initialize`, `ping`, `notifications/initialized`, `tools/list`, `tools/call`.
  - **Tools (`tools/list`), each returns text + `structuredContent` for Apps SDK widgets:**
    - `build_workspace` — create a full front office (site + booking + intake + CRM + chatbot) on a real subdomain; returns `{ url, workspaceToken, claimUrl }`. No login.
    - `browse_marketplace` — list installable agents; returns `{ agents: [{ slug, name, description, niche, price }] }`.
    - `deploy_agent` — install a marketplace agent into a workspace built earlier in the chat; free installs immediately, paid returns a claim URL (**never charges a card**).
- **OpenAI domain verification:** `app/.well-known/openai-apps-challenge/route.ts`
  serves a static `text/plain` ownership token (`200`). Confirm the live token before
  submitting the app.

---

## 2. `server.json` files (official MCP Registry schema)

Schema: `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`
(confirm the latest dated schema at publish time — the registry is in preview and the
date string moves).

### Namespace decision

- The registry verifies namespace ownership two ways:
  - `io.github.<owner>/<name>` → proven by **GitHub OAuth** (`mcp-publisher login github`).
  - `com.<domain>/<name>` (reverse-DNS of a domain you own) → proven by a **DNS TXT record**
    (`mcp-publisher login dns`).
- SeldonFrame owns `seldonframe.com`, so the natural namespace is **`com.seldonframe/*`**.
  Use `com.seldonframe/marketplace` for the flagship and `com.seldonframe/agent` for the
  per-agent rental rail. (If you'd rather avoid the DNS step for a first publish, you can
  fall back to `io.github.<your-org>/seldonframe-*` and prove via GitHub OAuth — but the
  branded `com.seldonframe` namespace is worth the one-time TXT record.)

### 2a. FLAGSHIP — `com.seldonframe/marketplace` (the keyless ChatGPT/platform server)

This is the one to publish first. It is a clean public remote server.

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "com.seldonframe/marketplace",
  "title": "SeldonFrame",
  "description": "Build a complete AI front office — public website, booking page, intake form, CRM, and AI agents — for a local service business from one description, then add agents from the marketplace. No login required.",
  "version": "1.0.0",
  "websiteUrl": "https://seldonframe.com",
  "repository": {
    "url": "https://github.com/REPLACE_ME/seldonframe",
    "source": "github"
  },
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://app.seldonframe.com/api/chatgpt/mcp"
    }
  ]
}
```

Notes:
- **No `headers` block** — the server is keyless. `build_workspace` returns a
  `workspace_token` *in-band* that the model passes to `deploy_agent`; nothing the user
  configures up front.
- Set `repository.url` to the real repo (or drop the `repository` object entirely if the
  code stays private — `repository` is optional for a remote-only server).
- `version` is the **server.json document version**, not an SF release; bump it when you
  re-publish.

### 2b. PER-AGENT RENTAL RAIL — `com.seldonframe/agent` (templated `{slug}` + Bearer key)

This is the honest representation of Server B as **one** umbrella entry. The `{slug}`
URL-template variable lets a single listing cover every published agent, and the `headers`
block declares the required (secret) Bearer rental key.

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "com.seldonframe/agent",
  "title": "SeldonFrame Agent (rental)",
  "description": "Connect to any published SeldonFrame marketplace agent as an MCP server. Exposes the agent's skill as a prompt plus deterministic get_quote_range / provide_faq_answer tools (driven by your own model at no cost), and an optional 'ask' tool that delegates to the live agent. Requires a per-agent rental key generated on the agent's marketplace listing.",
  "version": "1.0.0",
  "websiteUrl": "https://app.seldonframe.com/marketplace",
  "repository": {
    "url": "https://github.com/REPLACE_ME/seldonframe",
    "source": "github"
  },
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://app.seldonframe.com/api/v1/agents/{agent_slug}/mcp",
      "variables": {
        "agent_slug": {
          "description": "The marketplace slug of the agent to rent (from its listing URL, e.g. 'review-requester'). Find agents at https://app.seldonframe.com/marketplace.",
          "isRequired": true
        }
      },
      "headers": [
        {
          "name": "Authorization",
          "description": "Bearer <rental key>. Generate the key on the agent's marketplace listing → 'Rent via MCP' → 'Generate rental key'. Format: 'Bearer rk_…'. Valid 90 days, scoped to that one agent.",
          "isRequired": true,
          "isSecret": true
        }
      ]
    }
  ]
}
```

Notes:
- `{agent_slug}` is a registry **URL template variable** — the user supplies it when they
  add the server. This is exactly how multi-tenant remote servers are modeled.
- The `Authorization` header is declared `isSecret: true` so clients prompt for it
  securely. The registry **cannot mint** the key; the description tells the user where to
  get it (the listing page).
- Publish **this single entry**, not one per agent.

---

## 3. The publish flow for the official registry (CLI)

> You run these. They require auth (GitHub OAuth and/or a DNS TXT record on
> `seldonframe.com`).

1. **Install the publisher CLI** (macOS/Linux/WSL):
   ```bash
   brew install mcp-publisher
   # or grab a release binary:
   # curl -L "https://github.com/modelcontextprotocol/registry/releases/download/v1.0.0/mcp-publisher_1.0.0_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/
   ```

2. **Drop the `server.json` in a directory** (e.g. this folder, or a throwaway dir) — or
   run `mcp-publisher init` to scaffold a template and paste in section 2a/2b.

3. **Authenticate** for the `com.seldonframe` namespace via DNS:
   - Generate an ed25519 keypair (standard openssl; confirm against the current registry
     README, the CLI may also generate one for you):
     ```bash
     openssl genpkey -algorithm ed25519 -out mcp-registry.key
     # derive the base64 public key for the TXT record per the registry docs
     ```
   - Add a DNS TXT record on `seldonframe.com`:
     ```
     seldonframe.com.  IN  TXT  "v=MCPv1; k=ed25519; p=<BASE64_PUBLIC_KEY>"
     ```
   - Log in:
     ```bash
     mcp-publisher login dns --domain seldonframe.com --private-key <hex-or-path>
     ```
   - **Alternative (no DNS):** use `io.github.<org>/seldonframe-marketplace` as the name and
     `mcp-publisher login github` (interactive OAuth) instead. CI can use
     `mcp-publisher login github-oidc`.

4. **Publish:**
   ```bash
   mcp-publisher publish
   ```
   Repeat for the second `server.json` (the per-agent rental entry) from its own dir.

5. **Verify** it appears at `https://registry.modelcontextprotocol.io` (and the GitHub MCP
   Registry, which mirrors the official one).

> ⚠️ The registry is in **preview**; the schema date string, CLI flags, and exact DNS TXT
> format can change. Re-check the registry README/`publish-server` guide right before you
> run the commands.

---

## 4. Per-directory listing copy + submit steps

For each directory: ready-to-paste copy, the connect URL + auth, and the **exact submit
mechanism** (GitHub-crawl vs CLI vs form/PR). **Max does every authenticated submit.**

Shared assets you'll reuse:
- **Flagship name:** SeldonFrame
- **One-liner:** "Build a complete AI front office — website, booking, intake, CRM, and AI agents — for a service business from one sentence."
- **Connect URL (keyless flagship):** `https://app.seldonframe.com/api/chatgpt/mcp`
- **Connect URL (per-agent rental):** `https://app.seldonframe.com/api/v1/agents/{slug}/mcp` + `Authorization: Bearer rk_…`
- **Categories/tags:** `crm`, `marketing`, `scheduling`, `small-business`, `agents`, `website-builder`, `voice`, `reviews`
- **Logo/site:** `https://seldonframe.com`

---

### 4.1 Official MCP Registry — `registry.modelcontextprotocol.io`
- **Mechanism:** **CLI** (`mcp-publisher`). See section 3.
- **What to submit:** both `server.json` files (2a flagship, 2b per-agent).
- **Auth:** DNS TXT on `seldonframe.com` (or GitHub OAuth for an `io.github.*` name).
- **Copy:** use the `description` fields already in the `server.json`.
- **Note:** this is the **source of truth** most other directories crawl/mirror (incl. the
  GitHub MCP Registry). Do this one first.

### 4.2 Smithery — `smithery.ai`
- **Mechanism:** **GitHub-connect + deploy config.** Smithery lists servers from a connected
  GitHub repo (it reads a `smithery.yaml`). For a **remote** server you point it at the
  hosted URL.
- **Auth/submit:** sign in with GitHub at smithery.ai → "Add Server" / connect the repo →
  declare it as a remote (Streamable HTTP) server with URL `https://app.seldonframe.com/api/chatgpt/mcp`.
- **Name:** `SeldonFrame`
- **One-liner:** "AI front office (site, booking, CRM, agents) for service businesses — from one sentence."
- **Long description:**
  > SeldonFrame is an MCP server that builds and runs a complete front office for a local
  > service business. Call `build_workspace` to stand up a hosted website, booking page,
  > intake form, CRM, and AI chatbot on a real subdomain — no login. Then `browse_marketplace`
  > and `deploy_agent` to add AI agents (receptionist, review-requester, lead-qualifier,
  > booking concierge). Keyless; paid agents return a claim link and never charge a card.
- **Connect URL:** `https://app.seldonframe.com/api/chatgpt/mcp` · **Auth:** none.
- **Tags:** small-business, crm, scheduling, website-builder, agents.
- **Note:** Smithery prefers a connectable remote URL or an npm/stdio package. We have the
  remote URL → list it as remote. (If Smithery requires a repo, point it at the public repo
  or a thin published wrapper package if/when one exists — see the `publish-mcp-package`
  worktree.)

### 4.3 mcp.so — `mcp.so`
- **Mechanism:** **Form / "Submit" PR.** mcp.so has a "Submit" flow (web form backed by a
  GitHub repo of listings).
- **Submit:** go to mcp.so → Submit → provide name, URL, description, category, logo.
- **Name:** `SeldonFrame`
- **One-liner:** "Build a website + booking + CRM + AI agents for a service business from one prompt."
- **Long description:** (reuse 4.2 long description.)
- **Connect URL:** `https://app.seldonframe.com/api/chatgpt/mcp` · **Auth:** none.
- **Repo/site:** `https://seldonframe.com`
- **Category:** Business / Productivity.

### 4.4 Glama — `glama.ai/mcp/servers`
- **Mechanism:** **GitHub-crawl.** Glama auto-indexes public GitHub repos that contain MCP
  servers and also accepts manual submission of a hosted server.
- **Submit:** sign in at glama.ai → add/claim the server → provide the remote URL + metadata.
  If the repo is public, ensure it has a clear MCP server README so the crawler classifies
  it correctly.
- **Name:** `SeldonFrame`
- **One-liner:** "AI front-office builder for service businesses (site, booking, CRM, agents)."
- **Connect URL:** `https://app.seldonframe.com/api/chatgpt/mcp` · **Auth:** none.
- **Tags:** crm, scheduling, small-business, agents, website-builder.

### 4.5 PulseMCP — `pulsemcp.com`
- **Mechanism:** **Form submission** ("Submit a server"). PulseMCP curates and also mirrors
  the official registry, but a direct submit gets you a richer listing faster.
- **Submit:** pulsemcp.com → Submit Server → name, URL, description, category, links.
- **Name:** `SeldonFrame`
- **One-liner:** "One prompt → a full hosted front office (website, booking, intake, CRM) plus AI agents."
- **Long description:** (reuse 4.2.)
- **Connect URL:** `https://app.seldonframe.com/api/chatgpt/mcp` · **Auth:** none.
- **Use cases to list:** "set up a website for my business", "add a receptionist agent",
  "add a review-requesting agent".

### 4.6 awesome-mcp-servers — GitHub PR (e.g. `punkpeye/awesome-mcp-servers`)
- **Mechanism:** **GitHub Pull Request** against the README.
- **Submit:** fork the repo → add one line under the right category (e.g. **Business /
  Marketing & Sales** or **Customer Data Platforms**) → open a PR. Keep the format identical
  to surrounding entries.
- **Suggested entry line:**
  ```markdown
  - [SeldonFrame](https://seldonframe.com) 🌐 ☁️ - Build and run a complete AI front office (website, booking, intake, CRM) for a service business from one prompt, then add marketplace AI agents. Keyless remote MCP server.
  ```
  (Match the list's emoji legend: 🌐 = web/remote, ☁️ = cloud service; adjust to the repo's
  actual legend.)
- **Auth:** your GitHub account for the PR.

### 4.7 Composio — `composio.dev` / `mcp.composio.dev`
- **Mechanism:** **Composio's MCP server registry** lists hosted MCP servers / toolkits.
  Submission is via their app (add a custom MCP server) or a repo/listing PR depending on
  the current flow.
- **Submit:** sign in to Composio → MCP servers → "Add custom MCP server" / submit → provide
  the remote URL `https://app.seldonframe.com/api/chatgpt/mcp` (keyless) and metadata.
- **Name:** `SeldonFrame`
- **One-liner:** "Spin up a service-business front office + agents over MCP."
- **Connect URL:** `https://app.seldonframe.com/api/chatgpt/mcp` · **Auth:** none.
- **Note:** SF *also consumes* Composio (per-workspace managed OAuth) — keep the two roles
  distinct in the listing: here SF is the *provider*. The per-agent rental server (Server B)
  can be added separately as a keyed server if Composio supports a Bearer header field.

### 4.8 OpenAI App Directory (the **ChatGPT App**)
- **Mechanism:** **OpenAI submission form / developer console** for ChatGPT apps (Apps SDK).
  This is a review-gated submit, not a GitHub crawl.
- **Pre-reqs (already in the codebase — verify live):**
  - The Apps-SDK MCP server: `https://app.seldonframe.com/api/chatgpt/mcp` (tools return
    `structuredContent` for widgets).
  - Domain verification file served at `/.well-known/openai-apps-challenge` (confirm the live
    token matches what OpenAI gives you).
- **Submit:** in the OpenAI ChatGPT apps developer console → create app → set the MCP
  connector URL to the endpoint above → complete domain verification → fill the listing
  (name, description, icon, example prompts) → submit for review.
- **Name:** `SeldonFrame`
- **One-liner:** "Build a business website, booking, CRM, and AI agents — right inside ChatGPT."
- **Long description:** (reuse 4.2; emphasize the in-chat build → deploy flow and "no
  account needed".)
- **Example prompts to list:**
  - "Build a website and booking page for my plumbing company, Pacific Coast Heating."
  - "Show me AI agents I can add to answer my phones."
  - "Add the review-requester agent to my workspace."
- **Auth:** none for the end user (keyless); your OpenAI developer account for the submit.
- **Money-safety note for review:** paid agents return a claim link; the app never charges a
  card in-chat.

---

## 5. Submit-mechanism cheat sheet

| Directory | Mechanism | Who submits | Auth needed |
|-----------|-----------|-------------|-------------|
| Official MCP Registry | **CLI** (`mcp-publisher`) | Max | DNS TXT on seldonframe.com *or* GitHub OAuth |
| GitHub MCP Registry | (mirrors official) | — | — (covered by official) |
| Smithery | GitHub connect + remote URL | Max | GitHub sign-in |
| mcp.so | Web form / submit | Max | site account |
| Glama | GitHub-crawl + manual claim | Max | GitHub sign-in |
| PulseMCP | Web form | Max | site account |
| awesome-mcp-servers | **GitHub PR** | Max | GitHub account |
| Composio | App "add server" / submit | Max | Composio account |
| OpenAI App Directory | **Review-gated form** | Max | OpenAI developer account + domain verify |

---

## 6. Checklist before you submit anything

- [ ] Confirm the **live OpenAI challenge token** at `https://app.seldonframe.com/.well-known/openai-apps-challenge` matches what OpenAI issues.
- [ ] Confirm `https://app.seldonframe.com/api/chatgpt/mcp` answers a `GET` health probe and a `POST initialize` in production.
- [ ] Decide namespace: `com.seldonframe/*` (DNS) vs `io.github.<org>/*` (GitHub). Add the DNS TXT record if going `com.seldonframe`.
- [ ] Set `repository.url` in both `server.json` files (or remove `repository` if the repo stays private).
- [ ] Re-read the registry's current `publish-server` guide (preview → things move).
- [ ] Publish the **flagship (2a)** first; add the **per-agent rental (2b)** as a second entry.
- [ ] Do NOT publish one entry per agent — the per-agent rail is one templated umbrella entry.

---

## Sources

- [server.json Format Specification (generic-server-json.md)](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/generic-server-json.md)
- [Publishing Remote Servers — modelcontextprotocol.io](https://modelcontextprotocol.io/registry/remote-servers)
- [MCP Publisher CLI — publishing guide](https://modelcontextprotocol.info/tools/registry/publishing/)
- [Official MCP Registry](https://registry.modelcontextprotocol.io/docs)
