// packages/crm/src/app/(public)/record/record-ui/tiers.ts
//
// Shared honest-badge color/label map for coverage tiers, bound to /record's
// existing dark palette (green/yellow/red already used pre-redesign — kept
// unchanged here, only relocated so both the recap panel and any future
// per-step badge can share one source instead of drifting).

import type { CoverageTier } from "@/lib/recordings/trace-schema";

export const TIER_COLOR: Record<CoverageTier, string> = {
  green: "#22C55E",
  yellow: "#EAB308",
  red: "#EF4444",
};

export const TIER_LABEL: Record<CoverageTier, string> = {
  green: "Automatable",
  yellow: "Needs approval",
  red: "Stays with you",
};
