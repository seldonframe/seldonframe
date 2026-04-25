// Desert Cool HVAC — branding + theme constants.
// SLICE 9 PR 1 C5 per scenario doc + audit §2.4.
//
// Single source of truth for the workspace's brand identity. Imported
// by:
//   - seed-hvac-arizona.ts (writes to org.theme on seed)
//   - admin-UI polish surfaces that show "Desert Cool HVAC" copy
//   - customer-facing portal (PortalLayout consumes via PublicThemeProvider
//     which reads from org.theme — branding constant just provides
//     the test fixture for unit tests)
//
// Per gate G-9-1 + scenario doc: red/cyan palette (heat/cool),
// Outfit font, light mode (Phoenix sun readability), rounded corners.

import type { OrgTheme } from "@/lib/theme/types";

export const DESERT_COOL_HVAC_BRAND = {
  workspaceName: "Desert Cool HVAC",
  ownerName: "Jordan Reyes",
  city: "Phoenix",
  state: "AZ",
  serviceArea: "Phoenix metro (40-mile radius)",
  foundedYear: 2008,
  technicianCount: 14,
  customerCount: 1800,
  signOff: "— Jordan & the Desert Cool team",
} as const;

export const DESERT_COOL_HVAC_THEME: OrgTheme = {
  primaryColor: "#dc2626",       // red — heat / urgency / emergency
  accentColor: "#0891b2",        // cyan — cooling / relief / product
  fontFamily: "Outfit",          // modern sans, conveys reliability
  mode: "light",                 // technicians use phones in AZ sun
  borderRadius: "rounded",       // warmer than sharp; less playful than pill
  logoUrl: null,                 // SVG logo fixture deferred (no binary in repo)
};

// Brand voice fragments. Used by SLICE 9 PR 2 archetype message copy
// + admin/portal microcopy. Keeping them as constants (not inlined)
// lets the test mode + future Soul-driven personalization swap copy
// without touching archetype JSON.
export const DESERT_COOL_HVAC_COPY = {
  emergencyAck:
    "Got your call — we'll have a tech on the way within 4 hours. Reply CONFIRM if still urgent.",
  preSeasonInvite:
    "Hi {{firstName}}, it's been over 6 months since your last AC service. Phoenix summer's coming — want to schedule a tune-up? Reply YES.",
  followUp:
    "Hi {{firstName}}, how was your service today? Reply 1-5 stars or any feedback.",
  followUpThanks: (rating: number) =>
    rating >= 4
      ? "Thanks! Mind sharing on Google? https://desertcool.example.com/review"
      : "Thanks for the feedback. We'll have someone reach out to make it right.",
  heatAdvisory:
    "Heads up — 110°+ forecast tomorrow. Want a free AC check before it hits? Reply YES.",
} as const;
