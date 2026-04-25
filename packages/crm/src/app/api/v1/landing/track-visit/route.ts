import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { landingPages } from "@/db/schema";
import { emitSeldonEvent } from "@/lib/events/bus";
import { dispatchWebhook } from "@/lib/utils/webhooks";

export const runtime = "nodejs";

// Public visit-beacon. Called from the client on public landing-page
// load, so the page itself can be cached as static HTML via Next ISR
// while still emitting one landing.visited event per viewer.
// Unauthenticated; the landing page is public.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    pageId?: unknown;
    visitorId?: unknown;
  };

  if (typeof body.pageId !== "string" || !body.pageId.trim()) {
    return NextResponse.json({ error: "pageId is required" }, { status: 400 });
  }
  const pageId = body.pageId;
  const visitorId = typeof body.visitorId === "string" && body.visitorId.trim() ? body.visitorId : "anonymous";

  const [page] = await db
    .select({ orgId: landingPages.orgId })
    .from(landingPages)
    .where(eq(landingPages.id, pageId))
    .limit(1);

  if (!page) {
    return NextResponse.json({ ok: true, matched: false });
  }

  await emitSeldonEvent("landing.visited", { pageId, visitorId }, { orgId: page.orgId });
  await dispatchWebhook({
    orgId: page.orgId,
    event: "landing.visited",
    payload: { pageId, visitorId },
  });

  return NextResponse.json({ ok: true, matched: true });
}
