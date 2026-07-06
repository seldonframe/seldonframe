/**
 * Reference-aware garbage collection of orphaned `seldonchat/*` Vercel Blob
 * uploads (SeldonChat attach/drag uploads that were never applied, or
 * applied-then-replaced). See
 * docs/superpowers/specs/2026-07-06-media-t5-and-blob-gc-design.md for the
 * full design and the safety rationale.
 *
 * Two-layer safety: a blob is deleted only if it is BOTH old (past the TTL,
 * protecting the upload -> apply race window) AND unreferenced by any live
 * blueprint or version snapshot (protecting revert history — applied videos
 * are stored inline in blueprint_json / landing_payload_versions.payload
 * rather than being re-hosted like images).
 *
 * This module is intentionally DI-free of I/O: no @vercel/blob or @/db
 * imports here. The orchestrator (`runSeldonchatBlobGc`) takes its
 * dependencies as plain async functions so it can be unit tested without a
 * network or database, and its real wiring lives in the cron route.
 */

export type SeldonchatBlob = {
  url: string;
  pathname: string;
  uploadedAt: Date;
};

const URL_REGEX = /https?:\/\/[^\s"'\\)]+/g;

/**
 * Extracts every URL referenced anywhere inside a set of JSON payloads
 * (blueprint_json rows and landing_payload_versions.payload snapshots).
 * Each payload is stringified and scanned with a URL regex so we don't need
 * to know the exact shape of every media field (hero background image/video,
 * service photos, etc.) — any URL anywhere in the JSON counts as "referenced".
 */
export function collectReferencedBlobUrls(jsonPayloads: unknown[]): Set<string> {
  const referenced = new Set<string>();
  for (const payload of jsonPayloads) {
    if (payload === null || payload === undefined) continue;
    const serialized = JSON.stringify(payload);
    if (!serialized) continue;
    const matches = serialized.match(URL_REGEX);
    if (!matches) continue;
    for (const match of matches) {
      referenced.add(match);
    }
  }
  return referenced;
}

export type SelectOrphanBlobsResult = {
  toDelete: SeldonchatBlob[];
  keptFresh: SeldonchatBlob[];
  keptReferenced: SeldonchatBlob[];
};

/**
 * Pure, deterministic decision: bucket each candidate blob into toDelete /
 * keptFresh / keptReferenced. A blob is REFERENCED if its exact URL is in the
 * referenced set, OR (defensive substring pass) some referenced URL includes
 * the blob's pathname — this protects variants with a query string or
 * download-suffix appended to the same underlying path.
 *
 * Referenced takes priority over freshness in the bucketing: a referenced
 * blob always lands in keptReferenced regardless of age, for clarity in the
 * audit log.
 */
export function selectOrphanBlobs(
  blobs: SeldonchatBlob[],
  referenced: Set<string>,
  now: Date,
  ttlMs: number
): SelectOrphanBlobsResult {
  const toDelete: SeldonchatBlob[] = [];
  const keptFresh: SeldonchatBlob[] = [];
  const keptReferenced: SeldonchatBlob[] = [];

  for (const blob of blobs) {
    const isReferenced =
      referenced.has(blob.url) ||
      Array.from(referenced).some((refUrl) => refUrl.includes(blob.pathname));

    if (isReferenced) {
      keptReferenced.push(blob);
      continue;
    }

    const age = now.getTime() - blob.uploadedAt.getTime();
    if (age >= ttlMs) {
      toDelete.push(blob);
    } else {
      keptFresh.push(blob);
    }
  }

  return { toDelete, keptFresh, keptReferenced };
}

export type ListSeldonchatBlobsResult = {
  blobs: SeldonchatBlob[];
  cursor?: string;
  hasMore: boolean;
};

export type SeldonchatBlobGcDeps = {
  listSeldonchatBlobs: (cursor?: string) => Promise<ListSeldonchatBlobsResult>;
  collectReferenced: () => Promise<Set<string>>;
  delBlobs: (urls: string[]) => Promise<void>;
  now: () => Date;
};

export type SeldonchatBlobGcOptions = {
  ttlMs: number;
  dryRun: boolean;
  maxDeletions: number;
};

export type SeldonchatBlobGcSummary = {
  event: "seldonchat_blob_gc";
  at: string;
  scanned: number;
  referenced_count: number;
  to_delete: number;
  deleted: number;
  kept_fresh: number;
  kept_referenced: number;
  dry_run: boolean;
  capped: boolean;
};

/**
 * Orchestrates a full GC pass: paginate every seldonchat/* blob, build the
 * referenced-URL set from live DB rows, apply the pure selection, then
 * (unless dryRun) delete the orphans in one batch — capped at maxDeletions
 * as a runaway backstop. Emits JSON audit log lines so a run is easy to grep
 * in Vercel logs.
 */
export async function runSeldonchatBlobGc(
  deps: SeldonchatBlobGcDeps,
  opts: SeldonchatBlobGcOptions
): Promise<SeldonchatBlobGcSummary> {
  const allBlobs: SeldonchatBlob[] = [];
  let cursor: string | undefined = undefined;
  for (;;) {
    const page = await deps.listSeldonchatBlobs(cursor);
    allBlobs.push(...page.blobs);
    if (!page.hasMore) break;
    cursor = page.cursor;
  }

  const referenced = await deps.collectReferenced();
  const now = deps.now();
  const { toDelete, keptFresh, keptReferenced } = selectOrphanBlobs(
    allBlobs,
    referenced,
    now,
    opts.ttlMs
  );

  const capped = toDelete.length > opts.maxDeletions;
  const toDeleteCapped = capped ? toDelete.slice(0, opts.maxDeletions) : toDelete;

  let deleted = 0;
  if (!opts.dryRun && toDeleteCapped.length > 0) {
    try {
      await deps.delBlobs(toDeleteCapped.map((b) => b.url));
      deleted = toDeleteCapped.length;
      const cutoff = new Date(now.getTime() - opts.ttlMs).toISOString();
      for (const blob of toDeleteCapped) {
        console.log(
          JSON.stringify({
            event: "seldonchat_blob_deleted",
            pathname: blob.pathname,
            uploaded_at: blob.uploadedAt.toISOString(),
            cutoff,
          })
        );
      }
    } catch (err) {
      console.warn(
        `[gc-seldonchat-blobs] delBlobs failed (best-effort, non-fatal): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  const summary: SeldonchatBlobGcSummary = {
    event: "seldonchat_blob_gc",
    at: now.toISOString(),
    scanned: allBlobs.length,
    referenced_count: referenced.size,
    to_delete: toDeleteCapped.length,
    deleted,
    kept_fresh: keptFresh.length,
    kept_referenced: keptReferenced.length,
    dry_run: opts.dryRun,
    capped,
  };

  console.log(JSON.stringify(summary));

  return summary;
}
