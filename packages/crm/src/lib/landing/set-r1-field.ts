// packages/crm/src/lib/landing/set-r1-field.ts
//
// Deterministic field editor for the LIVE r1 landing payload
// (slug='r1', status='published') — the fix for the "never-lies" bug where
// copilot's update_section_field wrote a DEAD legacy `slug='home'` blueprint
// while the public site renders `slug='r1'`, so edits silently no-op'd but
// reported ok:true. See docs/superpowers/specs/2026-07-06-seldonchat-never-lies-fix.md.
//
// DI'd load/save/revalidate (mirrors set-r1-media.ts's SetR1MediaDeps
// pattern) so unit tests need no DB. Path traversal (readByPath/setByPath) is
// reimplemented locally because lib/blueprint/mutate.ts's setByPath is
// module-private and this slice must not edit that file.

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { landingPages, organizations } from "@/db/schema";
import type { AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import { defaultLoad } from "./set-r1-media";
import { saveLandingPayload } from "./r1-save";
import type { R1LandingPayload } from "./r1-payload-prompt";

/** The 8 top-level r1 payload sections a field edit may target. */
export type R1Section =
  | "hero"
  | "services"
  | "testimonials"
  | "faq"
  | "footer"
  | "emergency"
  | "sticky"
  | "leadForm";

const R1_SECTIONS: R1Section[] = [
  "hero",
  "services",
  "testimonials",
  "faq",
  "footer",
  "emergency",
  "sticky",
  "leadForm",
];

/**
 * Maps common LLM field-name guesses to the real r1 payload path for a
 * given section. Unknown/unrecognized field names pass through unchanged —
 * validation in setR1Field catches a truly bad path.
 */
export function resolveR1FieldPath(section: R1Section, field: string): string {
  if (section === "hero") {
    if (field === "headline" || field === "title" || field === "heading") return "tagline";
    if (field === "subheadline" || field === "subtitle") return "subhead";
    if (field === "cta" || field === "button") return "primaryCTA.label";
    return field;
  }
  if (section === "services" || section === "testimonials" || section === "faq") {
    if (field === "title" || field === "headline") return "heading";
    return field;
  }
  return field;
}

export type SetR1FieldResult =
  | { ok: true; applied: { section: R1Section; path: string; value: unknown } }
  | {
      ok: false;
      error: "no_r1_page" | "unknown_section" | "field_not_found";
      section?: R1Section;
      field?: string;
      path?: string;
    };

export interface SetR1FieldDeps {
  load: (
    orgId: string,
  ) => Promise<{ payload: R1LandingPayload; archetype: AestheticArchetypeId } | null>;
  save: (
    orgId: string,
    payload: R1LandingPayload,
    archetype: AestheticArchetypeId,
  ) => Promise<void>;
  revalidate: (orgId: string) => void;
}

/** Fire-and-forget: same pattern as set-r1-media.ts's defaultRevalidate. */
function defaultRevalidate(orgId: string): void {
  void (async () => {
    const [org] = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (org?.slug) {
      revalidatePath(`/w/${org.slug}`);
    }
  })();
}

export const DEFAULT_DEPS: SetR1FieldDeps = {
  load: defaultLoad,
  save: saveLandingPayload,
  revalidate: defaultRevalidate,
};

/** Read a value at a dot-path (numeric segment = array index, else object
 *  key). Mirrors setByPath's traversal exactly, but non-throwing: returns
 *  undefined on any missing/non-object intermediate instead of throwing, so
 *  it's safe to use for the before/after existence check below. */
function readByPath(root: unknown, path: string): unknown {
  const segments = path.split(".");
  let cursor: unknown = root;
  for (const key of segments) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    if (/^\d+$/.test(key)) {
      if (!Array.isArray(cursor)) return undefined;
      cursor = cursor[parseInt(key, 10)];
    } else {
      cursor = (cursor as Record<string, unknown>)[key];
    }
  }
  return cursor;
}

function setByPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  let cursor: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    if (cursor == null || typeof cursor !== "object") {
      throw new Error(`Cannot traverse path "${path}" — non-object at "${segments.slice(0, i).join(".")}"`);
    }
    if (/^\d+$/.test(key)) {
      const arr = cursor as unknown[];
      if (!Array.isArray(arr)) throw new Error(`Expected array at key "${key}"`);
      cursor = arr[parseInt(key, 10)];
    } else {
      cursor = (cursor as Record<string, unknown>)[key];
    }
  }
  if (cursor == null || typeof cursor !== "object") {
    throw new Error(`Cannot set path "${path}" — parent is null/non-object`);
  }
  const last = segments[segments.length - 1];
  if (/^\d+$/.test(last)) {
    const arr = cursor as unknown[];
    if (!Array.isArray(arr)) throw new Error(`Expected array at key "${last}"`);
    arr[parseInt(last, 10)] = value;
  } else {
    (cursor as Record<string, unknown>)[last] = value;
  }
}

/**
 * Set a single field on the live r1 payload's `section`, resolving common
 * field-name aliases first. Validates the write actually took (re-reads the
 * path after set and requires it equal the intended value) — the tool-level
 * never-lies guarantee: `ok:true` means a real field changed on the LIVE
 * model, not "a row was written."
 */
export async function setR1Field(
  orgId: string,
  section: R1Section,
  field: string,
  value: unknown,
  deps: SetR1FieldDeps = DEFAULT_DEPS,
): Promise<SetR1FieldResult> {
  const loaded = await deps.load(orgId);
  if (!loaded) {
    return { ok: false, error: "no_r1_page" };
  }

  if (!R1_SECTIONS.includes(section)) {
    return { ok: false, error: "unknown_section", section, field };
  }

  const { payload, archetype } = loaded;
  const sectionValue = (payload as unknown as Record<string, unknown>)[section];
  if (sectionValue === undefined || sectionValue === null || typeof sectionValue !== "object") {
    return { ok: false, error: "unknown_section", section, field };
  }

  const path = resolveR1FieldPath(section, field);

  const nextPayload = structuredClone(payload) as unknown as Record<string, unknown>;
  const nextSection = nextPayload[section] as Record<string, unknown>;

  // Never-lies guard #1: the field must ALREADY EXIST on the live payload.
  // setByPath will happily create a brand-new flat key on an existing section
  // object (e.g. hero.madeUpField), which would pass the value-echo check below
  // yet render NOTHING — silently relocating the very bug this fixes. Requiring
  // a defined prior value means update_section_field can only edit fields that
  // actually render; adding a new/optional field is edit_site's job.
  const before = readByPath(nextSection, path);
  if (before === undefined) {
    return { ok: false, error: "field_not_found", section, field, path };
  }

  try {
    setByPath(nextSection, path, value);
  } catch {
    return { ok: false, error: "field_not_found", section, field, path };
  }

  const after = readByPath(nextSection, path);

  // Never-lies validation: the write only counts if the re-read value
  // matches the intended value. A bad/non-existent path either throws above
  // or leaves the read mismatched/undefined.
  const wroteIntendedValue =
    after === value || (after !== undefined && JSON.stringify(after) === JSON.stringify(value));
  if (!wroteIntendedValue) {
    return { ok: false, error: "field_not_found", section, field, path };
  }

  await deps.save(orgId, nextPayload as unknown as R1LandingPayload, archetype);
  deps.revalidate(orgId);

  return { ok: true, applied: { section, path, value } };
}
