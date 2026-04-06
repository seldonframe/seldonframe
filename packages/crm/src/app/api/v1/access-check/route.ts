import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { memberships } from "@/db/schema";

type AccessCondition = "auth" | "paid" | "score" | "always";

function readScoreFromCookie(cookieHeader: string | null) {
  if (!cookieHeader) {
    return 0;
  }

  const match = cookieHeader.match(/(?:^|;\s*)sf_score=(\d+)/);
  if (!match) {
    return 0;
  }

  const score = Number(match[1]);
  return Number.isFinite(score) ? score : 0;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const condition = (searchParams.get("condition") ?? "always") as AccessCondition;
  const orgId = (searchParams.get("orgId") ?? "").trim();
  const threshold = Number(searchParams.get("threshold") ?? "0") || 0;

  const session = await auth();

  if (condition === "always") {
    return NextResponse.json({ allowed: true, reason: "always" });
  }

  if (condition === "auth") {
    const isAuthenticated = Boolean(session?.user?.id);
    return NextResponse.json({
      allowed: isAuthenticated,
      reason: isAuthenticated ? "authenticated" : "not_authenticated",
    });
  }

  if (condition === "paid") {
    if (!session?.user?.id || !orgId) {
      return NextResponse.json({ allowed: false, reason: "not_authenticated" });
    }

    try {
      const [membership] = await db
        .select({ status: memberships.status })
        .from(memberships)
        .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, session.user.id)))
        .limit(1);

      const isPaid = membership?.status === "active";
      return NextResponse.json({
        allowed: isPaid,
        reason: isPaid ? "paid_member" : "not_paid",
      });
    } catch {
      return NextResponse.json({ allowed: false, reason: "not_paid" });
    }
  }

  if (condition === "score") {
    const score = readScoreFromCookie(req.headers.get("cookie"));
    const meetsThreshold = score >= threshold;

    return NextResponse.json({
      allowed: meetsThreshold,
      score,
      threshold,
      reason: meetsThreshold ? "qualified" : "not_qualified",
    });
  }

  return NextResponse.json({ allowed: true, reason: "no_condition" });
}
