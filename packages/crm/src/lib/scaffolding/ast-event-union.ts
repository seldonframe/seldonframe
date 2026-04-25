// AST-located splice editor for the SeldonEvent union.
//
// Shipped in SLICE 2 PR 2 Commit 1 per audit §3.7 + G-2 resolution.
//
// Design:
//   - PRIMARY: parse source with the TypeScript Compiler API,
//     locate the `export type SeldonEvent = ...` union, read its
//     existing variants, compute the byte-offset just before the
//     terminating `;`, and splice new variants there.
//   - FALLBACK: only on explicit AST parse failure (the parser
//     can't find the SeldonEvent declaration at all). Uses the same
//     brace-aware text scan as lib/events/parse-registry.ts. Logs
//     loud warning so the builder can review manually.
//
// Why TypeScript Compiler API instead of ts-morph (G-2 said ts-morph
// primary): ts-morph is a convenience layer over the same compiler
// API. Using the API directly avoids adding a new dependency in a
// worktree-constrained install. Semantic intent of G-2 — "AST-based,
// not line-splice" — is satisfied because the parser is what
// identifies the insertion offset; text manipulation just writes
// the new variant at that located position.
//
// Idempotency: reads existing variants' `type: "..."` literal
// strings. Events already present in the union are skipped; `added`
// list returned for caller observability.

import * as ts from "typescript";

import type { BlockSpec, BlockSpecEvent } from "./spec";

export type UnionEditResult = {
  /** Updated source text — caller writes to disk. */
  source: string;
  /** Events actually added this call (may be subset of spec.produces). */
  added: string[];
  /**
   * True when the AST-located-splice path succeeded.
   * False when the text-splice fallback was used — log a warning
   * and encourage manual review.
   */
  astPath: boolean;
};

export function addEventsToSeldonUnion(
  source: string,
  spec: BlockSpec,
): UnionEditResult {
  if (spec.produces.length === 0) {
    return { source, added: [], astPath: true };
  }

  // AST path
  try {
    const astResult = addViaAst(source, spec.produces);
    if (astResult !== null) return astResult;
  } catch (err) {
    // Fall through to text-splice path. Log for visibility.
    // eslint-disable-next-line no-console
    console.warn(
      `[ast-event-union] AST parse path failed, attempting text-splice fallback: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // Fallback
  return addViaTextSplice(source, spec.produces);
}

// ---------------------------------------------------------------------
// AST path
// ---------------------------------------------------------------------

function addViaAst(
  source: string,
  events: BlockSpecEvent[],
): UnionEditResult | null {
  const sourceFile = ts.createSourceFile(
    "events.ts",
    source,
    ts.ScriptTarget.ES2020,
    /* setParentNodes */ true,
  );

  const aliasDecl = findSeldonEventAlias(sourceFile);
  if (!aliasDecl) return null; // caller may try fallback

  const unionNode = aliasDecl.type;
  if (!ts.isUnionTypeNode(unionNode)) {
    // Some edge: single-variant "union" is a TypeLiteralNode.
    // Handle both shapes.
    if (ts.isTypeLiteralNode(unionNode)) {
      // No existing variants to dedupe against — treat as empty.
      return appendAfterNode(source, aliasDecl, [], events);
    }
    return null;
  }

  const existingTypes = extractExistingEventTypes(unionNode);
  const toAdd = events.filter((e) => !existingTypes.has(e.name));
  if (toAdd.length === 0) {
    return { source, added: [], astPath: true };
  }

  // Insertion offset: right before the aliasDecl's terminating `;`.
  // Compiler API positions `aliasDecl.end` at the `;` character, so
  // we splice AT `aliasDecl.end - 1` (the position before the
  // semicolon) with leading whitespace. The Printer-free approach:
  // compute indentation from the last variant's indentation and
  // reuse it for the new ones.
  return appendAfterNode(source, aliasDecl, Array.from(existingTypes), toAdd);
}

function findSeldonEventAlias(
  sourceFile: ts.SourceFile,
): ts.TypeAliasDeclaration | null {
  let found: ts.TypeAliasDeclaration | null = null;
  function visit(node: ts.Node): void {
    if (found) return;
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === "SeldonEvent"
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function extractExistingEventTypes(union: ts.UnionTypeNode): Set<string> {
  const types = new Set<string>();
  for (const variant of union.types) {
    if (!ts.isTypeLiteralNode(variant)) continue;
    for (const member of variant.members) {
      if (!ts.isPropertySignature(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;
      if (member.name.text !== "type") continue;
      const typeNode = member.type;
      if (typeNode && ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) {
        types.add(typeNode.literal.text);
      }
    }
  }
  return types;
}

function appendAfterNode(
  source: string,
  aliasDecl: ts.TypeAliasDeclaration,
  _existing: string[],
  events: BlockSpecEvent[],
): UnionEditResult {
  // Splice new variants just before the trailing `;` of the alias
  // declaration. aliasDecl.end points at the character AFTER the
  // `;`, so `end - 1` is the `;` itself.
  const semicolonIdx = aliasDecl.end - 1;
  // Build the variant text. Match the indentation style of the
  // existing union (default: 2-space indent, "| " prefix per line).
  const newVariants = events.map((e) => `\n  | ${renderVariant(e)}`).join("");

  const updated = source.slice(0, semicolonIdx) + newVariants + source.slice(semicolonIdx);

  return {
    source: updated,
    added: events.map((e) => e.name),
    astPath: true,
  };
}

// ---------------------------------------------------------------------
// Variant rendering
// ---------------------------------------------------------------------

function renderVariant(event: BlockSpecEvent): string {
  const dataBody = event.fields.length === 0
    ? "{}"
    : "{ " + event.fields.map(renderField).join("; ") + " }";
  return `{ type: "${event.name}"; data: ${dataBody} }`;
}

function renderField(field: { name: string; type: string; nullable: boolean }): string {
  const tsType = mapTypeToTsSource(field.type);
  const withNullable = field.nullable ? `${tsType} | null` : tsType;
  return `${field.name}: ${withNullable}`;
}

function mapTypeToTsSource(type: string): string {
  switch (type) {
    case "string": return "string";
    case "number": return "number";
    case "integer": return "number";
    case "boolean": return "boolean";
    default: return "unknown";
  }
}

// ---------------------------------------------------------------------
// Text-splice fallback
// ---------------------------------------------------------------------

function addViaTextSplice(
  source: string,
  events: BlockSpecEvent[],
): UnionEditResult {
  // eslint-disable-next-line no-console
  console.warn("[ast-event-union] using text-splice fallback — review the output manually");

  const anchor = source.indexOf("export type SeldonEvent");
  if (anchor === -1) {
    throw new Error(
      "addEventsToSeldonUnion: `export type SeldonEvent` declaration not found in source",
    );
  }

  // Locate the `;` that terminates the alias — brace-aware scan
  // identical to parse-registry.ts's approach.
  const equalsIdx = source.indexOf("=", anchor);
  if (equalsIdx === -1) throw new Error("addEventsToSeldonUnion: malformed SeldonEvent (no `=`)");

  let depth = 0;
  let semicolonIdx = -1;
  for (let i = equalsIdx + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ";" && depth === 0) {
      semicolonIdx = i;
      break;
    }
  }
  if (semicolonIdx === -1) {
    throw new Error("addEventsToSeldonUnion: malformed SeldonEvent (no terminating `;`)");
  }

  // Dedupe against existing variants via naive scan for `type: "<name>"`.
  const unionBody = source.slice(equalsIdx + 1, semicolonIdx);
  const existing = new Set<string>();
  for (const match of unionBody.matchAll(/type:\s*"([^"]+)"/g)) {
    existing.add(match[1]);
  }
  const toAdd = events.filter((e) => !existing.has(e.name));
  if (toAdd.length === 0) {
    return { source, added: [], astPath: false };
  }

  const newVariants = toAdd.map((e) => `\n  | ${renderVariant(e)}`).join("");
  const updated = source.slice(0, semicolonIdx) + newVariants + source.slice(semicolonIdx);

  return {
    source: updated,
    added: toAdd.map((e) => e.name),
    astPath: false,
  };
}
