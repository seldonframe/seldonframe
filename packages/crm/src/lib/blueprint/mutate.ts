/**
 * Blueprint mutation helpers — pure, immutable, schema-aware.
 *
 * The blueprint customization loop (C3.4) is:
 *   1. Load blueprintJson from landing_pages
 *   2. Apply a mutation here (returns a NEW Blueprint, doesn't mutate input)
 *   3. Run the result through renderGeneralServiceV1
 *   4. Save blueprintJson + contentHtml + contentCss back
 *
 * Every helper returns a fresh deep-cloned Blueprint so the caller can
 * trust step 4 won't accidentally write to a shared object reference.
 *
 * Design notes:
 *   - High-level setters (mutateHeroHeadline, mutateAccent) cover the
 *     common MCP tool calls and keep type safety end-to-end.
 *   - mutateSectionField is the escape hatch for any field not yet
 *     covered — accepts a section type + dot-path. Validated at the
 *     call site by the route handler (Zod) since the path is dynamic.
 *   - We intentionally do NOT validate the result against schema.json
 *     here — that's the job of `pnpm template:validate` at build time.
 *     A bad mutation will surface as a render error or visible bug,
 *     which is acceptable feedback for a typed MCP call.
 */

import type {
  Blueprint,
  LandingSection,
  SectionAbout,
  SectionHero,
  Theme,
} from "./types";

/** Deep clone via JSON round-trip. Blueprints are pure data so this is safe. */
function cloneBlueprint(bp: Blueprint): Blueprint {
  return JSON.parse(JSON.stringify(bp)) as Blueprint;
}

// ─── Workspace-level mutations ────────────────────────────────────────

export function mutateWorkspaceName(bp: Blueprint, name: string): Blueprint {
  const next = cloneBlueprint(bp);
  next.workspace.name = name;
  return next;
}

export function mutateWorkspaceTagline(bp: Blueprint, tagline: string): Blueprint {
  const next = cloneBlueprint(bp);
  next.workspace.tagline = tagline;
  return next;
}

export function mutateWorkspacePhone(bp: Blueprint, phone: string): Blueprint {
  const next = cloneBlueprint(bp);
  next.workspace.contact.phone = phone;
  return next;
}

/**
 * Patch the workspace theme. Pass any subset of theme fields — the rest
 * stay untouched. Used by update_theme to thread the operator's accent
 * choice through into the Blueprint so the next render picks it up.
 */
export function mutateWorkspaceTheme(bp: Blueprint, patch: Partial<Theme>): Blueprint {
  const next = cloneBlueprint(bp);
  next.workspace.theme = { ...next.workspace.theme, ...patch };
  return next;
}

// ─── Section-level mutations ──────────────────────────────────────────

/**
 * Find the first section of `type` and apply a section-specific mutator.
 * Returns the blueprint unchanged if no section of that type exists.
 */
function mutateSection<T extends LandingSection>(
  bp: Blueprint,
  type: T["type"],
  mutator: (section: T) => void
): Blueprint {
  const next = cloneBlueprint(bp);
  for (const s of next.landing.sections) {
    if (s.type === type) {
      mutator(s as T);
      break;
    }
  }
  return next;
}

export function mutateHeroHeadline(bp: Blueprint, headline: string): Blueprint {
  return mutateSection<SectionHero>(bp, "hero", (s) => {
    s.headline = headline;
  });
}

export function mutateHeroSubhead(bp: Blueprint, subhead: string): Blueprint {
  return mutateSection<SectionHero>(bp, "hero", (s) => {
    s.subhead = subhead;
  });
}

export function mutateHeroEyebrow(bp: Blueprint, eyebrow: string): Blueprint {
  return mutateSection<SectionHero>(bp, "hero", (s) => {
    s.eyebrow = eyebrow;
  });
}

export function mutateHeroCtaPrimaryLabel(bp: Blueprint, label: string): Blueprint {
  return mutateSection<SectionHero>(bp, "hero", (s) => {
    s.ctaPrimary = { ...s.ctaPrimary, label };
  });
}

export function mutateAboutBody(bp: Blueprint, body: string): Blueprint {
  return mutateSection<SectionAbout>(bp, "about", (s) => {
    s.body = body;
  });
}

export function mutateAboutHeadline(bp: Blueprint, headline: string): Blueprint {
  return mutateSection<SectionAbout>(bp, "about", (s) => {
    s.headline = headline;
  });
}

// ─── Generic dot-path setter (escape hatch) ───────────────────────────

/**
 * Sets a field at `path` (dot-segmented; numeric segments are array
 * indices) on the FIRST section matching `sectionType`, returning a
 * fresh Blueprint. Throws on invalid paths so the route handler can
 * return a 400 to the caller.
 *
 * Examples:
 *   mutateSectionField(bp, "hero", "headline", "X")
 *   mutateSectionField(bp, "services-grid", "items.2.description", "X")
 *   mutateSectionField(bp, "faq", "items.0.answer", "X")
 *   mutateSectionField(bp, "footer", "showHours", false)
 */
export function mutateSectionField(
  bp: Blueprint,
  sectionType: LandingSection["type"],
  path: string,
  value: unknown
): Blueprint {
  const next = cloneBlueprint(bp);
  const section = next.landing.sections.find((s) => s.type === sectionType);
  if (!section) {
    throw new Error(`No section of type "${sectionType}" in this blueprint`);
  }
  if (!path || typeof path !== "string") {
    throw new Error(`Invalid path: ${path}`);
  }
  setByPath(section as unknown as Record<string, unknown>, path, value);
  return next;
}

function setByPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  // Walk to the parent of the leaf.
  let cursor: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    if (cursor == null || typeof cursor !== "object") {
      throw new Error(`Cannot traverse path "${path}" — non-object at "${segments.slice(0, i).join(".")}"`);
    }
    cursor = readKey(cursor, key);
  }
  if (cursor == null || typeof cursor !== "object") {
    throw new Error(`Cannot set path "${path}" — parent is null/non-object`);
  }
  const last = segments[segments.length - 1];
  writeKey(cursor, last, value);
}

function readKey(obj: unknown, key: string): unknown {
  if (obj == null || typeof obj !== "object") return undefined;
  if (/^\d+$/.test(key)) {
    const arr = obj as unknown[];
    if (!Array.isArray(arr)) throw new Error(`Expected array at key "${key}"`);
    return arr[parseInt(key, 10)];
  }
  return (obj as Record<string, unknown>)[key];
}

function writeKey(obj: unknown, key: string, value: unknown): void {
  if (obj == null || typeof obj !== "object") {
    throw new Error(`Cannot write to non-object at "${key}"`);
  }
  if (/^\d+$/.test(key)) {
    const arr = obj as unknown[];
    if (!Array.isArray(arr)) throw new Error(`Expected array at key "${key}"`);
    arr[parseInt(key, 10)] = value;
    return;
  }
  (obj as Record<string, unknown>)[key] = value;
}
