# Showcase Configs

Pick a niche, copy the `framework.config.ts`, optionally import the matching `soul-template.json`, and load `seed.sql` for demo data.

Each niche ships with **all blocks configured**: CRM entities, pipeline, custom fields, booking, landing pages, email, and portal.

## Included Niches

| Niche | App Name | Booking | Landing | Email | Portal |
|---|---|---|---|---|---|
| coaching | CoachCRM | Zoom 60 min | Hero + benefits + testimonials + CTA | Resend | Session notes, worksheets, recordings |
| agency | AgencyFlow | Google Meet 30 min | Hero + services + case studies + CTA | Resend | Deliverables, brand assets, reports |
| real-estate | EstateFlow | Google Calendar 45 min | Hero + listings + testimonials + CTA | Resend | Property details, contracts, guides |
| ecommerce | CommerceCRM | Disabled | Hero + products + reviews + CTA | Resend | Order history, invoices |
| saas | SaaS Revenue CRM | Google Meet 30 min | Hero + features + pricing + CTA | Resend | Usage reports, API docs, onboarding |

## What's in each niche directory

- `framework.config.ts` — Full `FrameworkConfig` with CRM entities, pipeline, features, and block-level configs (booking, landing, email, portal).
- `soul-template.json` — Pre-built `OrgSoul` with entity labels, voice, branding, intake form, and `blockDefaults` section.
- `seed.sql` — Demo data for the Neon database.
- `screenshot.png` — Reference screenshot.

## Quick Start
1. Copy `showcase/<niche>/framework.config.ts` to `packages/crm/framework.config.ts`.
2. Insert `showcase/<niche>/soul-template.json` into `organizations.soul` for your demo org.
3. Run `showcase/<niche>/seed.sql` against your Neon database.
4. Launch with `pnpm dev`.
