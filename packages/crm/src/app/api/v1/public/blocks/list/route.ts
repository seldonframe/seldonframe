// v1.4.0 — GET /api/v1/public/blocks/list
//
// Returns the catalog of v2 page blocks the IDE agent can render via the
// MCP get_block_skill + persist_block flow. No auth — the catalog is
// public knowledge (so are the SKILL.md contents).
//
// Response:
//   {
//     blocks: [
//       { name: "hero", version: "1.0.0", section_type: "hero",
//         description: "...", skill_url: "/api/v1/public/blocks/hero/skill" },
//       ...
//     ]
//   }

import { NextResponse } from "next/server";
import { BLOCK_REGISTRY } from "@/lib/page-blocks/registry";

export async function GET() {
  const blocks = Object.values(BLOCK_REGISTRY).map((b) => ({
    name: b.name,
    version: b.version,
    section_type: b.sectionType,
    description: b.description,
    skill_url: `/api/v1/public/blocks/${b.name}/skill`,
  }));
  return NextResponse.json({ blocks });
}
