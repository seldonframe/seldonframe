# Landing-design picker — operator dashboard

Two surfaces that let an operator choose a workspace's **public landing design**,
defaulting to **Auto (best fit)**. v1 covers the 5 health & wellness templates;
non-health businesses are unaffected (Auto uses the existing archetype system).

```
react/
  types.ts               shared types (DesignId, props)
  data.ts                AUTO + the 5 DESIGNS (+ templateById)
  icons.tsx              inline SVG (no icon libs)
  picker.css.ts          PICKER_CSS — theme-token-driven stylesheet (source of truth)
  Styles.tsx             <PickerStyles/> → <style jsx global>{PICKER_CSS}</style>
  DesignPicker.tsx       shared surface: popover (desktop) / bottom sheet (mobile)  ["use client"]
  DesignChip.tsx         input-screen control for /clients/new                       ["use client"]
  ReadyDesignModule.tsx  ready-page module + swap for /clients/[slug]/ready          ["use client"]
```

## Wire-up

`value` is the persisted choice (`theme.landingTemplate`), `"auto"` until overridden.
You own persistence + the server re-render; these components are presentational.

**Input screen** — drop the chip into the input-box toolbar:

```tsx
"use client";
import { DesignChip } from "@/components/landing-picker/DesignChip";
import { PickerStyles } from "@/components/landing-picker/Styles";

<PickerStyles />            {/* mount once (here or in the dashboard layout) */}
<DesignChip value={landingTemplate} onChange={setLandingTemplate} mobile={isMobile} />
```

**Ready page** — the design module with the Auto rationale + swap:

```tsx
import { ReadyDesignModule } from "@/components/landing-picker/ReadyDesignModule";

<ReadyDesignModule
  value={landingTemplate}            // "auto" or a design id
  autoResolvedId={resolvedId}        // what the archetype system chose for "auto"
  autoReason="Auto-picked for chiropractic"
  onChange={persistAndRerender}      // persist → server re-renders the public page
  mobile={isMobile}
/>
```

`mobile` is yours to derive (your existing breakpoint / matchMedia). On mobile the
picker is a bottom sheet; on desktop it's a popover anchored to the trigger
(wrap any custom trigger in `.pk-anchor`, which is `position:relative`).

## Theming (important)

All chrome is driven by the **dashboard host tokens** — `--background`, `--card`,
`--muted`, `--muted-foreground`, `--foreground`, `--border`, `--primary`
(and `--primary-foreground`, `--shadow-card`). It tracks light/`.dark` and the
operator's accent automatically — exactly like `build-stage-v2`. Nothing is
hardcoded; do **not** wire the landing templates' `--sf-*` vars here.

The one intentional exception: the **5 design thumbnails keep their own signature
palettes** (they're previews of the landing designs, not chrome).

## Notes

- The mobile sheet is `position:fixed`. If a `transform`ed ancestor wraps the
  control, the sheet scopes to it — render near the app root or portal the sheet
  to `document.body`.
- `data.ts` `thumb` paths point at the catalog thumbnails (`/thumbs/tN.png`);
  swap for your asset URLs. Missing/broken thumbs fall back to a themed tile.
- Accessible: `role="dialog"`, `aria-expanded`/`aria-haspopup` on triggers,
  Esc-to-close, visible focus; honors `prefers-reduced-motion`.
- SSR-safe: `"use client"` only on the three interactive components.
