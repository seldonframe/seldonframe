# Seldon Frame

> Open source CRM framework that configures itself around your business model.

Build once, fork endlessly, and ship niche-specific CRM systems with your own voice, pipeline, and workflows.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/fixlyai/crm&env=DATABASE_URL,NEXTAUTH_SECRET,NEXTAUTH_URL,NEXT_PUBLIC_APP_URL,ANTHROPIC_API_KEY,NEXT_PUBLIC_DEMO_READONLY)
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

## Feature Highlights

| Area | What you get |
| --- | --- |
| Soul System | `/setup` wizard + generated organizational profile (`organizations.soul`) |
| Contacts | Tenant-scoped contact management + timeline context |
| Deals | Kanban and list views with drag-and-drop stage movement |
| Activities | Quick logging and task completion flows |
| Intake Forms | Internal builder + public form route + submission storage |
| API | `/api/v1` routes with API key guard, org scoping, and rate limiting |
| Demo Mode | UI toasts + API 403 guard for all write operations |

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

## AI Capabilities

| Capability | Behavior |
| --- | --- |
| Soul generation | Uses Anthropic when configured; falls back to deterministic templates |
| Brand voice scaffolding | Produces consistent labels, priorities, and tone rules |
| Suggested intake form | Generates business-specific field structures |
| Safe defaults | App remains usable without `ANTHROPIC_API_KEY` |

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
