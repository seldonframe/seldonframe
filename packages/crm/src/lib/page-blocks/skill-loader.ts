// ============================================================================
// v1.4.0 — SKILL.md loader
// ============================================================================
//
// Reads the raw SKILL.md content for a block and returns it to the IDE
// agent. The IDE agent's LLM parses the YAML frontmatter on its end and
// uses the markdown body as its generation prompt.
//
// We do NOT parse the frontmatter on the server in v1.4 — runtime
// validation uses the Zod schema in registry.ts (the temporary
// duplication noted there). This loader exists purely to serve the file
// content over MCP via the get_block_skill tool.
//
// File location: packages/crm/src/blocks/<name>/SKILL.md
//
// Why not load from the repo root /blocks/ folder: Next.js bundles need
// to know about runtime file reads. Co-locating SKILL.md inside the CRM
// package's src/ tree means Next picks them up via the standard module
// resolution, no special bundler config. Future marketplace blocks
// installed at runtime will load from a separate per-org location.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Mirror the resolution pattern from src/lib/soul-compiler/blocks.ts so we
// work both in the monorepo root (Next.js dev server, scripts) and in the
// per-package working directory that Vercel uses at function runtime.
// Vercel's auto-tracing already picks up the packages/crm/src/blocks
// directory because the soul-compiler also reads from it.
const BLOCKS_ROOT_CANDIDATES = [
  join(process.cwd(), "packages", "crm", "src", "blocks"),
  join(process.cwd(), "src", "blocks"),
];

/**
 * Read a block's SKILL.md and return the raw markdown text.
 * Returns null if the file doesn't exist or can't be read.
 *
 * @param blockName - matches the folder name under packages/crm/src/blocks/
 */
export async function loadSkillMd(blockName: string): Promise<string | null> {
  // Allowlist guard: blockName must be a known registry entry shape.
  // Without this, a malicious caller could probe arbitrary file paths
  // via path traversal or weird subfolder names.
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(blockName)) {
    return null;
  }

  for (const root of BLOCKS_ROOT_CANDIDATES) {
    try {
      const path = join(root, blockName, "SKILL.md");
      return await readFile(path, "utf8");
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}
