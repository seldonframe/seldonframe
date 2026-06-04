// SeldonFrame · landing-design picker — shared types.
// Mirrors the data your pipeline wires up. `id` persists to theme.landingTemplate.

export type DesignId =
  | "auto"
  | "earthy-modern-clinical"
  | "clinical-luxe"
  | "warm-wellness"
  | "cinematic-sanctuary"
  | "editorial-bodywork";

export type DesignTemplate = {
  id: Exclude<DesignId, "auto">;
  name: string;
  /** path/URL to the catalog hero thumbnail (kept in its OWN palette) */
  thumb: string;
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
};
