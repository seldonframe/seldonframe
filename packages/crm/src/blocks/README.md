# SeldonFrame Blocks (v1.5.0+)

This directory is the **single source of truth** for block primitives in the
v2 (MCP-native) workspace creation architecture.

Each subfolder is one block. Each block ships exactly one author-edited file:
**`SKILL.md`**. Everything else (TypeScript Props type, Zod schema, block
metadata constants) is **code-generated** from `SKILL.md` into
`__generated__/block.ts`. The toSection mapping + deterministic validators
stay handwritten in `lib/page-blocks/registry.ts` (they're logic, not
schema).

## The contract

A `SKILL.md` has YAML frontmatter (the block's structural contract) and a
markdown body (the block's generation prompt + voice rules + examples for
the IDE agent's LLM to read at runtime).

### Frontmatter — supported fields

```yaml
---
name: hero                    # MUST match folder name
version: 1.0.0                # semver; bumped when prop schema changes
description: One-line summary surfaced in MCP tool listings + marketplace.
surface: landing-section      # landing-section | booking | intake
section_type: hero            # blueprint Section discriminator (hero / services-grid / about / faq / mid-cta / booking / intake)

props:
  fieldName:
    type: string | number | boolean | object | array | tuple | enum | union
    required: true | false    # default true
    nullable: true | false    # default false

    # Per-type fields:
    enum: [val1, val2]        # for type: enum
    min: N                    # for type: string (chars) or type: number
    max: N
    properties: {...}         # for type: object (recursive)
    items: {type, ...}        # for type: array (recursive)
    min_items: N              # for type: array
    max_items: N
    tuple: [{type,...}, {...}] # for type: tuple
    union: [{type,...}, {...}] # for type: union

    # Documentation (ignored by codegen, used by LLM):
    description: ...
    examples: [...]
    min_words: N              # prompt guidance only
    max_words: N

validators:                   # optional — descriptive only; actual
  - rule: ...                 # validator functions live in registry.ts
    severity: error | warn
    description: ...
---
```

### Body

The body is the **generation prompt** the operator's IDE agent reads when
producing block props. It contains:

1. **Voice rules** — the editorial constraints that distinguish good from generic.
2. **Worked examples** — 3+ concrete input → output samples across verticals.
3. **Output format** — a single instruction telling the model to return JSON
   matching the props schema.

## The codegen pipeline

```
packages/crm/src/blocks/<name>/
  SKILL.md                    # author edits this
  __generated__/
    block.ts                  # AUTO-GENERATED — never edit by hand
                              # Contains:
                              #   - PropsSchema (Zod, derived from frontmatter)
                              #   - Props type (z.infer)
                              #   - meta (name, version, surface, sectionType, description)
```

`lib/page-blocks/registry.ts` imports `PropsSchema`, `Props`, and `meta`
from each block's `__generated__/block.ts`, then bolts on the handwritten
`toSection` (props → blueprint section) and `validators` (deterministic
copy-quality checks).

### Workflow

```bash
# After editing any SKILL.md:
pnpm blocks:emit              # regenerates all __generated__/block.ts files

# CI runs this automatically:
pnpm blocks:emit:check        # exits non-zero if any __generated__/block.ts
                              # is stale relative to its SKILL.md
```

The `tests/unit/blocks-codegen-staleness.spec.ts` test runs `:check` on
every CI build. PRs that edit `SKILL.md` without re-running emit will
fail the staleness gate.

## Why this exists

The bug class v1.0–v1.4 kept hitting was *layer mismatch*: a JSON template
defined a default, the personality system overrode it, the renderer expected
a different shape, the validator checked a third. Every consumer carried
its own copy of the truth.

v1.5.0 closes the gap structurally for prop schemas: edit `SKILL.md` →
`pnpm blocks:emit` → everything that consumes the schema (runtime Zod
validation, TypeScript types, registry metadata) updates from one source.
The Cinder & Salt-style "form_fields documented as extras but persisted as
replacements" bug becomes structurally impossible *for prop schema drift*.
(Note: codegen kills schema drift, not handler-vs-documentation drift —
that requires behavioral contract tests.)

## What ships in v1.5.0

Seven blocks, all codegen-driven:

- `hero` — above-the-fold value claim + CTAs (landing-section)
- `services` — services grid with distinct icons (landing-section)
- `about` — trust-building copy about who/why (landing-section)
- `faq` — friction-removing questions (landing-section)
- `cta` — mid-page conversion (landing-section)
- `booking` — calendar config + form fields (booking surface)
- `intake` — lead-capture form (intake surface)

## Versioning

- **Patch** (`1.0.0` → `1.0.1`): tweak voice rules, examples, or validator
  thresholds. Existing block instances re-render identically.
- **Minor** (`1.0.0` → `1.1.0`): add an optional prop or validator. Backward
  compatible — old instances still render.
- **Major** (`1.0.0` → `2.0.0`): remove or rename a prop. Existing instances
  need migration; the renderer adapter handles the mapping or the operator
  is prompted to re-customize.

## Marketplace future

When the marketplace ships (post-v1.5), third-party blocks ship a folder of
the same shape. The runtime contract (frontmatter schema, body format,
codegen output) is the public API. The `__generated__/block.ts` shape is
what marketplace blocks must match — same Zod, same meta, same import
shape — so an external block plugs into `BLOCK_REGISTRY` with no per-block
runtime code.
