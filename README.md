# Seldon Frame

> Open source CRM framework that configures itself around your business model.

Build once, fork endlessly, and ship niche-specific CRM systems with your own voice, pipeline, and workflows.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/seldonframe/crm&env=DATABASE_URL,AUTH_SECRET,NEXTAUTH_SECRET,NEXTAUTH_URL,NEXT_PUBLIC_APP_URL,ANTHROPIC_API_KEY,NEXT_PUBLIC_DEMO_READONLY)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![License](https://img.shields.io/badge/license-MIT-green)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)

## Demo

![Seldon Frame Demo](public/demo/soul-setup.gif)

If the GIF does not load on your GitHub viewer, use the fallback notes in `DEMO_GIF.md`.

## Why Seldon Frame

Most OSS CRMs are finished products. Seldon Frame is a framework-first base you can shape into your own offer.

- Multi-tenant by default (`orgId` on core records)
- AI-assisted Soul onboarding that changes labels, tone, stages, and branding
- Headless API + modern dashboard out of the box
- Public intake forms + webhook-ready submission flow
- Demo read-only mode for safe live previews (`NEXT_PUBLIC_DEMO_READONLY=true`)

## Ecosystem at a Glance

| Workspace | Role |
| --- | --- |
| `packages/crm` (`@seldonframe/crm`) | Product app (UI, routes, server actions, domain modules) |
| `packages/core` (`@seldonframe/core`) | Shared primitives (event bus, telemetry, integrations, virality helpers) |
| `packages/payments` (`@seldonframe/payments`) | Payment utilities and payment-domain logic |
| `apps/web` | Marketing/web app workspace |
| `apps/cloud` | Cloud app workspace |
| `apps/pro` | Pro app workspace |

## Blocks

SeldonFrame is built as modular blocks. Each block can be enabled or disabled independently.

### Built-in Blocks

| Block | Description |
| --- | --- |
| CRM | Contacts, deals, and pipeline workflows |
| Booking | Scheduling with public booking pages |
| Landing Pages | Visual page builder and publishing |
| Email | Templates and outbound email workflows |
| Forms | Intake forms that create contacts |
| Payments | Stripe Connect payment flows |
| Automations | Trigger → condition → action workflows |

### Block Marketplace

Cloud Pro and Pro users can install additional blocks from the marketplace. Blocks are defined by universal BLOCK.md specs and generated to match host codebase patterns.

Browse available blocks: marketplace (native, in-app)

### Build a Block

Anyone can create a BLOCK.md, a universal spec that describes block behavior.

- Read the [`BLOCK.md Specification`](./BLOCK_MD_SPEC.md)
- See [`example BLOCK.md files`](./blocks/examples/)
- Read how souls and blocks relate in [`SOUL_SPEC.md`](./SOUL_SPEC.md)

Blocks are the capability layer; soul is the identity layer that personalizes every installed block.

## Showcase Packs

Use these ready-to-fork niche presets:

| Pack | Focus |
| --- | --- |
| `showcase/coaching` | Coaching and client transformation workflows |
| `showcase/real-estate` | Lead-to-close property pipeline |
| `showcase/agency` | Service delivery and account management |
| `showcase/ecommerce` | Store-centric retention and lifecycle management |
| `showcase/saas` | Trial-to-paid onboarding and expansion tracking |

See `showcase/README.md` for usage details.

## Integrations

Seldon Frame uses a typed adapter system in `packages/core/src/integrations`.

| Tier | Integrations |
| --- | --- |
| Tier 1 (bundled) | Stripe, Resend, SendGrid, Postmark, Google Calendar, Microsoft Graph, Claude |
| Tier 2 (lazy-loaded by env) | Twilio, Google Meet, Zoom, UploadThing, S3/R2, Plausible, PostHog, OpenAI |

Integration adapters expose:
- `isConfigured()` for env readiness
- `initialize(config)` for runtime setup
- `healthCheck()` for operational status

CRM booking integration behavior (current):
- Provider resolution supports `zoom`, `google-meet`, `google-calendar`, `microsoft-graph`, fallback `manual`
- Google Calendar sync is active in CRM booking flows when Google OAuth/env are configured

## AI Capabilities

| Capability | Behavior |
| --- | --- |
| Soul generation | Uses Anthropic when configured; deterministic templates otherwise |
| Brand voice scaffolding | Generates labels, priorities, messaging style, and constraints |
| Suggested intake form | Produces business-specific form fields |
| Safe defaults | App remains usable without AI API keys |

## SeldonFrame Pro

SeldonFrame Pro is the commercial layer planned on top of OSS.

Planned Pro surfaces:
- Managed deployment controls and team governance
- Premium starter packs and advanced templates
- Enterprise auth/integration presets and support workflows
- Operational tooling for agencies shipping many client instances

## SeldonFrame Cloud Waitlist

SeldonFrame Cloud is planned as a hosted experience for teams that want managed infra.

Join the waitlist by opening a GitHub Discussion with title prefix `Cloud Waitlist` and your use case:
- `https://github.com/seldonframe/crm/discussions`

## Vibe Coder Playbook

For builders shipping fast with AI coding tools:

1. Pick a niche from `showcase/` and copy `framework.config.ts`.
2. Import matching `soul-template.json` into your org.
3. Run seed data (`pnpm db:seed-demo` or niche `seed.sql`).
4. Keep `orgId` scoping intact in every query/mutation.
5. Extend via `@seldonframe/core` before adding app-local duplicates.
6. Finish every milestone with `pnpm build`.

## Tech Stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js App Router, React, Tailwind |
| Auth | NextAuth v5 (Auth.js) |
| Database | Neon PostgreSQL |
| ORM | Drizzle ORM |
| API | Next.js Route Handlers (`/api/v1`) |
| AI | Anthropic Claude (optional) |
| Package Manager | pnpm |

## Quick Start

```bash
pnpm install
cp .env.example .env.local
pnpm db:generate
pnpm db:migrate
pnpm dev:crm
```

Visit `http://localhost:3000`.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Auth.js secret used by CRM auth layer |
| `NEXTAUTH_URL` | Yes | Auth callback base URL |
| `NEXTAUTH_SECRET` | Yes | Session/JWT encryption secret |
| `NEXT_PUBLIC_APP_URL` | Yes | Public app origin |
| `ANTHROPIC_API_KEY` | Optional | Enables AI Soul generation |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth |
| `NEXT_PUBLIC_DEMO_READONLY` | Optional | Enables demo write-block mode |

## Customization Guide

Start here when building a niche edition:

1. Edit `framework.config.ts` for global defaults.
2. Update Soul templates in `packages/crm/src/lib/soul/templates`.
3. Adjust schema-level fields in `packages/crm/src/db/schema` and generate migrations.
4. Tune labels and stage logic in `packages/crm/src/lib/soul` and dashboard pages.
5. Add your preset under `showcase/<niche>` with config + seed data.

Detailed notes: `CUSTOMIZATION.md`.

## Architecture

- App routes: `packages/crm/src/app/(dashboard)`, `packages/crm/src/app/(auth)`, `packages/crm/src/app/(onboarding)`
- API layer: `packages/crm/src/app/api/v1`
- Domain actions: `packages/crm/src/lib/*/actions.ts`
- Tenant-aware schema: `packages/crm/src/db/schema`
- Runtime personalization: `packages/crm/src/lib/soul` + `packages/crm/src/components/soul`
- Demo protections: `packages/crm/src/lib/demo` + `packages/crm/src/components/shared/demo-toast-provider.tsx`

Recent CRM UI capabilities:
- Split contact detail layout with right-side activity timeline
- Inline contacts table cell editing
- Deep command palette search across navigation + contacts + deals + pages + recent activity
- Booking availability schedule (working hours/day), buffers, max bookings/day, and public timezone display

## Contributing

Contributions are welcome. Please read `CONTRIBUTING.md` before opening a PR.

## License

MIT — see `LICENSE`.

---

Built for developers, agencies, and builders who want to ship CRM systems faster.
