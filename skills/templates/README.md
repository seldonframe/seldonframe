# Workspace blueprint templates

This directory contains the deterministic blueprint system for SeldonFrame workspaces. One blueprint = one workspace. Same blueprint JSON → same rendered HTML/CSS for every surface, byte-for-byte.

## What's in here

| File | Purpose |
|---|---|
| `schema.json` | JSON Schema (Draft 2020-12) defining the blueprint shape. The contract every renderer reads. |
| `general.json` | Fallback blueprint. Industry-agnostic placeholder content. Used when Claude Code can't match a vertical pack. |
| `hvac.json` | First vertical content pack. HVAC-specific copy, services, intake fields, admin objects. |
| `README.md` | This file. |

Future verticals (`dental.json`, `legal.json`, `salon.json`, `coaching.json`, etc.) live in this directory as full self-contained blueprints — not deltas, not extends.

## How a workspace gets a blueprint

When `create_workspace({ name, industry, ... })` is called, the MCP server:

1. Reads the `industry` parameter from the call (or from rich `source` text via simple keyword match).
2. Looks for a matching template file in `skills/templates/<industry>.json`.
3. If found, loads that template as the starting point. Otherwise falls back to `general.json`.
4. Replaces the `[Your Business Name]`, `[City]`, `[Owner Name]`, etc. placeholders with the actual business data Claude Code collected from the user.
5. Customizes `workspace.theme.accent`, `workspace.contact.*`, and any landing.sections content the user provided.
6. Persists the resolved blueprint to the workspace record.
7. Returns workspace URLs that render from the blueprint.

The blueprint is **immutable per render**. Operator edits go through tool calls (`update_landing_content`, `update_theme`, `customize_intake_form`, `configure_booking`) which produce a new blueprint version.

## Renderer versioning

Each surface declares a frozen renderer ID:

```json
"landing":   { "renderer": "general-service-v1", ... }
"booking":   { "renderer": "calcom-month-v1", ... }
"intake":    { "renderer": "formbricks-stack-v1", ... }
"admin":     { "renderer": "twenty-shell-v1", ... }
```

A renderer ID is **frozen forever** once it ships. If we change the layout of `general-service-v1` in a way that's incompatible with existing blueprints, we ship `general-service-v2` and migrate blueprints explicitly. Old blueprints keep rendering with the old renderer.

This is the load-bearing rule of the system. It's how "deterministic, byte-for-byte" stays true across years of iteration.

## Adding a new vertical pack

1. **Copy `general.json` to `<industry>.json`** (e.g. `dental.json`).
2. **Replace the placeholder content** with industry-specific copy:
   - `workspace.industry` — the industry slug
   - `workspace.tagline` — one-liner that fits the vertical
   - `workspace.theme.accent` — recommended palette per vertical (see "Recommended palettes" below)
   - `workspace.contact.hours` — typical operating hours for the vertical
   - `landing.sections` — vertical-appropriate sections (e.g. add `emergency-strip` for HVAC/plumbing/locksmith; swap services-grid for a portfolio for salons; rename "Services" to "Practice Areas" for legal)
   - `landing.sections.services-grid.items` — vertical-specific services with sensible icons
   - `landing.sections.faq.items` — vertical-specific common questions
   - `booking.eventType` — the canonical first-touch booking for the vertical
   - `booking.formFields` — fields a customer needs to provide before the visit
   - `intake.questions` — vertical-specific intake (e.g. HVAC needs urgency + service address)
   - `admin.objects` — additional vertical-specific objects (e.g. HVAC adds `service_calls`, `equipment`, `technicians`; dental might add `appointments`, `treatments`, `insurance_carriers`)
3. **Validate against `schema.json`**:
   ```bash
   # Once the validation script ships in Phase 3:
   pnpm template:validate skills/templates/<industry>.json
   ```
4. **Test render** (Phase 3): preview the resulting workspace URLs against the new template before committing.
5. **Commit** with a message like `feat(templates): add dental vertical pack`.

## Recommended palettes per vertical

Per the design pattern research, the accent color should fit the trust signature of the vertical. Operators always override; these are the per-vertical defaults the templates ship with:

| Vertical | Default `theme.accent` | Reasoning |
|---|---|---|
| `general` | `#1A1A1A` (near-black) | Monochrome, safe across all industries (Cal.com pattern). |
| `hvac` | `#1E40AF` (deep blue) | Reliable, technical, "we know mechanical systems." |
| `plumbing` | `#1E40AF` or `#0F172A` | Same as HVAC. |
| `dental` | `#0D9488` (soft teal) | Clinical, calm, modern. |
| `legal` | `#0F172A` (deep navy) | Authoritative, conservative. |
| `salon` | `#1A1A1A` or `#7C3AED` | Monochrome for editorial salons; muted purple for full-service. |
| `coaching` | `#C2410C` (terracotta) or `#15803D` (sage) | Warm, human. |
| `real-estate` | `#0F172A` (navy) or `#7F1D1D` (deep red) | Professional + traditional. |
| `auto-repair` | `#B91C1C` (deep red) | Industrial, urgent. |
| `fitness` | `#15803D` (sage) or `#C2410C` (terracotta) | Energetic but not neon. |
| `consulting` | `#1A1A1A` (monochrome) | Professional, flexible. |

These are recommendations, not enforcements. The schema accepts any hex color as `theme.accent`.

## What you should NOT add to a vertical pack

Vertical packs are content packs — they change copy, icons, fields, and section selection. They do NOT introduce:

- ❌ New section types (those go in `schema.json` + the `general-service-v1` renderer code)
- ❌ New question field types (those go in `schema.json` + the `formbricks-stack-v1` renderer code)
- ❌ New admin field types (those go in `schema.json` + the `twenty-shell-v1` renderer code)
- ❌ Renderer overrides (renderer is the same `general-service-v1` for every vertical pack)
- ❌ Custom CSS or JS hooks
- ❌ Per-vertical layout changes (use section ordering and section variants instead — e.g. `hero.variant: "founder-portrait"` for coaching)

If a vertical genuinely needs structural change, that's a renderer-version bump (`general-service-v2`), not a per-vertical override. Resist the temptation to ship `dental.json` with custom rendering hooks — every override that lands in templates breaks the deterministic-blueprint claim.

## Validation

The `$schema` field at the top of every template references the local `schema.json`. Editors with JSON Schema support (VS Code, IntelliJ, Cursor) auto-validate as you type.

Before committing a new template:

1. Editor schema validation passes.
2. All required fields present.
3. All `[Bracketed]` placeholders look intentional (no accidental empty strings).
4. All `null` values are valid per their field's schema (e.g. `logoUrl: null` is fine; `name: null` is not).
5. `accent` is a valid hex color (3 or 6 digits).
6. `phone` numbers are E.164.
7. `timezone` is a valid IANA identifier.

Phase 3 ships a `pnpm template:validate` script that runs Ajv against every template and fails CI if any template doesn't conform.

## Why this design

Per Max's directive in the architectural brief:

> Do NOT use an LLM to generate the design. The design is HANDCRAFTED based on proven patterns. Only the business DATA is dynamic.

The blueprint is the seam between handcrafted design (renderer code, CSS tokens, section components) and dynamic business data (slot values from the blueprint JSON).

LLM involvement happens at **blueprint generation time**, not at render time. Claude Code reads the natural-language business description, picks the right vertical pack, fills in the slots, and submits the blueprint. From that point forward, the rendering is pure: same JSON → same HTML, every time.

This is what makes the system testable, debuggable, and trustworthy. A workspace's home page never "looks different today than it did yesterday" because no part of the design is generated at request time.

## See also

- `tasks/design-patterns-research.md` — Phase 1 research that informs this schema.
- (Phase 3) `packages/crm/src/lib/blueprint/renderer/` — the deterministic renderer implementations.
- (Phase 3) `packages/crm/scripts/template-validate.ts` — the Ajv-based validator.
