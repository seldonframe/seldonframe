import { NextResponse } from "next/server";
import { resolveAuthenticatedBuilderUserId } from "@/lib/openclaw/self-service";
import { listVerticalPacks } from "@/lib/openclaw/vertical-packs";

export async function GET(request: Request) {
  try {
    await resolveAuthenticatedBuilderUserId(request.headers);
    const packs = await listVerticalPacks();
    return NextResponse.json({
      ok: true,
      count: packs.length,
      packs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list vertical packs.";
    const status = message.includes("Unauthorized") || message.includes("Invalid x-seldon-api-key") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
