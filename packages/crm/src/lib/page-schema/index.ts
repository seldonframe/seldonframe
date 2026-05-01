// Barrel export for the primitives architecture (April 30, 2026).
// Consumers should import from here, not the individual files, so we can
// move things around without breaking call sites.

export * from "./types";
export * from "./design-tokens";
export * from "./renderer";
export * from "./registry";
export * from "./classify-business";
export * from "./content-packs";
export * from "./schema-from-soul";
export * from "./schema-from-blueprint";
export * from "./seed-landing-from-soul";
export * from "./renderers/blueprint-from-schema";
export * from "./renderers/general-service-v1-adapter";
