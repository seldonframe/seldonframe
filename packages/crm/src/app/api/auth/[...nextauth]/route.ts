import { handlers } from "@/auth";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  console.log("[auth][route] GET", req.nextUrl.pathname, Object.fromEntries(req.nextUrl.searchParams));
  if (req.nextUrl.pathname === "/api/auth/callback/google") {
    const pkceCookie = req.cookies.get("__Secure-authjs.pkce.code_verifier") ?? req.cookies.get("authjs.pkce.code_verifier");
    console.log("[auth][route] callback params", {
      hasCode: req.nextUrl.searchParams.has("code"),
      hasState: req.nextUrl.searchParams.has("state"),
      hasIss: req.nextUrl.searchParams.has("iss"),
    });
    console.log("[auth][route] callback pkce cookie", {
      present: Boolean(pkceCookie?.value),
      length: pkceCookie?.value?.length ?? 0,
    });
  }
  const resp = await handlers.GET(req);
  const location = resp?.headers?.get?.("location");
  console.log("[auth][route] GET status", resp?.status);
  if (location) console.log("[auth][route] GET redirect →", location);
  return resp;
}

export async function POST(req: NextRequest) {
  console.log("[auth][route] POST", req.nextUrl.pathname);
  const resp = await handlers.POST(req);
  const location = resp?.headers?.get?.("location");
  console.log("[auth][route] POST status", resp?.status);
  if (location) console.log("[auth][route] POST redirect →", location);
  return resp;
}
