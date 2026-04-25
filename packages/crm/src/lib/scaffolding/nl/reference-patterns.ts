// Reference-pattern loader — extracts composition-contract + subscription
// excerpts from existing BLOCK.md files so Claude has concrete anatomy
// to pattern against when translating NL intent → BlockSpec.
//
// Shipped in SLICE 2 PR 2 C2 per audit §3.1 + G-1 (SKILL-only).
//
// Narrow on purpose. The excerpt is ONLY the parts of a BLOCK.md that
// are structurally relevant to a new block's shape: frontmatter slug
// + title + description + the Composition Contract section + the
// Subscriptions section (when present). Everything else (Entities
// prose, agent-synthesis notes, navigation) is block-specific and
// would confuse the pattern match.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type BlockAnatomyExcerpt = {
  slug: string;
  title: string;
  description: string;
  /** Raw text of the `## Composition Contract` section. */
  compositionContract: string;
  /** Raw text of the `## Subscriptions` section, or null when absent. */
  subscriptionsSection: string | null;
};

/**
 * Extract anatomy-relevant sections from a single BLOCK.md path.
 * Returns null if the file doesn't exist.
 */
export function extractBlockAnatomyExcerpt(
  blockMdPath: string,
): BlockAnatomyExcerpt | null {
  if (!existsSync(blockMdPath)) return null;
  const content = readFileSync(blockMdPath, "utf8");

  const slug = readFrontmatterValue(content, "id") ?? inferSlugFromPath(blockMdPath);
  const title = readHeaderTitle(content) ?? slug;
  const description = readDescription(content) ?? "";
  const compositionContract = extractSection(content, "Composition Contract") ?? "";
  const subscriptionsSection = extractSection(content, "Subscriptions");

  return {
    slug,
    title,
    description,
    compositionContract,
    subscriptionsSection,
  };
}

/**
 * Default reference-set loader. Returns excerpts for the blocks
 * most useful as anatomy examples:
 *   - notes: simple tool-only (the PR 1 C7 smoke-test)
 *   - crm: real-world anatomy with `## Subscriptions` (SLICE 1 PR 2
 *     adopter — shows a block subscribing to another block's event)
 *
 * More are included when they exist at HEAD.
 */
export function loadReferencePatterns(repoRoot: string): BlockAnatomyExcerpt[] {
  const candidates = [
    "packages/crm/src/blocks/notes.block.md",
    "packages/crm/src/blocks/crm.block.md",
  ];
  const out: BlockAnatomyExcerpt[] = [];
  for (const rel of candidates) {
    const abs = path.join(repoRoot, rel);
    const excerpt = extractBlockAnatomyExcerpt(abs);
    if (excerpt) out.push(excerpt);
  }
  return out;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function readFrontmatterValue(content: string, key: string): string | null {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return null;
  const frontmatter = content.slice(4, end);
  const line = frontmatter.split("\n").find((l) => l.startsWith(`${key}:`));
  if (!line) return null;
  return line.slice(key.length + 1).trim();
}

function readHeaderTitle(content: string): string | null {
  const match = content.match(/^#\s*BLOCK(?:\.md)?\s*:\s*(.+)$/im);
  return match ? match[1].trim() : null;
}

function readDescription(content: string): string | null {
  const match = content.match(/\*\*Description\*\*\s*\n([^\n]+)/);
  return match ? match[1].trim() : null;
}

/**
 * Extract a top-level `## <name>` section's body until the next
 * top-level header (`## ...`) or EOF. Returns null if section absent.
 */
function extractSection(content: string, sectionName: string): string | null {
  const pattern = new RegExp(`\n##\\s+${escapeRegex(sectionName)}\\s*\n`, "i");
  const match = content.match(pattern);
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].length;
  const restOfFile = content.slice(start);
  const nextSectionMatch = restOfFile.match(/\n##\s+/);
  const end = nextSectionMatch?.index ?? restOfFile.length;
  return restOfFile.slice(0, end).trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferSlugFromPath(p: string): string {
  const base = path.basename(p, ".block.md");
  return base;
}
