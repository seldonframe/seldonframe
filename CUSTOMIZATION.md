# Customization

Two audiences for this file:

- **Operators** who want to customize their workspace's UI, brand, or behavior — read [docs/your-business/upgrade-ui](https://seldonframe.com/docs/your-business/upgrade-ui). It covers the four customization levers (motion preset, DESIGN.md import, Claude Design handoff, fork) and when to use each.
- **Contributors** who want to extend the platform itself — read [CONTRIBUTING.md](CONTRIBUTING.md). It has six concrete contribution recipes (skill packs, MCP tools, blocks, motion primitives, vertical templates, eval gate) with file paths and reviewer expectations.

This file is a brief pointer. The detail lives in those two places.

## Customization layers

SeldonFrame separates customization by audience:

| Layer | Audience | How |
|---|---|---|
| **Brand theme** (colors, font, logo) | Operator | `set_brand_theme` MCP tool, or `apply_design_md` for full design systems |
| **Motion intensity** | Operator | `apply_motion_preset({ preset: "minimal" \| "subtle" \| "balanced" \| "editorial" })` |
| **Custom components from AI tools** | Operator | `import_claude_design_handoff({ bundle })`, or paste v0/Lovable/Cursor output into `update_landing_page` |
| **Skill packs** (agent behavior) | Operator + contributor | Edit markdown in `packages/crm/src/lib/agents/skills/` |
| **Block components** (page layouts) | Contributor | New block component + registry entry — see CONTRIBUTING.md Recipe 3 |
| **MCP tools** (new capabilities) | Contributor | New tool registry entry + CRM route — see CONTRIBUTING.md Recipe 2 |
| **Vertical templates** (Soul presets) | Contributor | New Soul template + 8 eval scenarios — see CONTRIBUTING.md Recipe 5 |
| **Direct fork** (pixel-perfect) | Power user | AGPL-3.0 fork, edit anything, deploy. Modifications must be shared per AGPL — see [LICENSING.md](LICENSING.md) |

## The shortest path for each common need

- *"My agent needs to handle late-night SMS differently"* → write a skill pack ([CONTRIBUTING.md Recipe 1](CONTRIBUTING.md))
- *"I need a new section type — case studies, comparison table, etc."* → add a block component ([Recipe 3](CONTRIBUTING.md))
- *"I have a brand kit I want applied"* → `apply_design_md` MCP tool, or set theme directly via `set_brand_theme`
- *"My HVAC chatbot needs vertical-specific knowledge"* → either a skill pack (lighter touch) or a vertical template (full Soul preset)
- *"My pages need to feel more premium"* → `apply_motion_preset({ preset: "editorial" })`
- *"None of the above — I need pixel-perfect control"* → fork. AGPL-3.0 applies; see [LICENSING.md](LICENSING.md)

## Why this structure

The platform follows the *thin harness, fat skill* pattern:

- **Capability** (what's possible) lives in TypeScript: MCP tools, blocks, motion primitives, the eval gate.
- **Behavior** (how it acts) lives in markdown skill packs: greeting style, refusal rules, tone, vertical knowledge.
- **Visual polish** lives in composable primitives: motion components, theme tokens, block-level CSS.

This separation is what makes SeldonFrame antifragile to LLM improvements — when the model gets better, your agents get better without us shipping new code. Read [CONTRIBUTING.md](CONTRIBUTING.md)'s "Architecture orientation" section for the full bet.
