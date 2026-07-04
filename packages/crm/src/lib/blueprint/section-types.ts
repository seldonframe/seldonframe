import type { LandingSection } from "@/lib/blueprint/types";

// Section types accepted by the granular per-field update path
// (/api/v1/landing/section/update and the copilot's update_section_field
// tool). This mirrors a subset of the `LandingSection["type"]` discriminated
// union in ./types.ts — the source of truth for section shapes — but
// intentionally excludes the "partners" and "composite" variants, which
// aren't yet wired into mutateSectionField. Keep this list in sync with
// that union if a new section type gains dot-path mutation support.
export const VALID_SECTION_TYPES: LandingSection["type"][] = [
  "emergency-strip",
  "hero",
  "trust-strip",
  "services-grid",
  "about",
  "mid-cta",
  "testimonials",
  "service-area",
  "faq",
  "footer",
];
