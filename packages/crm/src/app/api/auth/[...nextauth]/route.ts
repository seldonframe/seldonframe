import { handlers } from "@/auth";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  console.log("[auth][route] GET", req.nextUrl.pathname, Object.fromEntries(req.nextUrl.searchParams));
  const resp = await handlers.GET(req);
  const location = resp?.headers?.get?.("location");
  if (location) console.log("[auth][route] GET redirect →", location);
  return resp;
}

export async function POST(req: NextRequest) {
  console.log("[auth][route] POST", req.nextUrl.pathname);
  return handlers.POST(req);
}
