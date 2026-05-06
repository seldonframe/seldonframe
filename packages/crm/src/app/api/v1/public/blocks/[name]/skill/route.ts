// v1.4.0 — GET /api/v1/public/blocks/[name]/skill
//
// Returns the raw SKILL.md content for one block. The IDE agent reads this
// to learn the block's prop schema, voice rules, examples, and validators
// before generating props. No auth — public knowledge.
//
// Response shape (text/markdown):
//   The full SKILL.md file as written by the SF team. The IDE agent's LLM
//   parses the YAML frontmatter and the markdown body itself.

import { NextResponse } from "next/server";
import { getBlock } from "@/lib/page-blocks/registry";
import { loadSkillMd } from "@/lib/page-blocks/skill-loader";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  // v1.12 — accept SKILL.md for any block whose name is a valid
  // identifier and whose SKILL.md exists on disk. Previously we required
  // a registry entry first; that gated out the new "composite" block
  // (which has no typed prop schema — its "props" ARE a recursive tree).
  // The skill-loader has its own allowlist regex (^[a-z][a-z0-9-]{1,30}$)
  // so we're not opening a path-traversal vector by skipping the registry
  // check here.
  const skill = await loadSkillMd(name);
  if (!skill) {
    // Distinguish "not in registry AND no skill file" vs "registry hit
    // but skill file missing" so operators get an actionable message.
    const block = getBlock(name);
    return NextResponse.json(
      {
        error: block ? "skill_md_not_found" : "block_unknown",
        block_name: name,
        hint: block
          ? `Expected file at packages/crm/src/blocks/${name}/SKILL.md`
          : `Unknown block name. Known: ${[...new Set(["composite", "hero", "services", "about", "faq", "cta", "booking", "intake"])].join(", ")}.`,
      },
      { status: block ? 500 : 404 },
    );
  }
  return new NextResponse(skill, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
