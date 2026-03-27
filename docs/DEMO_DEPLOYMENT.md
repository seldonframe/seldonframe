# Demo Deployment Guide

Deploy a read-only SeldonFrame demo with the coaching niche, all blocks configured, and sample data.

## Prerequisites

- Neon database (or any Postgres)
- Node.js 20+
- pnpm 10+

## Steps

### 1. Set up the database

```bash
# Push the schema to your demo database
DATABASE_URL="your-neon-url" pnpm db:push
```

### 2. Configure environment

```bash
cp packages/crm/.env.demo packages/crm/.env.local
```

Edit `packages/crm/.env.local` and set:
- `DATABASE_URL` — your Neon connection string
- `AUTH_SECRET` / `NEXTAUTH_SECRET` — a random secret (e.g. `openssl rand -base64 32`)
- `NEXT_PUBLIC_APP_URL` — your demo domain

The key setting is:
```
NEXT_PUBLIC_DEMO_READONLY="true"
```
This enables read-only mode across all write paths (server actions, API routes, and client UI).

### 3. Seed demo data

```bash
pnpm db:seed-demo
```

This populates the coaching niche with:
- **1 organization** — Summit Coaching (pro plan, full Soul config)
- **1 owner** — Alex Rivera
- **1 pipeline** — Client Journey (5 stages)
- **8 contacts** — across all statuses (inquiry → active → past)
- **8 deals** — spread across pipeline stages
- **8 activities** — sessions, calls, notes, tasks
- **6 bookings** — mix of completed and upcoming
- **7 emails** — sent/queued with open/click stats
- **2 landing pages** — published with sections
- **1 intake form** — with 3 submissions
- **5 portal messages** — client/coach conversation threads
- **6 portal resources** — documents and links

### 4. Build and deploy

```bash
pnpm build
```

Deploy `packages/crm` to your hosting provider (Vercel, Netlify, etc.).

For Vercel:
```bash
cd packages/crm
vercel --prod
```

### 5. Demo login

The demo seed creates a user `alex@summitcoaching.demo`. Since demo mode blocks signup, you may need to pre-configure your auth provider to allow this user, or use a demo-specific login bypass.

## What's read-only?

When `NEXT_PUBLIC_DEMO_READONLY=true`:

| Layer | Behavior |
|---|---|
| **Server actions** | `assertWritable()` throws before any DB write |
| **API routes** | POST/PUT/PATCH/DELETE return `403` with fork message |
| **Client UI** | Forms show a toast with "Fork SeldonFrame to build your own" |

All read operations (listing contacts, viewing deals, browsing landing pages, etc.) work normally.

## Showcase configs

The coaching niche is the default. To switch niches:

1. Copy `showcase/<niche>/framework.config.ts` → `packages/crm/framework.config.ts`
2. Update the `soul` column in `organizations` with the matching `soul-template.json`
3. Optionally run the niche-specific `showcase/<niche>/seed.sql`

Available niches: coaching, agency, real-estate, ecommerce, saas.

## Block coverage

| Block | Status |
|---|---|
| CRM (contacts, deals, pipeline) | ✅ Full sample data |
| Activities | ✅ Sessions, calls, notes, tasks |
| Booking | ✅ Upcoming + completed appointments |
| Email | ✅ Sent + queued with stats |
| Landing Pages | ✅ Published with sections |
| Intake Forms | ✅ Form + submissions |
| Portal | ✅ Messages + resources |
| Hub | ✅ Unified shell with Soul wizard |
| AI Customization | ✅ Panel (requires ANTHROPIC_API_KEY) |
| Soul System | ✅ Pre-configured coaching Soul |
