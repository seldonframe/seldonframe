import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { soulSources } from "@/db/schema";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { ingestSource } from "@/lib/soul-wiki/ingest";
import { compileSoulWiki } from "@/lib/soul-wiki/compile";

type IngestType = "url" | "youtube" | "text" | "testimonial";

const MAX_SOURCES_PER_ORG = 500;
const MAX_TEXT_LENGTH = 100_000;
const MAX_TITLE_LENGTH = 200;

function isValidIngestType(value: string): value is IngestType {
  return value === "url" || value === "youtube" || value === "text" || value === "testimonial";
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export async function POST(req: Request) {
  if (isDemoReadonly()) {
    return demoApiBlockedResponse();
  }

  assertWritable();

  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    type?: string;
    url?: string;
    text?: string;
    title?: string;
  };

  const typeRaw = String(body.type ?? "").trim();
  const type = typeRaw as IngestType;
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE_LENGTH) : "";

  if (!typeRaw) {
    return NextResponse.json({ error: "type is required" }, { status: 400 });
  }

  if (!isValidIngestType(type)) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  if ((type === "url" || type === "youtube") && !url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  if ((type === "url" || type === "youtube") && !isHttpUrl(url)) {
    return NextResponse.json({ error: "url must start with http:// or https://" }, { status: 400 });
  }

  if ((type === "text" || type === "testimonial") && !text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const [sourceCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(soulSources)
    .where(eq(soulSources.orgId, session.user.orgId));

  if (Number(sourceCount?.count ?? 0) >= MAX_SOURCES_PER_ORG) {
    return NextResponse.json({ error: `source limit reached (${MAX_SOURCES_PER_ORG})` }, { status: 400 });
  }

  let extractedTitle = "";
  let rawContent = "";
  let metadata: Record<string, unknown> = {};

  try {
    const ingested = await ingestSource(session.user.orgId, {
      type,
      ...(url ? { url } : {}),
      ...(text ? { text } : {}),
      ...(title ? { title } : {}),
    });

    extractedTitle = ingested.title;
    rawContent = ingested.rawContent;
    metadata = ingested.metadata;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to ingest source";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const [source] = await db
    .insert(soulSources)
    .values({
      orgId: session.user.orgId,
      type,
      title: title || extractedTitle,
      sourceUrl: url || null,
      rawContent,
      metadata,
      status: "pending",
    })
    .returning();

  void compileSoulWiki(session.user.orgId).catch(() => {
    return;
  });

  return NextResponse.json({ success: true, source });
}
