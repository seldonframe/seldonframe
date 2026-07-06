import { isNotNull } from "drizzle-orm";
import { del, list } from "@vercel/blob";
import { db } from "@/db";
import { landingPages, landingPayloadVersions } from "@/db/schema";
import {
  collectReferencedBlobUrls,
  runSeldonchatBlobGc,
} from "@/lib/media/gc-seldonchat-blobs";

export const runtime = "nodejs";

// Daily cron: GC orphaned seldonchat/* Vercel Blob uploads (SeldonChat
// attach/drag uploads that were never applied, or applied-then-replaced).
// See docs/superpowers/specs/2026-07-06-media-t5-and-blob-gc-design.md.
//
// Auth is FAIL-CLOSED, unlike /api/cron/orphan-workspace-ttl: this route
// deletes storage, so an unset CRON_SECRET must deny rather than allow.
// Vercel cron sends `Authorization: Bearer $CRON_SECRET`; we also accept
// `x-cron-secret` for manual/dashboard "Run now" probes.
//
// Schedule: registered in vercel.json at "30 4 * * *" (daily 04:30 UTC),
// offset from orphan-workspace-ttl (04:00) to avoid concurrent DB pressure.

let warnedMissingSecret = false;

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    if (!warnedMissingSecret) {
      console.warn(
        "[gc-seldonchat-blobs] CRON_SECRET is unset — fail-closed, denying all requests. This route deletes blob storage and must not run unauthenticated."
      );
      warnedMissingSecret = true;
    }
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${configuredSecret}`) {
    return true;
  }

  const cronHeader = request.headers.get("x-cron-secret");
  return cronHeader === configuredSecret;
}

const TTL_MS = 48 * 60 * 60 * 1000;
const MAX_DELETIONS = 1000;

function parseDryRun(request: Request): boolean {
  const url = new URL(request.url);
  const value = url.searchParams.get("dryRun");
  return value === "1" || value === "true";
}

async function collectReferenced(): Promise<Set<string>> {
  const [blueprintRows, versionRows] = await Promise.all([
    db
      .select({ b: landingPages.blueprintJson })
      .from(landingPages)
      .where(isNotNull(landingPages.blueprintJson)),
    db
      .select({ p: landingPayloadVersions.payload })
      .from(landingPayloadVersions),
  ]);

  const jsonPayloads: unknown[] = [
    ...blueprintRows.map((r) => r.b),
    ...versionRows.map((r) => r.p),
  ];

  return collectReferencedBlobUrls(jsonPayloads);
}

async function run(request: Request) {
  const dryRun = parseDryRun(request);

  return runSeldonchatBlobGc(
    {
      listSeldonchatBlobs: async (cursor?: string) => {
        const result = await list({
          prefix: "seldonchat/",
          cursor,
          limit: 1000,
        });
        return {
          blobs: result.blobs.map((b) => ({
            url: b.url,
            pathname: b.pathname,
            uploadedAt: b.uploadedAt,
          })),
          cursor: result.cursor,
          hasMore: result.hasMore,
        };
      },
      collectReferenced,
      delBlobs: async (urls: string[]) => {
        await del(urls);
      },
      now: () => new Date(),
    },
    { ttlMs: TTL_MS, dryRun, maxDeletions: MAX_DELETIONS }
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await run(request));
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await run(request));
}
