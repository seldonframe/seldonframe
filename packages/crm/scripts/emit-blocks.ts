/**
 * v1.5.0 — block codegen.
 *
 * Reads each packages/crm/src/blocks/<name>/SKILL.md, parses the YAML
 * frontmatter, and emits packages/crm/src/blocks/<name>/__generated__/block.ts
 * containing the Zod schema, the inferred Props type, and the block
 * metadata (name, version, surface, sectionType, description). Imports
 * the handcrafted toSection + validators from a sibling handlers.ts.
 *
 * The principle: SKILL.md frontmatter is the SINGLE SOURCE OF TRUTH for
 * block prop schemas. Pre-1.5 the schema lived in BOTH SKILL.md (LLM-
 * readable YAML) AND lib/page-blocks/registry.ts (runtime Zod) — every
 * prop change required updating both, and divergence was undetectable
 * until a runtime failure surfaced it. The Cinder & Salt booking bug
 * (v1.4.2 hotfix) was one such failure: SKILL.md said "form_fields are
 * extras only, server adds standard name+email" but the runtime persist
 * code wiped out everything. Codegen makes that class structurally
 * impossible.
 *
 * Usage:
 *   pnpm blocks:emit          # regenerate __generated__/ for every block
 *   pnpm blocks:emit --check  # exit non-zero if generated is stale
 *
 * The --check flag is what CI runs; if anyone edits SKILL.md without
 * regenerating, the build fails.
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const BLOCKS_ROOT = resolve(__dirname, "..", "src", "blocks");
const isCheck = process.argv.includes("--check");

// ─── Frontmatter parser ─────────────────────────────────────────────────────

interface BlockFrontmatter {
  name: string;
  version: string;
  description: string;
  surface?: "landing-section" | "booking" | "intake";
  section_type?: string;
  props: Record<string, PropSpec>;
  validators?: Array<{ rule: string; severity?: string; description?: string }>;
}

interface PropSpec {
  type: string;
  required?: boolean;
  nullable?: boolean;
  enum?: unknown[];
  min?: number;
  max?: number;
  properties?: Record<string, PropSpec>;
  items?: PropSpec;
  min_items?: number;
  max_items?: number;
  tuple?: PropSpec[];
  union?: PropSpec[];
  // Ignored by codegen — prompt guidance only.
  description?: string;
  min_words?: number;
  max_words?: number;
  examples?: unknown[];
  // Convenience aliases.
  optional?: boolean;
  default?: unknown;
}

function parseFrontmatter(skillMd: string): BlockFrontmatter {
  const match = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error("No YAML frontmatter (--- ... ---) found");
  }
  const parsed = parseYaml(match[1]) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Frontmatter is not a YAML object");
  }
  for (const required of ["name", "version", "description", "props"]) {
    if (!(required in parsed)) {
      throw new Error(`Frontmatter missing required field: ${required}`);
    }
  }
  return parsed as unknown as BlockFrontmatter;
}

// ─── YAML → Zod codegen ─────────────────────────────────────────────────────
//
// Each function returns a string of TypeScript source that, when
// evaluated in a context with `z` in scope, is the Zod schema for that
// prop. We keep the output pretty-printed for human-debuggability —
// codegen output should be readable, not minified.

function zodForProp(spec: PropSpec, indent = 4): string {
  // Normalize required/optional aliases. Default: required.
  // - `required: false` → optional
  // - `optional: true` → optional
  // - both unset → required
  const isOptional =
    spec.required === false || spec.optional === true;
  const isRequired = !isOptional;
  void isRequired; // documents intent; not used after the check
  let core = zodCore(spec, indent);
  if (spec.nullable) core = `${core}.nullable()`;
  if (isOptional) core = `${core}.optional()`;
  return core;
}

function zodCore(spec: PropSpec, indent: number): string {
  switch (spec.type) {
    case "string": {
      let s = "z.string()";
      if (typeof spec.min === "number") s += `.min(${spec.min})`;
      if (typeof spec.max === "number") s += `.max(${spec.max})`;
      return s;
    }
    case "number": {
      let s = "z.number()";
      if (typeof spec.min === "number") s += `.min(${spec.min})`;
      if (typeof spec.max === "number") s += `.max(${spec.max})`;
      return s;
    }
    case "boolean":
      return "z.boolean()";
    case "enum": {
      if (!Array.isArray(spec.enum) || spec.enum.length === 0) {
        throw new Error(`type=enum requires a non-empty enum array`);
      }
      const values = spec.enum
        .map((v) => JSON.stringify(v))
        .join(", ");
      return `z.enum([${values}] as const)`;
    }
    case "object": {
      if (!spec.properties) {
        throw new Error(`type=object requires properties`);
      }
      const inner = Object.entries(spec.properties)
        .map(
          ([key, sub]) =>
            `${" ".repeat(indent + 2)}${JSON.stringify(key)}: ${zodForProp(sub, indent + 2)}`,
        )
        .join(",\n");
      return `z.object({\n${inner}\n${" ".repeat(indent)}})`;
    }
    case "array": {
      if (!spec.items) {
        throw new Error(`type=array requires items`);
      }
      let s = `z.array(${zodForProp(spec.items, indent + 2)})`;
      if (typeof spec.min_items === "number") s += `.min(${spec.min_items})`;
      if (typeof spec.max_items === "number") s += `.max(${spec.max_items})`;
      return s;
    }
    case "tuple": {
      if (!Array.isArray(spec.tuple) || spec.tuple.length === 0) {
        throw new Error(`type=tuple requires non-empty tuple array`);
      }
      const elements = spec.tuple
        .map((t) => zodForProp(t, indent + 2))
        .join(", ");
      return `z.tuple([${elements}])`;
    }
    case "union": {
      if (!Array.isArray(spec.union) || spec.union.length < 2) {
        throw new Error(`type=union requires at least 2 union members`);
      }
      const members = spec.union
        .map((m) => zodForProp(m, indent + 2))
        .join(", ");
      return `z.union([${members}])`;
    }
    default:
      throw new Error(`Unsupported prop type: ${JSON.stringify(spec.type)}`);
  }
}

// ─── File template ──────────────────────────────────────────────────────────

function emitBlockFile(blockName: string, fm: BlockFrontmatter): string {
  if (!fm.surface) {
    throw new Error(`Block "${blockName}" missing frontmatter "surface"`);
  }
  if (!fm.section_type) {
    throw new Error(`Block "${blockName}" missing frontmatter "section_type"`);
  }
  if (fm.name !== blockName) {
    throw new Error(
      `Block folder name "${blockName}" does not match frontmatter name "${fm.name}"`,
    );
  }

  const propsZod = Object.entries(fm.props)
    .map(
      ([key, spec]) =>
        `  ${JSON.stringify(key)}: ${zodForProp(spec, 2)}`,
    )
    .join(",\n");

  // Escape backticks in the description so the template literal stays valid.
  const description = fm.description.replace(/`/g, "\\`");

  return `// ============================================================================
// AUTO-GENERATED by \`pnpm blocks:emit\` from ../SKILL.md frontmatter.
// DO NOT EDIT BY HAND — re-run \`pnpm blocks:emit\` after editing SKILL.md.
// ============================================================================
//
// The codegen contract (v1.5.0): every consumer of a block's prop schema
// reads from this file (via lib/page-blocks/registry.ts). The SKILL.md
// frontmatter is the SINGLE source of truth; any drift between this file
// and SKILL.md is caught by the \`pnpm blocks:emit --check\` CI step.

import { z } from "zod";

export const PropsSchema = z.object({
${propsZod}
});

export type Props = z.infer<typeof PropsSchema>;

export const meta = {
  name: ${JSON.stringify(fm.name)},
  version: ${JSON.stringify(fm.version)},
  surface: ${JSON.stringify(fm.surface)} as const,
  sectionType: ${JSON.stringify(fm.section_type)} as const,
  description: \`${description}\`,
} as const;
`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  const blockNames = readdirSync(BLOCKS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => existsSync(join(BLOCKS_ROOT, name, "SKILL.md")))
    .sort();

  if (blockNames.length === 0) {
    console.error(`No SKILL.md files found under ${BLOCKS_ROOT}`);
    process.exit(2);
  }

  console.log(
    `${isCheck ? "Checking" : "Emitting"} __generated__/ for ${blockNames.length} blocks: ${blockNames.join(", ")}`,
  );

  let drift = false;
  for (const name of blockNames) {
    const skillPath = join(BLOCKS_ROOT, name, "SKILL.md");
    const skillMd = readFileSync(skillPath, "utf8");
    let fm: BlockFrontmatter;
    try {
      fm = parseFrontmatter(skillMd);
    } catch (err) {
      console.error(
        `✗ ${name}: failed to parse frontmatter — ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }

    let generated: string;
    try {
      generated = emitBlockFile(name, fm);
    } catch (err) {
      console.error(
        `✗ ${name}: codegen failed — ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }

    const outDir = join(BLOCKS_ROOT, name, "__generated__");
    const outPath = join(outDir, "block.ts");
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }
    const existing = existsSync(outPath) ? readFileSync(outPath, "utf8") : null;

    if (existing === generated) {
      console.log(`  ✓ ${name} — up to date`);
    } else if (isCheck) {
      console.error(
        `  ✗ ${name} — STALE: __generated__/block.ts differs from SKILL.md. Run \`pnpm blocks:emit\` and commit.`,
      );
      drift = true;
    } else {
      writeFileSync(outPath, generated, "utf8");
      console.log(`  ✓ ${name} — wrote ${outPath}`);
    }
  }

  if (drift) {
    console.error("\nGenerated files are stale. Run `pnpm blocks:emit` and commit the diff.");
    process.exit(1);
  }
  console.log("\nDone.");
}

main();
