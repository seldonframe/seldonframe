export interface OrgTheme {
  primaryColor: string;
  accentColor: string;
  fontFamily: "Inter" | "DM Sans" | "Playfair Display" | "Space Grotesk" | "Lora" | "Outfit";
  mode: "light" | "dark";
  borderRadius: "sharp" | "rounded" | "pill";
  logoUrl: string | null;
}

export const DEFAULT_ORG_THEME: OrgTheme = {
  primaryColor: "#14b8a6",
  accentColor: "#0d9488",
  fontFamily: "Inter",
  mode: "dark",
  borderRadius: "rounded",
  logoUrl: null,
};
