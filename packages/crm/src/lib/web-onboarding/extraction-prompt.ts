// packages/crm/src/lib/web-onboarding/extraction-prompt.ts
//
// PATCHED PER PLAN CORRECTION (2026-05-16):
// The canonical EXTRACTION_INSTRUCTIONS prompt + REQUIRED_FIELDS_SCHEMA
// already live in lib/soul-compiler/url-extraction-instructions.ts (used by
// the Claude Code MCP path). The web-onboarding endpoint imports them
// verbatim — there must be exactly one source of truth for the extraction
// prompt so the two surfaces (Claude Code MCP + web) stay in sync.
//
// This file exists only to:
//   1. Give the web-onboarding module a stable local import path
//   2. Add a TypeScript type ExtractedBusinessFacts that mirrors the
//      JSON Schema's required + optional keys, used by the parser in Task 4.

export {
  EXTRACTION_INSTRUCTIONS,
  REQUIRED_FIELDS_SCHEMA,
} from "@/lib/soul-compiler/url-extraction-instructions";

/**
 * TypeScript shape mirroring REQUIRED_FIELDS_SCHEMA. Maps field-for-field
 * to CreateFullWorkspaceInput in lib/workspace/create-full.ts — no adapter
 * layer needed downstream.
 */
export type ExtractedBusinessFacts = {
  // Required
  business_name: string;
  city: string;
  state: string;
  phone: string;
  services: string[];
  business_description: string;
  // Optional enrichment
  review_count?: number | null;
  review_rating?: number | null;
  certifications?: string[] | null;
  trust_signals?: string[] | null;
  emergency_service?: boolean | null;
  same_day?: boolean | null;
  service_area?: string[] | null;
  // Optional contact channels
  email?: string | null;
  address?: string | null;
  // Optional weekly hours (existing format from create-full.ts:86)
  weekly_hours?: Partial<Record<
    "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday",
    { enabled: boolean; start: string; end: string }
  >> | null;
  // Optional testimonials
  testimonials?: Array<{
    quote: string;
    name?: string | null;
    role?: string | null;
    company?: string | null;
    rating?: number | null;
  }> | null;
};
