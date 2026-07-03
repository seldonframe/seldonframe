// RFC 7591 Dynamic Client Registration — OPEN (no auth), public clients only.
// This endpoint is deliberately reachable by anyone (that's what "dynamic"
// means) — parseRegisterRequest is the entire trust boundary (see its doc
// comment). Rate-limited per-IP because it's the most abuse-prone surface
// in this feature (see design doc §4).
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { oauthClients } from "@/db/schema";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { parseRegisterRequest } from "@/lib/oauth/register-request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.SF_OAUTH_ENABLED !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for") ?? "local";
  if (!(await checkRateLimit(`oauth:register:${forwardedFor}`, 20, 60_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = parseRegisterRequest(rawBody);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: parsed.error }, { status: 400 });
  }

  const clientId = crypto.randomBytes(24).toString("base64url");

  await db.insert(oauthClients).values({
    clientId,
    clientName: parsed.value.clientName ?? null,
    redirectUris: parsed.value.redirectUris,
  });

  // RFC 7591 §3.2.1 successful-response shape. token_endpoint_auth_method
  // is ALWAYS "none" — public clients only, no client_secret is ever minted
  // or returned (see design doc §3.2).
  return NextResponse.json(
    {
      client_id: clientId,
      client_name: parsed.value.clientName,
      redirect_uris: parsed.value.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201 }
  );
}
