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
  const block = getBlock(name);
  if (!block) {
    return NextResponse.json(
      {
        error: "block_unknown",
        known_blocks: ["hero", "services", "faq"],
      },
      { status: 404 },
    );
  }
  const skill = await loadSkillMd(name);
  if (!skill) {
    return NextResponse.json(
      {
        error: "skill_md_not_found",
        block_name: name,
        hint: `Expected file at packages/crm/src/blocks/${name}/SKILL.md`,
      },
      { status: 500 },
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
