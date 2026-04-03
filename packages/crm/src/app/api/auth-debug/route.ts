import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  // Check env vars
  const googleId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const authSecret = process.env.AUTH_SECRET?.trim();
  const nextauthSecret = process.env.NEXTAUTH_SECRET?.trim();
  const resendKey = (process.env.AUTH_RESEND_KEY ?? process.env.RESEND_API_KEY)?.trim();

  // Check if critical tables exist
  const tablesExist: Record<string, boolean> = {};
  for (const table of ["users", "accounts", "sessions", "verification_tokens", "organizations"]) {
    try {
      await db.execute(sql.raw(`SELECT 1 FROM ${table} LIMIT 1`));
      tablesExist[table] = true;
    } catch {
      tablesExist[table] = false;
    }
  }

  // Check provider initialization
  const providersWouldLoad: string[] = [];
  if (googleId && googleSecret) providersWouldLoad.push("google");
  if (resendKey) providersWouldLoad.push("resend");

  return Response.json({
    env: {
      GOOGLE_CLIENT_ID: googleId ? googleId.slice(0, 20) + "..." : "NOT SET",
      GOOGLE_CLIENT_SECRET: googleSecret ? "SET (length " + googleSecret.length + ")" : "NOT SET",
      AUTH_SECRET: authSecret ? "SET (length " + authSecret.length + ")" : "NOT SET",
      NEXTAUTH_SECRET: nextauthSecret ? "SET (length " + nextauthSecret.length + ")" : "NOT SET",
      AUTH_URL: process.env.AUTH_URL || "NOT SET",
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || "NOT SET",
      VERCEL_URL: process.env.VERCEL_URL || "NOT SET",
      AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST || "NOT SET",
      RESEND_KEY: resendKey ? "SET" : "NOT SET",
    },
    providers_that_would_load: providersWouldLoad.length > 0
      ? providersWouldLoad
      : "NONE — THIS IS WHY AUTH FAILS",
    database_tables: tablesExist,
    diagnosis: (() => {
      const issues: string[] = [];
      if (!googleId) issues.push("GOOGLE_CLIENT_ID is missing");
      if (!googleSecret) issues.push("GOOGLE_CLIENT_SECRET is missing");
      if (!authSecret && !nextauthSecret) issues.push("AUTH_SECRET AND NEXTAUTH_SECRET both missing — auth cannot work");
      if (providersWouldLoad.length === 0) issues.push("No providers would load — auth shows Configuration error");
      if (!tablesExist.accounts) issues.push("accounts table missing in database");
      if (!tablesExist.sessions) issues.push("sessions table missing in database");
      if (!tablesExist.verification_tokens) issues.push("verification_tokens table missing in database");
      if (process.env.AUTH_URL === "http://localhost:3000" || process.env.NEXTAUTH_URL === "http://localhost:3000") {
        issues.push("AUTH_URL or NEXTAUTH_URL set to localhost — callbacks will fail in production");
      }
      return issues.length > 0 ? issues : ["No obvious issues found — check Vercel logs for runtime errors"];
    })(),
  });
}
