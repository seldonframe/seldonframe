import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { soulWiki } from "@/db/schema";
import { compileSoulWiki } from "@/lib/soul-wiki/compile";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const articles = await db
    .select()
    .from(soulWiki)
    .where(eq(soulWiki.orgId, session.user.orgId));

  return NextResponse.json(articles);
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  void compileSoulWiki(session.user.orgId).catch(() => {
    return;
  });

  return NextResponse.json({ success: true, message: "Recompilation started" });
}
