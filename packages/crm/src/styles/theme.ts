export const designTheme = {
  colors: {
    primary: "hsl(var(--color-primary))",
    primaryHover: "hsl(var(--color-primary-hover))",
    surface: "hsl(var(--color-surface))",
    surfaceRaised: "hsl(var(--color-surface-raised))",
    surfaceOverlay: "hsl(var(--color-surface-overlay))",
    border: "hsl(var(--color-border))",
    borderSubtle: "hsl(var(--color-border-subtle))",
    text: "hsl(var(--color-text))",
    textSecondary: "hsl(var(--color-text-secondary))",
    textMuted: "hsl(var(--color-text-muted))",
    success: "hsl(var(--color-success))",
    warning: "hsl(var(--color-warning))",
    danger: "hsl(var(--color-danger))",
    info: "hsl(var(--color-info))",
  },
  spacing: {
    page: "var(--space-page)",
    section: "var(--space-section)",
    card: "var(--space-card)",
  },
  radius: {
    sm: "var(--radius-sm)",
    md: "var(--radius-md)",
    lg: "var(--radius-lg)",
    xl: "var(--radius-xl)",
  },
  shadow: {
    sm: "var(--shadow-sm)",
    card: "var(--shadow-card)",
    dropdown: "var(--shadow-dropdown)",
    modal: "var(--shadow-modal)",
  },
  transition: {
    fast: "var(--transition-fast)",
    normal: "var(--transition-normal)",
    slow: "var(--transition-slow)",
  },
} as const;

export type DensityMode = "comfortable" | "compact";

export const densityClasses: Record<DensityMode, string> = {
  comfortable: "[--space-page:2rem] [--space-section:1.5rem] [--space-card:1.25rem]",
  compact: "[--space-page:1.25rem] [--space-section:1rem] [--space-card:0.875rem]",
};
