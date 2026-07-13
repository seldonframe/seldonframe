# SeldonFrame Quickstart

Two paths. Same source code. Pick based on whether you want to host the database yourself or let SF host it.

## Hosted (recommended for most operators)

SF runs the Postgres database, the Next.js app, and the durable workflows on its own infrastructure (Vercel + Neon). You bring your LLM key, your customers, and your domain. Free tier; no credit card.

You pick the chrome — same hosted backend either way:

```bash
# Drive it from Claude Code (or any MCP-aware IDE: Cursor, Windsurf, Devin)
claude mcp add seldonframe -- npx -y @seldonframe/mcp
```

Then in Claude Code:

```
> Build a Business OS for [your business]. [city, state]. [services].
  [phone, optional email].
```

Or sign up at the dashboard: [app.seldonframe.com/signup](https://app.seldonframe.com/signup) — same product, same backend, no setup time.

Pricing for paid tiers: $29/mo (Pro) or $99/mo (Agency, white-label). See [seldonframe.com/#pricing](https://seldonframe.com/#pricing).

## Self-host

Run the entire stack on your own infrastructure. AGPL-3.0-licensed source code; full control over data, deploy target, and customization.

### Fastest path — Docker Compose

One command brings up Postgres, the database proxy, migrations, and the app:

```bash
git clone https://github.com/seldonframe/seldonframe.git
cd seldonframe
cp .env.docker.example .env.docker     # then add your ANTHROPIC_API_KEY or OPENAI_API_KEY
docker compose up --build              # → http://localhost:3000
```

That's it — data lives in a local Postgres volume, and nothing leaves your machine except the LLM calls you configure. Compose runs the schema migrations for you before the app starts.

> Why the extra `neon-proxy` service? In production SeldonFrame runs on Neon, whose driver speaks SQL-over-HTTP. The proxy lets that same runtime talk to your own plain Postgres — see [`packages/crm/src/db/index.ts`](packages/crm/src/db/index.ts). Migrations connect to Postgres directly.

### Manual path — run from source

#### Prerequisites

- Node.js 20+
- pnpm 10+
- Postgres 15+ (Neon, Supabase, or local)
- Anthropic or OpenAI API key

#### Setup

```bash
git clone https://github.com/seldonframe/seldonframe.git
cd seldonframe
pnpm install
cp packages/crm/.env.example packages/crm/.env.local
```

Fill in `packages/crm/.env.local`:

```bash
DATABASE_URL=postgresql://...
AUTH_SECRET=...                 # generate with: openssl rand -hex 32
NEXTAUTH_SECRET=$AUTH_SECRET
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENCRYPTION_KEY=...              # generate with: openssl rand -hex 32

# Pick one (operators bring their own; the runtime uses whichever is set)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Optional integrations (add as needed)
RESEND_API_KEY=...              # transactional email
TWILIO_ACCOUNT_SID=...          # SMS
STRIPE_SECRET_KEY=...           # payments
```

#### Database

```bash
pnpm db:generate
pnpm db:migrate
```

#### Run

```bash
pnpm dev:crm                    # → http://localhost:3000
```

#### Build (for production deploy)

```bash
pnpm build
```

The CRM app at `packages/crm/` is the deployable. Drop it into Vercel, Railway, Fly.io, or self-host on a VPS.

## Monorepo layout

```
seldonframe/
├── packages/
│   ├── crm/          # Main Next.js app — dashboard + public site + API
│   └── core/         # Shared utilities, telemetry, integrations
├── skills/
│   └── mcp-server/   # @seldonframe/mcp — the MCP server (npm package)
├── README.md
├── CONTRIBUTING.md
└── LICENSING.md
```

Most contributions land in `packages/crm/src/` (UI, API routes, runtime) or `skills/mcp-server/src/tools.js` (MCP tools). See [CONTRIBUTING.md](CONTRIBUTING.md) for the six contribution recipes with file paths and expected line counts.

## Development guardrails

- Build green = ready to commit. `pnpm build` from repo root.
- Tenant scoping (`workspaceId` / `orgId`) is a hard invariant — never bypass it.
- Skill packs (markdown) for behavior; MCP tools for capability. Don't mix.
- For agent-behavior changes, add eval scenarios — the suite must stay ≥87.5% passing.

## Next

- [Connect Claude Code](https://seldonframe.com/docs/getting-started/connect-claude-code) — the MCP setup in detail
- [Build a chatbot](https://seldonframe.com/docs/agents/build-chatbot) — the most common first ship
- [Upgrade your UI](https://seldonframe.com/docs/your-business/upgrade-ui) — the four levers for power users
- [CONTRIBUTING.md](CONTRIBUTING.md) — six concrete contribution recipes
