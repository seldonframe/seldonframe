// SeldonFrame · landing-design picker — shared types.
// Mirrors the data your pipeline wires up. `id` persists to theme.landingTemplate.

export type DesignId =
  | "auto"
  // Health track — the 5 premium landing templates.
  | "earthy-modern-clinical"
  | "clinical-luxe"
  | "warm-wellness"
  | "cinematic-sanctuary"
  | "editorial-bodywork"
  // Archetype track — the 8 aesthetic archetypes (trades/generic verticals).
  // Kept in sync with AestheticArchetypeId in lib/workspace/aesthetic-archetypes.
  | "editorial-warm"
  | "bold-urgency"
  | "clinical-trust"
  | "cinematic-aspirational"
  | "technical-restrained"
  | "soft-residential"
  | "brutalist"
  | "midnight-craft";

export type DesignTemplate = {
  id: Exclude<DesignId, "auto">;
  name: string;
  /** path/URL to the catalog hero thumbnail (kept in its OWN palette).
   *  Optional — archetype-track designs have no thumbnail yet; the picker's
   *  <Thumb> degrades to a named placeholder and the swatches carry the color. */
  thumb?: string;
  /** best-fit niches, shown under the name */
  niche: string[];
  /** 1–2 signature colors for a small scanning accent (not chrome) */
  swatch?: string[];
};

export type AutoTemplate = {
  id: "auto";
  name: string;
  tagline: string;
  blurb: string;
};

export type AnyTemplate = DesignTemplate | AutoTemplate;

// Props the host wires (behavior is yours; this is the UI contract).
export type PickerValue = DesignId;

export type DesignPickerProps = {
  open: boolean;
  /** render as a bottom sheet (mobile) instead of an anchored popover (desktop) */
  mobile?: boolean;
  /** popover anchoring on desktop */
  placement?: "top" | "bottom" | "bottom-end";
  value: PickerValue;
  onPick: (id: PickerValue) => void;
  onClose: () => void;
  title?: string;
  /** The design options to render. Defaults to the 5 health templates
   *  (DESIGNS); the ready page passes ARCHETYPE_DESIGNS for trades/generic
   *  verticals. */
  designs?: DesignTemplate[];
  /** Section header above the grid (e.g. "Health & wellness designs" or
   *  "Design styles"). */
  sectionLabel?: string;
  /** Footnote under the grid explaining the track. */
  autoNote?: string;
};

export type DesignChipProps = {
  value: PickerValue;
  onChange: (id: PickerValue) => void;
  mobile?: boolean;
};

export type ReadyDesignModuleProps = {
  /** the persisted choice (theme.landingTemplate) — "auto" if never overridden */
  value: PickerValue;
  /** what the server-side archetype system resolved "auto" to (id of a design) */
  autoResolvedId?: Exclude<DesignId, "auto">;
  /** human rationale, e.g. "Auto-picked for chiropractic" */
  autoReason?: string;
  onChange: (id: PickerValue) => void;
  mobile?: boolean;
  /** Design options for this workspace's track (health templates vs archetype
   *  looks). Defaults to the health templates when omitted. */
  designs?: DesignTemplate[];
  sectionLabel?: string;
  autoNote?: string;
};
