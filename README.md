# Seldon Frame

> Open source CRM framework that configures itself around your business model.

Build once, fork endlessly, and ship niche-specific CRM systems with your own voice, pipeline, and workflows.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/seldonframe/crm&env=DATABASE_URL,NEXTAUTH_SECRET,NEXTAUTH_URL,NEXT_PUBLIC_APP_URL,ANTHROPIC_API_KEY,NEXT_PUBLIC_DEMO_READONLY)
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

| Package | Role |
| --- | --- |
| `@seldonframe/crm` | Product app (UI, routes, server actions, domain modules) |
| `@seldonframe/core` | Shared primitives (event bus, telemetry, integrations, virality helpers) |
| `@seldonframe/payments` | Payment utilities and payment-domain logic |

## All Blocks (Current)

| Block | Included in OSS | Notes |
| --- | --- | --- |
| Hub | Yes | Unified command center and module entrypoint |
| Soul Wizard | Yes | `/setup` onboarding that writes `organizations.soul` |
| AI Customization | Yes | Claude/OpenAI adapters when configured; safe fallback otherwise |
| Dashboard | Yes | KPI cards and pipeline snapshots |
| Contacts | Yes | Tenant-scoped records, status, scoring, tags |
| Deals | Yes | List + stage movement with probability updates |
| Activities | Yes | Session/call/task tracking and completion flow |
| Bookings | Yes | Scheduling, status updates, provider resolution |
| Emails | Yes | Send + open/click tracking across providers |
| Landing Pages | Yes | Builder, publish flow, conversion events |
| Intake Forms | Yes | Builder + public submissions + webhook-ready workflow |
| Portal | Yes | Access code auth, messaging, resources |
| API/Webhooks | Yes | `/api/v1` with key guard, org scoping, rate limiting |
| Demo Mode | Yes | UI and API write guards via `NEXT_PUBLIC_DEMO_READONLY=true` |

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
pnpm dev
```

Visit `http://localhost:3000`.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
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
2. Update Soul templates in `src/lib/soul/templates`.
3. Adjust schema-level fields in `src/db/schema` and generate migrations.
4. Tune labels and stage logic in `src/lib/soul` and dashboard pages.
5. Add your preset under `showcase/<niche>` with config + seed data.

Detailed notes: `CUSTOMIZATION.md`.

## Architecture

- App routes: `src/app/(dashboard)` and `src/app/(auth)`
- API layer: `src/app/api/v1`
- Domain actions: `src/lib/*/actions.ts`
- Tenant-aware schema: `src/db/schema`
- Runtime personalization: `src/lib/soul` + `src/components/soul`
- Demo protections: `src/lib/demo` + `src/components/shared/demo-toast-provider.tsx`

## Contributing

Contributions are welcome. Please read `CONTRIBUTING.md` before opening a PR.

## License

MIT — see `LICENSE`.

---

Built for developers, agencies, and builders who want to ship CRM systems faster.
