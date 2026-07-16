import { redirect } from "next/navigation";

// 2026-07-15 — the Brand & Theme form is retired. The dashboard always
// wears the SF brand (design-tokens.css); public-page styling is
// customized via the copilot (update_theme / update_design) and the
// design picker. Brand name + logo live at /settings/branding — old
// bookmarks land there instead of 404ing.
export default function ThemeSettingsPage() {
  redirect("/settings/branding");
}
