// ============================================================================
// v1.12.0 — composite-block primitive vocabulary + Zod schema
// ============================================================================
//
// First-principles design: a "block" is a tree of low-level primitives.
// 12 node kinds cover the operator-facing landing-page surface. New
// "block types" (comparison, pricing, gallery, "how it works") need
// NO server-side type-per-block work — they're just trees the agent
// composes.
//
// Vocabulary:
//
//   Containers: section / row / col / card
//   Content:    heading / text / image / list / button / stat
//   Special:    embed (workspace-data references), divider, spacer
//
// Why exactly these 12?
//
//   - Tried collapsing to 3 (container/content/leaf). Lost discrimination
//     that makes Zod validation cheap.
//   - Tried adding 20+ (banner, pull-quote, accordion, tabs, video, …).
//     Most are compositions of the 12 + theme variants. Resist sprawl;
//     add new kinds only when 3+ workspaces independently need them.
//   - Each kind has 0-4 props beyond the discriminant. Total ~50 props
//     across the vocabulary. One renderer switch handles all of them.
//
// Constraints (validateCompositeTree below):
//
//   - Tree depth ≤ 4 (section > row > card > leaf is the canonical pattern)
//   - Children-per-container caps (8 / 4 / 8 / 12 for section / row / card / list)
//   - Heading levels descend without skipping (a11y)
//   - Length caps on every text-bearing field (Zod-enforced)
//
// Antifragility: as LLMs improve at composing trees that respect these
// rules, the agent generates correctly on first try more often, the
// validation_warnings rate drops, and operator-perceived quality rises
// — with zero harness changes.

import { z } from "zod";

// ─── caps (exported so tests can reference) ────────────────────────────────

export const MAX_TREE_DEPTH = 4;
export const MAX_SECTION_CHILDREN = 8;
export const MAX_ROW_CHILDREN = 4;
export const MAX_CARD_CHILDREN = 8;
export const MAX_LIST_ITEMS = 12;

// ─── leaf node schemas ─────────────────────────────────────────────────────

const HeadingSchema = z.object({
  kind: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string().trim().min(1).max(120),
});

const TextSchema = z.object({
  kind: z.literal("text"),
  text: z.string().trim().min(1).max(800),
  emphasis: z.enum(["muted", "bold"]).optional(),
});

const ImageSchema = z.object({
  kind: z.literal("image"),
  url: z.string().trim().min(1).max(2048),
  alt: z.string().trim().max(240).optional(),
});

const ListSchema = z.object({
  kind: z.literal("list"),
  style: z.enum(["bullet", "check", "x", "number"]).optional(),
  items: z.array(z.string().trim().min(1).max(200)).min(1).max(MAX_LIST_ITEMS),
});

const ButtonActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("navigate"),
    href: z.string().trim().min(1).max(2048),
  }),
  z.object({ kind: z.literal("book") }),
  z.object({ kind: z.literal("intake") }),
  z.object({ kind: z.literal("phone") }),
]);

const ButtonSchema = z.object({
  kind: z.literal("button"),
  label: z.string().trim().min(1).max(40),
  action: ButtonActionSchema,
});

const StatSchema = z.object({
  kind: z.literal("stat"),
  value: z.string().trim().min(1).max(20),
  label: z.string().trim().min(1).max(60),
});

const EmbedSchema = z.object({
  kind: z.literal("embed"),
  ref: z.enum(["services", "faq", "testimonials", "hours", "phone"]),
});

const DividerSchema = z.object({
  kind: z.literal("divider"),
});

const SpacerSchema = z.object({
  kind: z.literal("spacer"),
  size: z.enum(["sm", "md", "lg"]).optional(),
});

// ─── recursive container schemas ───────────────────────────────────────────
//
// Zod recursive types via z.lazy. Section / row / col / card all hold
// children that are themselves CompositeNodes. The cycle is fine —
// validateCompositeTree (below) enforces depth + child-count caps that
// Zod alone can't.

type CompositeNodeBase =
  | z.infer<typeof HeadingSchema>
  | z.infer<typeof TextSchema>
  | z.infer<typeof ImageSchema>
  | z.infer<typeof ListSchema>
  | z.infer<typeof ButtonSchema>
  | z.infer<typeof StatSchema>
  | z.infer<typeof EmbedSchema>
  | z.infer<typeof DividerSchema>
  | z.infer<typeof SpacerSchema>;

export type CompositeNode =
  | CompositeNodeBase
  | { kind: "section"; eyebrow?: string; headline?: string; subhead?: string; children: CompositeNode[] }
  | { kind: "row"; cols?: 2 | 3 | 4; children: CompositeNode[] }
  | { kind: "col"; children: CompositeNode[] }
  | { kind: "card"; variant?: "default" | "muted" | "primary"; children: CompositeNode[] };

const CompositeNodeLazySchema: z.ZodType<CompositeNode> = z.lazy(() =>
  z.union([
    HeadingSchema,
    TextSchema,
    ImageSchema,
    ListSchema,
    ButtonSchema,
    StatSchema,
    EmbedSchema,
    DividerSchema,
    SpacerSchema,
    z.object({
      kind: z.literal("section"),
      eyebrow: z.string().trim().max(60).optional(),
      headline: z.string().trim().max(120).optional(),
      subhead: z.string().trim().max(240).optional(),
      children: z.array(CompositeNodeLazySchema),
    }),
    z.object({
      kind: z.literal("row"),
      cols: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
      children: z.array(CompositeNodeLazySchema),
    }),
    z.object({
      kind: z.literal("col"),
      children: z.array(CompositeNodeLazySchema),
    }),
    z.object({
      kind: z.literal("card"),
      variant: z.enum(["default", "muted", "primary"]).optional(),
      children: z.array(CompositeNodeLazySchema),
    }),
  ]),
);

export const CompositeNodeSchema = CompositeNodeLazySchema;

// ─── structural validator (depth + children caps + heading descent) ────────

export type CompositeValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * Run Zod parse first, then structural rules. Structural rules cover
 * what Zod can't (recursive depth, heading-level descent across the
 * subtree, child-count caps that vary by container kind).
 */
export function validateCompositeTree(input: unknown): CompositeValidationResult {
  const parsed = CompositeNodeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "<root>"}: ${i.message}`,
      ),
    };
  }
  const tree = parsed.data;

  const errors: string[] = [];
  walkValidate(tree, 1, errors);
  validateHeadingDescent(tree, errors);

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

function walkValidate(
  node: CompositeNode,
  depth: number,
  errors: string[],
): void {
  if (depth > MAX_TREE_DEPTH) {
    errors.push(
      `tree depth ${depth} exceeds MAX_TREE_DEPTH=${MAX_TREE_DEPTH} (deepest reached at kind=${node.kind})`,
    );
    return;
  }

  switch (node.kind) {
    case "section":
      if (node.children.length > MAX_SECTION_CHILDREN) {
        errors.push(
          `section has ${node.children.length} children — too many (max ${MAX_SECTION_CHILDREN})`,
        );
      }
      for (const child of node.children) walkValidate(child, depth + 1, errors);
      break;
    case "row":
      if (node.children.length > MAX_ROW_CHILDREN) {
        errors.push(
          `row has ${node.children.length} children — too many (max ${MAX_ROW_CHILDREN})`,
        );
      }
      for (const child of node.children) walkValidate(child, depth + 1, errors);
      break;
    case "col":
      for (const child of node.children) walkValidate(child, depth + 1, errors);
      break;
    case "card":
      if (node.children.length > MAX_CARD_CHILDREN) {
        errors.push(
          `card has ${node.children.length} children — too many (max ${MAX_CARD_CHILDREN})`,
        );
      }
      for (const child of node.children) walkValidate(child, depth + 1, errors);
      break;
    default:
      // leaves — no descent
      break;
  }
}

/**
 * Heading levels must descend without skipping (h1 → h2 → h3 OK; h1 →
 * h3 not OK). Walks tree in document order, tracks the last seen level.
 * The first heading anywhere can be any level (1-3).
 */
function validateHeadingDescent(tree: CompositeNode, errors: string[]): void {
  let lastLevel: number | null = null;
  walkHeadings(tree, (level) => {
    if (lastLevel !== null && level > lastLevel + 1) {
      errors.push(
        `heading level skipped: previous was h${lastLevel}, this is h${level} (a11y — descend without skipping)`,
      );
    }
    lastLevel = level;
  });
}

function walkHeadings(
  node: CompositeNode,
  visit: (level: number) => void,
): void {
  if (node.kind === "heading") visit(node.level);
  if (
    node.kind === "section" ||
    node.kind === "row" ||
    node.kind === "col" ||
    node.kind === "card"
  ) {
    for (const child of node.children) walkHeadings(child, visit);
  }
}

// ─── voice scanner (warnings, not errors) ─────────────────────────────────

export interface VoiceViolation {
  word: string;
  /** Where in the tree the violation appeared. */
  location: "headline" | "subhead" | "eyebrow" | "heading" | "text" | "list_item" | "button_label" | "stat_label";
  /** The full text snippet (for the agent to find + edit). */
  snippet: string;
}

/**
 * Scan all text-bearing fields for words from the workspace's
 * voice.avoidWords. Returns warnings — server returns these as
 * validation_warnings (not errors); agent self-corrects on retry.
 *
 * Word-boundary, case-insensitive matching. "synergize" does NOT match
 * "synergy" because they're different lemmas; the soul is responsible
 * for declaring the exact words it wants to avoid.
 */
export function scanForVoiceViolations(
  tree: CompositeNode,
  avoidWords: readonly string[],
): VoiceViolation[] {
  if (!avoidWords.length) return [];
  const out: VoiceViolation[] = [];

  // Build one big regex with word boundaries. Escape special regex
  // chars in each word.
  const patterns = avoidWords
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => ({ word: w, re: new RegExp(`\\b${escapeRegex(w)}\\b`, "i") }));
  if (!patterns.length) return [];

  const scan = (text: string, location: VoiceViolation["location"]) => {
    for (const { word, re } of patterns) {
      if (re.test(text)) out.push({ word, location, snippet: text });
    }
  };

  const walk = (node: CompositeNode): void => {
    switch (node.kind) {
      case "section":
        if (node.eyebrow) scan(node.eyebrow, "eyebrow");
        if (node.headline) scan(node.headline, "headline");
        if (node.subhead) scan(node.subhead, "subhead");
        for (const c of node.children) walk(c);
        break;
      case "row":
      case "col":
      case "card":
        for (const c of node.children) walk(c);
        break;
      case "heading":
        scan(node.text, "heading");
        break;
      case "text":
        scan(node.text, "text");
        break;
      case "list":
        for (const item of node.items) scan(item, "list_item");
        break;
      case "button":
        scan(node.label, "button_label");
        break;
      case "stat":
        scan(node.label, "stat_label");
        break;
      default:
        break;
    }
  };

  walk(tree);
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
