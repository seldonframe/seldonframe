import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  const results: Record<string, unknown> = {};

  // Check AUTH_SECRET
  const rawSecret = process.env.AUTH_SECRET ?? "(not set)";
  results.authSecret = {
    length: rawSecret.length,
    lastFiveChars: rawSecret.slice(-5).split("").map((c) => `${c}(${c.charCodeAt(0)})`),
    startsWithQuote: rawSecret.startsWith('"'),
    endsWithQuote: rawSecret.endsWith('"'),
    containsBackslash: rawSecret.includes("\\"),
    containsLiteralRN: rawSecret.includes("\\r\\n"),
    trimmedLength: rawSecret.trim().length,
  };

  // Check NEXTAUTH_SECRET
  const rawNextSecret = process.env.NEXTAUTH_SECRET ?? "(not set)";
  results.nextauthSecret = {
    length: rawNextSecret.length,
    lastFiveChars: rawNextSecret.slice(-5).split("").map((c) => `${c}(${c.charCodeAt(0)})`),
  };

  // Check DATABASE_URL
  const rawDbUrl = process.env.DATABASE_URL ?? "(not set)";
  results.databaseUrl = {
    length: rawDbUrl.length,
    lastTenChars: rawDbUrl.slice(-10).split("").map((c) => `${c}(${c.charCodeAt(0)})`),
    containsLiteralRN: rawDbUrl.includes("\\r\\n"),
  };

  // Test DB connection
  try {
    const row = await db.execute(sql`SELECT 1 as ok`);
    results.dbConnection = { status: "ok", rows: row.rows?.length ?? 0 };
  } catch (err) {
    results.dbConnection = { status: "error", message: String(err) };
  }

  // Check other relevant env vars
  results.googleClientId = process.env.GOOGLE_CLIENT_ID ? `set (${process.env.GOOGLE_CLIENT_ID.length} chars)` : "NOT SET";
  results.googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ? `set (${process.env.GOOGLE_CLIENT_SECRET.length} chars)` : "NOT SET";
  results.nextauthUrl = process.env.NEXTAUTH_URL ?? "(not set)";
  results.authUrl = process.env.AUTH_URL ?? "(not set)";
  results.vercelEnv = process.env.VERCEL ?? "(not set)";
  results.nodeEnv = process.env.NODE_ENV ?? "(not set)";

  return NextResponse.json(results, { status: 200 });
}
