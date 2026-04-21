import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { listTemplates } from "@/lib/puck/templates";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const rows = listTemplates().map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    industry: template.industry,
  }));

  return NextResponse.json({ data: rows });
}
