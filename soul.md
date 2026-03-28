# Soul System

The Soul is SeldonFrame's identity/configuration layer stored per organization.

At onboarding, each org defines business context, vocabulary, labels, workflow, and priorities.
The CRM then adapts labels, suggested fields, messaging voice, and default process behavior
without code changes.

## Current Wizard Flow (8 steps)

The current `SoulWizard` in `packages/crm/src/components/soul/soul-wizard.tsx` runs:

1. Business name
2. Industry/practice type
3. Business description
4. Client label + ideal client description
5. Process mapping / pipeline stages
6. Voice + communication style
7. Priorities
8. Reveal + save generated Soul config

## Current Blocks Driven by Soul

Soul labels and/or suggested config currently shape:

- Dashboard labels and messaging
- Contacts labels and suggested custom fields
- Deals/pipeline naming and stages
- Activities naming
- Bookings copy defaults and booking experience context
- Emails tone context and template defaults
- Forms/intake terminology
- Landing page/portal messaging surfaces tied to org identity

Primary dashboard module routes include:
`/dashboard`, `/contacts`, `/deals`, `/bookings`, `/landing`, `/emails`, `/forms`, `/settings`
(plus `/hub` route as deep-link utility surface).

## Current Integration State

Soul generation supports:

- AI-assisted generation via Anthropic when configured
- Deterministic fallback generation when AI keys are absent

Operational integrations now include:

- Booking provider resolution in CRM (`zoom`, `google-meet`, `google-calendar`, `microsoft-graph`, fallback `manual`)
- Google Calendar booking sync flows in CRM, gated by Google OAuth/env availability

## Current Data Model

Soul is stored in `organizations.soul` (`jsonb`) and includes (see `packages/crm/src/lib/soul/types.ts`):

- `entityLabels` (`contact`, `deal`, `activity`, `pipeline`, `intakeForm`)
- `pipeline` (name + stages)
- `suggestedFields` (`contact`, `deal`)
- `contactStatuses`
- `voice` (style/vocabulary/avoid words/sample phrases)
- `priorities`
- `aiContext`
- `suggestedIntakeForm`
- `branding`
- `rawInput`

Related runtime usage:

- Server access: `getSoul()` (`packages/crm/src/lib/soul/server.ts`)
- Client context: `SoulProvider` + soul-aware label helpers (`packages/crm/src/lib/soul/labels.ts`)

## Developer Notes

- Keep Soul backward compatible; new fields should be additive.
- Preserve `orgId` scoping for all soul-derived behavior.
- Prefer Soul-driven labels over hardcoded entity names in UI copy.
