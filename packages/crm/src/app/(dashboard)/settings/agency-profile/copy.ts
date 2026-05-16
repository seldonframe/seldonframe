// Polished copy strings for /settings/agency-profile.
// Source: design:ux-copy invocation 2026-05-16 (Cut B).

export const AGENCY_PROFILE_COPY = {
  pageHeading: "Agency Profile",
  pageSubheading: "How your agency shows up on client-facing screens.",
  fields: {
    name: {
      label: "Agency name",
      help: "Shown on client portals and reports.",
      placeholder: "Acme Digital",
    },
    logo: {
      label: "Agency logo",
      help: "PNG or SVG. Square crops best.",
    },
    brandColor: {
      label: "Brand color",
      help: "Used as the accent on white-labeled surfaces.",
    },
    websiteUrl: {
      label: "Agency website",
      help: "Optional. Linked from your client portal footer.",
      placeholder: "https://acmedigital.com",
    },
  },
  saveButton: "Save profile",
  savedToast: "Agency profile saved.",
} as const;
