# SeldonFrame Brand Assets

Canonical location for all SeldonFrame logos, favicons, and brand
imagery. Reference this file before adding new logo applications.

## Design rationale

The mark is a square frame composed of corner nodes connected by edges,
with one intentional gap at the top-right and an outlined (rather than
filled) node at that corner. The architectural metaphor:

- **Frame** — the SeldonFrame harness (workflow runtime, primitives,
  scaffolding)
- **Filled corner nodes** — shipped blocks (CRM, Intake, Booking, etc.)
- **Outlined corner node + gap** — the next block, waiting to be added.
  The frame is intentionally extensible.

Every new BLOCK.md fills in another node. The mark encodes the
marketplace thesis.

## Color tokens

- Primary green: `#1FAE85` (HSL 166 72% 40%)
- White (dark backgrounds): `#FFFFFF`
- Ink (light backgrounds): `#0A0A0A`

These are also the canonical brand colors. Match these tokens exactly
when applying the logo programmatically.

## Files

### Icon-only marks (no wordmark text)

| File | Use case |
|------|----------|
| `seldonframe-icon.svg` | Primary green on light backgrounds. App sidebar collapsed state, in-product avatars, loading spinners. |
| `seldonframe-icon-white.svg` | White variant on dark backgrounds. Dark mode UI, dark hero sections. |
| `seldonframe-icon-dark.svg` | Black variant on light backgrounds. Print materials, monochrome contexts. |
| `seldonframe-favicon.svg` | Favicon-optimized: heavier strokes, simplified for 16×16 legibility. Use ONLY for browser favicons, not in-app surfaces. |

### Wordmark (icon + "SeldonFrame" text)

| File | Use case |
|------|----------|
| `seldonframe-wordmark.svg` | Primary wordmark on light backgrounds. Sign-in pages, marketing surfaces, sidebar expanded state. |
| `seldonframe-wordmark-white.svg` | White variant on dark backgrounds. Dark mode equivalents. |

### Favicon variants (PNG)

| File | Size | Use case |
|------|------|----------|
| `favicon.ico` | 16/32/48 multi-res | Legacy browser favicon. Reference in `<link rel="shortcut icon">`. |
| `favicon-16.png` | 16×16 | Browser tab icon at smallest size. |
| `favicon-32.png` | 32×32 | Browser tab icon at standard size. |
| `favicon-180.png` | 180×180 | Apple touch icon (iOS home screen). |
| `favicon-512.png` | 512×512 | PWA manifest icon, high-DPI displays. |

### General-purpose PNG icons

| File | Size | Use case |
|------|------|----------|
| `icon-green-512.png` | 512×512 | Brand asset for slide decks, external presentations. |
| `icon-white-512.png` | 512×512 | Same, dark backgrounds. |
| `icon-dark-512.png` | 512×512 | Same, monochrome. |

### Social meta images

| File | Dimensions | Use case |
|------|------------|----------|
| `og-image.png` | 1200×630 | OpenGraph image for social sharing (Facebook, LinkedIn, Slack unfurls). Reference in `og:image` meta tag. |
| `twitter-card.png` | 800×418 | Twitter card image. Reference in `twitter:image` meta tag. |

## Application rules

### When to use icon-only vs wordmark

- **Icon-only**: spaces narrower than ~120px, square containers, when
  brand is already established by context (e.g., in-app sidebar where
  the brand is reinforced elsewhere).
- **Wordmark**: anywhere the brand needs explicit naming —
  authentication pages, marketing surfaces, "Powered by" attribution
  in customer-facing portals.

### Theme bridge isolation

The SeldonFrame logo always uses SeldonFrame brand colors. It is NOT
themed by:

- Workspace themes (SLICE 4a admin theme bridge)
- Customer themes (SLICE 4b customer theme bridge)
- Vertical pack themes (e.g., Desert Cool HVAC in SLICE 9)

When the SeldonFrame logo appears in a workspace customer portal as
"Powered by" attribution, it stays SeldonFrame brand colors regardless
of the customer's theme. SeldonFrame attribution is SeldonFrame's
identity, not the customer's brand.

The only exception: dark mode toggles between `seldonframe-icon.svg`
and `seldonframe-icon-white.svg`. Both are SeldonFrame brand colors.

### Spacing

Maintain clear space around the logo equal to the height of one corner
node (roughly 12% of the icon's bounding box). Do not crop, distort,
rotate, or recolor outside the documented variants.

## Regenerating PNG variants

PNG variants are generated from the SVG sources. If SVGs change, regenerate:

```bash
cd packages/crm/public/brand
python3 scripts/regenerate-pngs.py
```

(Script lives at `packages/crm/scripts/regenerate-brand-pngs.py` —
documented in repo root README.)
