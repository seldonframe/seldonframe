import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/utils/api-auth";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { demoApiBlockedResponse, isDemoReadonly, isWriteMethod } from "@/lib/demo/server";

export async function guardApiRequest(request: Request) {
  const orgId = request.headers.get("x-org-id");
  const apiKey = request.headers.get("x-api-key");

  if (isDemoReadonly() && isWriteMethod(request.method)) {
    return { error: demoApiBlockedResponse() };
  }

  if (!orgId) {
    return { error: NextResponse.json({ error: "Missing x-org-id" }, { status: 400 }) };
  }

  if (!checkRateLimit(`${orgId}:${request.headers.get("x-forwarded-for") ?? "local"}`)) {
    return { error: NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }) };
  }

  const validKey = await verifyApiKey(orgId, apiKey);

  if (!validKey) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { orgId };
}
