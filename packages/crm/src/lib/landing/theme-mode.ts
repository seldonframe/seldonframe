// Pure helper: resolve the final light/dark mode for a workspace's R1 site.
// Operator choice wins; "auto"/absent falls back to the archetype's
// defaultThemeMode. DB-free — runs under node:test + tsx.

import {
  ARCHETYPES,
  type AestheticArchetypeId,
} from "../workspace/aesthetic-archetypes";

export type ThemeModeChoice = "auto" | "light" | "dark";

export function resolveThemeMode(
  choice: ThemeModeChoice | undefined,
  archetype: AestheticArchetypeId,
): "light" | "dark" {
  if (choice === "light" || choice === "dark") return choice;
  return ARCHETYPES[archetype]?.defaultThemeMode === "dark" ? "dark" : "light";
}
