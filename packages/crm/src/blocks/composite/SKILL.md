---
name: composite
version: 1.0.0
description: Universal landing-page section built from low-level primitives. Use for any block that doesn't fit hero/services/about/faq/mid-cta — comparisons, pricing tiers, "how it works," stats rows, side-by-side image+text, custom CTAs, "vs the competition."
surface: landing-section
section_type: composite
# Composite's "props" are a recursive tree, not a flat YAML schema. The
# Zod schema is hand-written in lib/page-blocks/composite/schema.ts;
# `codegen: false` opts out of the SKILL.md → __generated__/block.ts
# emitter.
codegen: false
input: tree
---

# Composite section block

When the operator asks for a landing-page section that doesn't fit the typed vocabulary (hero / services / about / faq / mid-cta / trust-strip / testimonials / footer), build it as a **tree of low-level primitives**. The server renders the tree to HTML+CSS using the workspace's theme tokens. You don't type a "comparison block" — you compose one.

## When to use composite vs typed blocks

| Operator says | Use |
|---|---|
| "Add a hero section" | typed `hero` block via persist_block |
| "Replace the hero" | typed `hero` block |
| "Add a comparison of us vs DIY" | **composite** |
| "Add pricing tiers" | **composite** |
| "Add a how-it-works in 4 steps" | **composite** |
| "Add a stats row with 4 numbers" | **composite** |
| "Add a side-by-side image + bullet list" | **composite** |
| "Add an FAQ" | typed `faq` block |
| "Edit the FAQ headline" | `update_landing_section` |

If a typed block exists for what the operator wants, prefer it — typed blocks have richer validation and tighter SKILL.md guidance per type. Composite is the fallback for the long tail.

## Primitive vocabulary

12 node kinds. Every tree is built from these. Tree root MUST be `kind: "section"`.

### Containers

- `section` — top-level. `eyebrow?` (kicker, ≤60 chars), `headline?` (≤120), `subhead?` (≤240), `children`. Caps: ≤8 children.
- `row` — horizontal layout. `cols: 2 | 3 | 4` (default 2). `children`. Caps: ≤4 children. Stacks to 1 col on mobile.
- `col` — vertical layout (used inside `row` for asymmetric layouts, or standalone). `children`.
- `card` — boxed sub-container with border + padding. `variant?: "default" | "muted" | "primary"`. `children`. Caps: ≤8 children.

### Content leaves

- `heading` — `level: 1 | 2 | 3` + `text`. Levels MUST descend without skipping (h1 → h3 fails validation).
- `text` — paragraph. `text` (≤800 chars) + optional `emphasis: "muted" | "bold"`.
- `image` — `url` + optional `alt`. Use for decorative/illustrative images. For workspace logo/hero-bg use upload_workspace_image instead.
- `list` — `style: "bullet" | "check" | "x" | "number"` + `items` (≤12, each ≤200 chars). `check` = ✓ markers for "with us" columns. `x` = ✗ markers for "without us" / "DIY" columns.
- `button` — `label` (≤40) + `action`. Action kinds:
  - `{ kind: "navigate", href }` — internal or external link
  - `{ kind: "book" }` — opens the workspace's booking page
  - `{ kind: "intake" }` — opens the workspace's intake form
  - `{ kind: "phone" }` — `tel:` link to workspace phone (rendered as a button)
- `stat` — big number + label. `value` (≤20, like `"4.8★"` or `"300+"`) + `label` (≤60).

### Special

- `embed` — pulls workspace data into the section. `ref: "services" | "faq" | "testimonials" | "hours" | "phone"`. Renders the data with appropriate styling. No props beyond `ref`.
- `divider` — `<hr>`.
- `spacer` — `size: "sm" | "md" | "lg"` (default md). Adds vertical space.

## Validation rules

- Tree depth ≤ 4 levels (section > row > card > leaf is canonical).
- Heading levels descend without skipping.
- Container child counts: section ≤ 8, row ≤ 4, card ≤ 8, list ≤ 12 items.
- All text fields trim + length-cap (Zod).
- Tree root must be `kind: "section"`.

If the server returns `validation_errors`, regenerate the tree with the rule applied. If `validation_warnings` (voice violations), reword the offending text to avoid the soul's `avoidWords`. Don't show validation_warnings to the operator — they're for you to self-correct on retry.

## Voice + soul

ALWAYS read the workspace soul before generating:

- `soul.businessName` — use it; don't invent a different name
- `soul.voice.style` — match the tone (warm / clinical / playful / etc.)
- `soul.voice.vocabulary` — words the soul wants you to use
- `soul.voice.avoidWords` — words to avoid (server scans + warns)
- `soul.industry` — vertical-appropriate language (HVAC ≠ wedding photography ≠ SaaS)
- `soul.services` — pull service names verbatim, don't paraphrase

Where possible, embed workspace data via `kind: "embed"` rather than copy-pasting into the tree — keeps the section live as the soul evolves.

## Worked patterns

### COMPARISON (us vs them / us vs DIY / us vs the competition)

```json
{
  "kind": "section",
  "eyebrow": "Why us",
  "headline": "<workspace name> vs. doing it yourself",
  "children": [{
    "kind": "row",
    "cols": 2,
    "children": [
      {
        "kind": "card",
        "children": [
          { "kind": "heading", "level": 3, "text": "With <workspace name>" },
          { "kind": "list", "style": "check", "items": [
            "<benefit 1, specific & quantified>",
            "<benefit 2>",
            "<benefit 3>",
            "<benefit 4>"
          ]}
        ]
      },
      {
        "kind": "card",
        "variant": "muted",
        "children": [
          { "kind": "heading", "level": 3, "text": "DIY" },
          { "kind": "list", "style": "x", "items": [
            "<pain point 1>",
            "<pain point 2>",
            "<pain point 3>",
            "<pain point 4>"
          ]}
        ]
      }
    ]
  }]
}
```

### STATS ROW (by-the-numbers, social proof)

```json
{
  "kind": "section",
  "eyebrow": "By the numbers",
  "headline": "Trusted by <city> for <years> years",
  "children": [{
    "kind": "row",
    "cols": 4,
    "children": [
      { "kind": "stat", "value": "<number>", "label": "<what it counts>" },
      { "kind": "stat", "value": "<number>", "label": "<what it counts>" },
      { "kind": "stat", "value": "<number>", "label": "<what it counts>" },
      { "kind": "stat", "value": "<number>", "label": "<what it counts>" }
    ]
  }]
}
```

### HOW IT WORKS (4-step process)

```json
{
  "kind": "section",
  "eyebrow": "Our process",
  "headline": "From first call to job done",
  "children": [{
    "kind": "row",
    "cols": 4,
    "children": [
      { "kind": "card", "children": [
        { "kind": "heading", "level": 3, "text": "1. <step name>" },
        { "kind": "text", "text": "<one-sentence description>" }
      ]},
      { "kind": "card", "children": [
        { "kind": "heading", "level": 3, "text": "2. <step name>" },
        { "kind": "text", "text": "<one-sentence description>" }
      ]},
      { "kind": "card", "children": [
        { "kind": "heading", "level": 3, "text": "3. <step name>" },
        { "kind": "text", "text": "<one-sentence description>" }
      ]},
      { "kind": "card", "children": [
        { "kind": "heading", "level": 3, "text": "4. <step name>" },
        { "kind": "text", "text": "<one-sentence description>" }
      ]}
    ]
  }]
}
```

### SIDE-BY-SIDE (image + bullet list with CTA)

```json
{
  "kind": "section",
  "headline": "<headline>",
  "children": [{
    "kind": "row",
    "cols": 2,
    "children": [
      { "kind": "col", "children": [
        { "kind": "image", "url": "<image url>", "alt": "<alt text>" }
      ]},
      { "kind": "col", "children": [
        { "kind": "heading", "level": 2, "text": "<sub-headline>" },
        { "kind": "list", "style": "check", "items": [
          "<bullet 1>", "<bullet 2>", "<bullet 3>"
        ]},
        { "kind": "button", "label": "<CTA verb>", "action": { "kind": "book" } }
      ]}
    ]
  }]
}
```

### CALL CTA (phone-forward CTA for local services)

```json
{
  "kind": "section",
  "eyebrow": "Need it now?",
  "headline": "Call us. We answer.",
  "subhead": "<workspace name> picks up — talk to a real person, no phone tree.",
  "children": [
    { "kind": "embed", "ref": "phone" },
    { "kind": "spacer", "size": "sm" },
    { "kind": "button", "label": "Call now", "action": { "kind": "phone" } }
  ]
}
```

### FEATURES GRID (3-up icon-style cards without icons)

```json
{
  "kind": "section",
  "eyebrow": "What you get",
  "headline": "<headline>",
  "children": [{
    "kind": "row",
    "cols": 3,
    "children": [
      { "kind": "card", "children": [
        { "kind": "heading", "level": 3, "text": "<feature 1>" },
        { "kind": "text", "text": "<one-sentence value>" }
      ]},
      { "kind": "card", "children": [
        { "kind": "heading", "level": 3, "text": "<feature 2>" },
        { "kind": "text", "text": "<one-sentence value>" }
      ]},
      { "kind": "card", "children": [
        { "kind": "heading", "level": 3, "text": "<feature 3>" },
        { "kind": "text", "text": "<one-sentence value>" }
      ]}
    ]
  }]
}
```

### EMBED-DRIVEN SERVICES SECTION (when soul has services + you want a different layout than typed services-grid)

```json
{
  "kind": "section",
  "headline": "What we do",
  "children": [
    { "kind": "embed", "ref": "services" }
  ]
}
```

## Closing rules

1. Tree root MUST be `kind: "section"` with optional eyebrow/headline/subhead. Server rejects otherwise.
2. Every text-bearing field is HTML-escaped on render. Don't try to inject HTML; it won't work.
3. Buttons with `action: { kind: "navigate" }` to external `https://` URLs auto-get `target="_blank" rel="noopener noreferrer"`.
4. Keep hierarchies shallow. Most sections should be 2-3 levels deep. The 4-level cap is a guardrail; if you're hitting it, simplify.
5. Prefer fewer, denser cards over many sparse ones. A row of 4 is the maximum useful density at desktop sizes.
6. After persist, the public_url returned in the response IS LIVE. Tell the operator to refresh the page.

## Anti-patterns to avoid

- ❌ Don't use composite for what a typed block already does (hero, services-grid, about, faq, mid-cta). The typed blocks have stronger validators per type.
- ❌ Don't try to recreate a navbar / footer with composite. Those are page-chrome, not sections.
- ❌ Don't hardcode the workspace's phone, services, or FAQ inside text/list items if you can use `embed` instead. Embeds stay live as the soul evolves.
- ❌ Don't generate generic copy. Pull from the soul (business name, services, voice). If the soul is sparse, ask the operator before generating filler.
- ❌ **Don't add a duplicate of an existing composite section.** Before `add_composite_section`, run `get_landing_structure` (or `get_portal_structure` for portal). If you find a section with a similar headline / similar children to what the operator just asked for, ASK FIRST whether they want to ADD ANOTHER (rare) or REPLACE the existing one (common — use `update_composite_section` / `update_portal_section` instead). The smoke-test playbook is "if it looks like the operator already has this, confirm before duplicating."

---

## Portal surface (v1.15+)

Composite trees ALSO render on the customer portal. Same vocabulary, plus 5 per-customer `embed.ref` values:

| ref | renders as |
|---|---|
| `customer.contact_info` | name + email + phone (clickable mailto/tel) |
| `customer.next_appointment` | upcoming booking card (title + datetime + location) — empty placeholder if none |
| `customer.recent_appointments` | list of past appointments (title + date + status) |
| `customer.documents` | list of download links to portal_documents shared with this customer |
| `customer.deals` | list of active deals/jobs (title + stage + value) |

Use the **portal** tools to manage the template — `get_portal_structure / add_portal_section / update_portal_section / move_portal_section / delete_portal_section`. The template is stored ONCE on the workspace; every customer sees their own data through it. Use `preview_portal({ workspace_id, contact_id })` to render the template against a real contact for visual verification.

### Portal patterns

**WELCOME** (top-of-portal greeting + contact summary):
```json
{
  "kind": "section",
  "headline": "Welcome back",
  "children": [
    { "kind": "text", "text": "Here's what's happening with your account." },
    { "kind": "embed", "ref": "customer.contact_info" }
  ]
}
```

**NEXT VISIT** (upcoming-appointment card with rebook fallback):
```json
{
  "kind": "section",
  "eyebrow": "Coming up",
  "headline": "Your next visit",
  "children": [
    { "kind": "embed", "ref": "customer.next_appointment" },
    { "kind": "spacer", "size": "sm" },
    { "kind": "button", "label": "Book another visit", "action": { "kind": "book" } }
  ]
}
```

**DOCS + DEALS SIDE-BY-SIDE**:
```json
{
  "kind": "section",
  "headline": "Your activity",
  "children": [{
    "kind": "row",
    "cols": 2,
    "children": [
      {
        "kind": "card",
        "children": [
          { "kind": "heading", "level": 3, "text": "Shared documents" },
          { "kind": "embed", "ref": "customer.documents" }
        ]
      },
      {
        "kind": "card",
        "children": [
          { "kind": "heading", "level": 3, "text": "Active jobs" },
          { "kind": "embed", "ref": "customer.deals" }
        ]
      }
    ]
  }]
}
```

### Portal voice + scope

- Address the customer directly: "Your next visit," "Your documents." NOT "the customer's appointments."
- Use the workspace's voice (warm/clinical/etc.) but shift to second person.
- Don't over-show. A portal with 3 sections (welcome / next visit / documents) is usually right. >5 sections feels cluttered.
- The workspace `embed.ref` values (`services`, `faq`, `hours`, `phone`) STILL work in portal sections — useful for "Need help? Call us" callouts. But customer.* should dominate.

### Anti-patterns specific to portal

- ❌ Don't reveal data that doesn't belong to THIS customer. The customer.* embeds are auth-scoped server-side; trying to construct a "all customers" embed manually would be a leak. Stick to the embed refs.
- ❌ Don't put workspace-marketing content on the portal. The portal is for an authenticated customer's account view, not the home page.
