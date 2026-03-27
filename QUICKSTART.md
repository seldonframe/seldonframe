# SeldonFrame Quickstart

## Prerequisites
- Node.js 20+
- `pnpm` 10+
- Postgres/Neon connection string

## 1) Install
```bash
pnpm install
```

## 2) Configure environment
Create `packages/crm/.env.local` with at least:

```bash
DATABASE_URL=...
AUTH_SECRET=...
NEXTAUTH_SECRET=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Optional for AI and integrations:

```bash
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
RESEND_API_KEY=...
POSTHOG_API_KEY=...
PLAUSIBLE_API_KEY=...
```

## 3) Run CRM only
```bash
pnpm dev:crm
```

## 4) Database lifecycle
```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## 5) Build checks
```bash
pnpm build
```

## Monorepo packages
- `packages/crm` - main Next.js CRM app
- `packages/core` - shared core modules (events, telemetry, integrations, virality)
- `packages/payments` - Stripe/payment utilities

## Development guardrails
- Every major step must end with a successful `pnpm build`.
- Keep changes scoped to the requested step.
- Preserve multi-tenant behavior (`orgId` scoping) in all data flows.
- Use `@seldonframe/core` shared modules before adding app-local duplicates.
