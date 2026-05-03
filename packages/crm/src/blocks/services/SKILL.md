---
name: services
version: 1.0.0
description: Services / offerings grid with one card per service, each with a distinct icon and a short customer-language description.
section_type: services-grid
props:
  headline:
    type: string
    required: true
    min_words: 2
    max_words: 8
    description: Section heading. Vertical-specific verbiage ("How We Cut", "What We Fix", "Practice Areas") not generic ("Our Services", "What We Do").
  subhead:
    type: string
    required: false
    max_words: 25
    description: Optional 1-sentence framing under the headline. Skip if the headline + cards already say it.
  layout:
    type: string
    required: false
    enum: ["grid-3", "grid-4", "tabs", "stats"]
    default: grid-3
    description: "grid-3" or "grid-4" for typical service grids. "tabs" for ≤4 dense services. "stats" only when items are numbers, not services.
  items:
    type: array
    required: true
    min_items: 3
    max_items: 8
    description: One entry per service. Each must have a distinct icon — repeat-icon services-grid is a layer-mismatch tell.
    item_schema:
      icon:
        type: string
        description: Lucide icon name in snake_case from the allowlist (see body). Each item MUST pick a different icon.
      title:
        type: string
        description: Service name. Use the operator's exact phrasing — match input.services strings verbatim.
      description:
        type: string
        min_words: 8
        max_words: 30
        description: 1-2 sentences. Customer-facing, not industry jargon. Lead with outcome ("Fades, scissor cuts, beard sculpting — out the door in 30 minutes") not feature ("Professional men's grooming services").
      price_from:
        type: string
        required: false
        description: Optional starting price like "$45+" or "From $200". Use only if the operator provided pricing.
      category:
        type: string
        required: false
        description: Optional grouping label (e.g. "Repair", "Install", "Maintenance"). Used by tabs layout.
validators:
  - rule: distinct_icons
    severity: error
    description: Every items[].icon must be unique. Two cards with the same icon is the symptom of the keyword-classifier fallback we're replacing.
  - rule: descriptions_customer_language
    severity: warn
    description: Each description should NOT contain "Our professional ... services", "Industry-leading", "Best-in-class", "State-of-the-art", "We pride ourselves". These are the corporate-stock phrases the renderer's old templates leaked.
  - rule: titles_match_input_services
    severity: warn
    description: items[].title should match (or trivially restate) one of the operator's input services. Don't invent services the operator didn't list.
  - rule: headline_not_generic
    severity: error
    description: Headline must NOT be exactly "Our Services", "Services", "What We Do", "Our Offerings". Restate as benefit or vertical-specific phrasing.
---

# Services Block — generation prompt

You are generating the services-grid section of a small-business landing
page. This is where visitors decide *whether you do the thing they need*.
Generic descriptions ("Professional X services") fail this test silently —
they technically describe the work but don't help the visitor self-qualify.

## The mental model

Each card answers three questions in one glance:

1. **What is it?** (the title — match the operator's phrasing)
2. **What outcome do I get?** (the description — lead with the benefit)
3. **Is this serious?** (the icon — distinct, recognizable, on-vertical)

If a card fails any one, the visitor stalls. Three cards failing → bounce.

## Voice rules

1. **Customer language, not industry jargon.** "Fades, scissor cuts, beard
   sculpting" beats "Professional men's grooming services". "Same-day AC
   repair" beats "HVAC service solutions".
2. **Lead with outcome.** The first 5-10 words of each description should
   tell me what I get, not what you do.
3. **Match the operator's input services exactly.** If they said "AC repair"
   don't say "Air Conditioning Repair Services". Use their words.
4. **Distinct icons, every time.** Repeating an icon is the visible
   symptom of homogenized output. Each card picks a different icon from
   the allowlist below.
5. **Headline is vertical-specific.** "How We Cut" for a barbershop. "What
   We Fix" for a trade. "Practice Areas" for legal. NOT "Our Services".

## Lucide icon allowlist (snake_case names)

Pick one icon per card from these. Each one represents a different visual
shape so distinct picks read as distinct services even at small sizes.

**Trade / service**: `wrench`, `hammer`, `paintbrush`, `screwdriver`,
`drill`, `saw`, `pickaxe`, `axe`.

**Home / building**: `home`, `door_open`, `door_closed`, `key`, `lock`,
`columns`, `fence`, `garage`, `bed`, `bath`, `kitchen_pot`, `sofa`.

**Climate / utilities**: `thermometer`, `snowflake`, `flame`, `droplets`,
`zap`, `lightbulb`, `plug`, `battery`, `wind`, `sun`, `cloud_rain`,
`cloud_lightning`.

**Vehicle / equipment**: `truck`, `car`, `bike`, `wheel`, `gauge`.

**Care / health / beauty**: `scissors`, `comb`, `brush`, `sparkles`,
`heart`, `stethoscope`, `pill`, `syringe`, `tooth`, `eye`, `smile`,
`spray_can`.

**Professional / office**: `briefcase`, `scale`, `gavel`, `book`,
`book_open`, `file_text`, `clipboard`, `calculator`, `chart_bar`,
`chart_line`, `pen_tool`, `signature`, `stamp`.

**Tech / digital**: `monitor`, `laptop`, `smartphone`, `globe`, `code`,
`terminal`, `database`, `cloud`, `bot`, `cpu`, `keyboard`, `mouse`.

**Food / hospitality**: `coffee`, `utensils`, `wine`, `pizza`,
`cake_slice`, `salad`, `chef_hat`.

**Time / motion / quality**: `clock`, `calendar`, `timer`, `zap_off`,
`shield`, `shield_check`, `award`, `medal`, `star`, `trophy`,
`thumbs_up`, `check_circle`, `heart_handshake`.

**Communication / community**: `phone`, `mail`, `message_circle`, `users`,
`user_check`, `user_plus`, `handshake`, `mic`.

**Movement / delivery**: `package`, `truck`, `map`, `map_pin`, `route`,
`compass`, `navigation`.

If none of the above fits perfectly, pick the closest match — *don't
invent icon names*. The allowlist is enforced at validation time.

## Worked examples

### Barbershop, 4 services

```json
{
  "headline": "How We Cut",
  "layout": "grid-4",
  "items": [
    { "icon": "scissors", "title": "Men's Haircuts", "description": "Fades, scissor cuts, classic gentleman's cuts — out the door in 30 minutes.", "price_from": "$45" },
    { "icon": "comb", "title": "Beard Trims", "description": "Sculpt, line up, hot-towel finish. Bring a reference photo or trust the chair.", "price_from": "$25" },
    { "icon": "user_plus", "title": "Kids Cuts", "description": "Patient with first-time clippers and Sunday-morning meltdowns alike. Ages 4 and up.", "price_from": "$35" },
    { "icon": "sparkles", "title": "Cut + Beard Combo", "description": "The full hour: haircut, beard, hot towel, and a quiet 10 minutes you didn't know you needed.", "price_from": "$65" }
  ]
}
```

### HVAC, 3 services + emergency

```json
{
  "headline": "What We Fix",
  "subhead": "Same-day repair across the Phoenix Valley. Licensed, bonded, insured.",
  "layout": "grid-3",
  "items": [
    { "icon": "snowflake", "title": "AC Repair", "description": "90-minute response on weekday emergencies. Diagnostic is free with any repair, $89 standalone.", "category": "Repair" },
    { "icon": "thermometer", "title": "Heating Installation", "description": "Right-sized systems with manufacturer rebates included. Two-year labor warranty on every install.", "category": "Install" },
    { "icon": "wind", "title": "Duct Cleaning", "description": "Whole-home cleaning + sanitization. Bundle with annual maintenance for $50 off.", "category": "Maintenance" }
  ]
}
```

### Legal, 4 practice areas

```json
{
  "headline": "Practice Areas",
  "layout": "grid-4",
  "items": [
    { "icon": "scale", "title": "Divorce", "description": "Negotiated settlements when possible, prepared litigation when not. Fixed-fee retainers available.", "category": "Family" },
    { "icon": "users", "title": "Custody & Parenting", "description": "Child-focused arrangements that hold up over years, not just the first hearing.", "category": "Family" },
    { "icon": "handshake", "title": "Mediation", "description": "Two-party mediation in our Vancouver office. Most matters resolve in 1-3 sessions.", "category": "Resolution" },
    { "icon": "file_text", "title": "Estate Planning", "description": "Wills, powers of attorney, and trusts. Two-week turnaround on standard packages.", "category": "Planning" }
  ]
}
```

## Output format

Return ONLY a single JSON object matching the props schema. No prose, no
markdown fences. The persistence endpoint runs `JSON.parse` directly.

If the operator gave you fewer than 3 services, ask them for more before
generating — a 1-card or 2-card grid looks broken. If they gave you more
than 8, pick the 8 most distinct (combining duplicates like "AC repair"
and "Air conditioning service" into one card).
