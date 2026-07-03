import { NextResponse } from "next/server";
import { buildAuthorizationServerMetadata } from "@/lib/oauth/authorization-server-metadata";

export const runtime = "nodejs";

const ISSUER = "https://app.seldonframe.com";

export async function GET() {
  if (process.env.SF_OAUTH_ENABLED !== "true") {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json(buildAuthorizationServerMetadata({ issuer: ISSUER }), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
