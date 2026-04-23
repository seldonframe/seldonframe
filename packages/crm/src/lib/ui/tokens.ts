// Typed design-token wrapper.
//
// Shipped in SLICE 4a PR 1 C1 per audit §2.3 + G-4-4 (L-22
// structural enforcement — typed functional API over raw strings).
//
// Purpose: every call to `tokens.color("primary")` returns
// `"var(--primary)"` — a CSS custom-property reference. Typos
// (`tokens.color("primay")`) fail at `tsc --noEmit` instead of
// rendering as missing styles.
//
// Consumers:
//   - Tailwind arbitrary values: `className={`bg-[${tokens.color("primary")}]`}`.
//   - Inline styles: `style={{ color: tokens.color("primary") }}`.
//   - Theme helpers: themeToCSS / public-theme-provider.
//
// Scope for SLICE 4a:
//   - color: every shadcn role + semantic status + chart colors.
//   - shadow: kinds declared in tailwind.config.ts.
//   - radius: sm / md / lg / xl (derived from --radius via calc).
//   - space: semantic steps mapping to rem values.
//   - text: typography kinds mapping to Tailwind utility class names.
//
// Not a complete rewrite of the token system — underlying CSS vars
// + Tailwind config are source of truth. This wrapper is the typed
// reader.

// ---------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------

type ColorRole =
  | "background"
  | "foreground"
  | "card"
  | "card-foreground"
  | "popover"
  | "popover-foreground"
  | "primary"
  | "primary-foreground"
  | "secondary"
  | "secondary-foreground"
  | "muted"
  | "muted-foreground"
  | "accent"
  | "accent-foreground"
  | "destructive"
  | "destructive-foreground"
  | "border"
  | "input"
  | "ring"
  | "positive"
  | "caution"
  | "negative"
  | "chart-1"
  | "chart-2"
  | "chart-3"
  | "chart-4"
  | "chart-5"
  | "sidebar"
  | "sidebar-foreground"
  | "sidebar-primary"
  | "sidebar-primary-foreground"
  | "sidebar-accent"
  | "sidebar-accent-foreground"
  | "sidebar-border"
  | "sidebar-ring";

function color(role: ColorRole): string {
  return `var(--${role})`;
}

// ---------------------------------------------------------------------
// Shadow
// ---------------------------------------------------------------------

type ShadowKind = "xs" | "sm" | "card" | "card-hover" | "dropdown" | "modal";

function shadow(kind: ShadowKind): string {
  return `var(--shadow-${kind})`;
}

// ---------------------------------------------------------------------
// Radius
// ---------------------------------------------------------------------

type RadiusStep = "sm" | "md" | "lg" | "xl";

function radius(step: RadiusStep): string {
  return `var(--radius-${step})`;
}

// ---------------------------------------------------------------------
// Space — semantic step → literal rem value.
//
// Maps to the Tailwind default-scale steps the codebase already uses
// consistently (4 → 1rem being the base unit). Semantic names make
// intent legible at call sites.
// ---------------------------------------------------------------------

type SpaceStep = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

function space(step: SpaceStep): string {
  switch (step) {
    case "xs": return "0.25rem"; // 4px  — Tailwind p-1
    case "sm": return "0.5rem";  // 8px  — Tailwind p-2
    case "md": return "1rem";    // 16px — Tailwind p-4 (common baseline)
    case "lg": return "1.5rem";  // 24px — Tailwind p-6
    case "xl": return "2rem";    // 32px — Tailwind p-8
    case "2xl": return "3rem";   // 48px — Tailwind p-12
  }
}

// ---------------------------------------------------------------------
// Text — typography kind → Tailwind utility class name.
//
// Unlike color/shadow/radius, typography ships as composite utility
// classes (font-size + line-height + letter-spacing + font-weight).
// Returning the class name keeps the full bundle intact.
// ---------------------------------------------------------------------

type TextKind = "page-title" | "section-title" | "card-title" | "body" | "label" | "data" | "tiny";

function text(kind: TextKind): string {
  return `text-${kind}`;
}

// ---------------------------------------------------------------------
// Public export — single object for ergonomic call sites.
// ---------------------------------------------------------------------

export const tokens = {
  color,
  shadow,
  radius,
  space,
  text,
};

// Export types for consumers that need to accept token args in their
// own props (e.g., a <Stack gap={tokens.space} spacing="md" /> helper).
export type { ColorRole, ShadowKind, RadiusStep, SpaceStep, TextKind };
