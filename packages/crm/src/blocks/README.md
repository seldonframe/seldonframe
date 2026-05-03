# SeldonFrame Blocks (v1.4.0+)

This directory is the **single source of truth** for block primitives in the
v2 (MCP-native) workspace creation architecture.

Each subfolder is one block. Each block ships exactly one author-edited file:
**`SKILL.md`**. Everything else (TypeScript types, Zod schemas, MCP tool
definitions, validator rules, marketplace listings) is derived from
`SKILL.md` — when generation/lint scaffolding lands, those derivations live
in `__generated__/` per block. For v1.4.0 the consumers read `SKILL.md`
directly at runtime.

## The contract

A `SKILL.md` has YAML frontmatter (the block's structural contract) and a
markdown body (the block's generation prompt + voice rules + examples).

### Frontmatter

```yaml
---
name: hero                    # block identifier; matches folder name
version: 1.0.0                # semver; bumped when prop schema changes
description: One-line summary surfaced in MCP tool listings + marketplace.
section_type: hero            # maps to existing Section discriminator (hero / services-grid / faq / about / mid-cta / ...)
props:                        # JSON-schema-style prop definitions
  headline:
    type: string
    required: true
    description: 4-9 words. Quantified benefit. NO generic phrases.
  # ...
validators:                   # deterministic post-generation checks
  - rule: headline_quantified
    severity: error
    description: Headline must include a number, %, ★, "free", "guaranteed", "same-day", "today".
  # ...
---
```

### Body

The body is the **generation prompt** the operator's IDE agent reads when
producing block props. It contains:

1. **Voice rules** — the editorial constraints that distinguish good from generic.
2. **Worked examples** — 3+ concrete input → output samples across verticals.
3. **Output format** — a single instruction telling the model to return JSON
   matching the props schema.

## Why one file?

The bug class v1.0–v1.3.5 kept hitting was *layer mismatch*: a JSON template
defined a default, the personality system overrode it, the renderer expected
a different shape, the validator checked a third. Every consumer carried
its own copy of the truth.

In v2 every consumer reads from this file:

- **MCP tool definition** (`get_block_skill`) returns the file body for the IDE agent.
- **Server-side persist endpoint** validates incoming props against the frontmatter schema.
- **Renderer adapter** maps validated props onto the existing Section type
  identified by `section_type`.
- **Validator** runs the rules listed in frontmatter on the rendered HTML.
- **Marketplace listing** (future) reads name + version + description.

If you change the prop schema, you change this file. Every consumer notices.

## What ships in v1.4.0

Three blocks: `hero/`, `services/`, `faq/`. These are the highest-stakes
copy surfaces — most layer-mismatch bugs lived here. v1 still owns
booking, intake, about, cta until v2 proves itself.

## Versioning

- **Patch** (`1.0.0` → `1.0.1`): tweak voice rules, examples, or validator
  thresholds. Existing block instances re-render identically.
- **Minor** (`1.0.0` → `1.1.0`): add an optional prop or validator. Backward
  compatible — old instances still render.
- **Major** (`1.0.0` → `2.0.0`): remove or rename a prop. Existing instances
  need migration; the renderer adapter handles the mapping or the operator
  is prompted to re-customize.

## Marketplace future

When the marketplace ships (post-v1.4), third-party blocks ship a folder of
the same shape. The runtime contract (frontmatter schema, body format) is
the public API.
