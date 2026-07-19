import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  collectReferencedBlobUrls,
  selectOrphanBlobs,
  runSeldonchatBlobGc,
  type SeldonchatBlob,
} from "@/lib/media/gc-seldonchat-blobs";

describe("collectReferencedBlobUrls", () => {
  test("extracts a URL nested in a blueprint payload (hero.backgroundVideo.src)", () => {
    const blueprint = {
      payload: {
        hero: {
          backgroundVideo: {
            src: "https://blob.vercel-storage.com/seldonchat/abc-video.mp4",
            poster: "https://blob.vercel-storage.com/media/external/poster.jpg",
          },
        },
      },
    };
    const referenced = collectReferencedBlobUrls([blueprint]);
    assert.ok(
      referenced.has("https://blob.vercel-storage.com/seldonchat/abc-video.mp4")
    );
    assert.ok(
      referenced.has("https://blob.vercel-storage.com/media/external/poster.jpg")
    );
  });

  test("extracts a URL from a version-snapshot payload", () => {
    const versionSnapshot = {
      hero: {
        backgroundImage: "https://blob.vercel-storage.com/seldonchat/xyz-photo.jpg",
      },
    };
    const referenced = collectReferencedBlobUrls([versionSnapshot]);
    assert.ok(
      referenced.has("https://blob.vercel-storage.com/seldonchat/xyz-photo.jpg")
    );
  });

  test("returns URLs from multiple payloads combined into one set", () => {
    const a = { x: "https://example.com/seldonchat/a.png" };
    const b = { y: "https://example.com/seldonchat/b.png" };
    const referenced = collectReferencedBlobUrls([a, b]);
    assert.equal(referenced.size, 2);
  });
});

describe("selectOrphanBlobs", () => {
  const now = new Date("2026-07-06T00:00:00.000Z");
  const ttlMs = 48 * 60 * 60 * 1000; // 48h
  const old = new Date(now.getTime() - 72 * 60 * 60 * 1000); // 72h old
  const fresh = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1h old

  test("orphaned + old -> toDelete", () => {
    const blob: SeldonchatBlob = {
      url: "https://blob.vercel-storage.com/seldonchat/orphan.png",
      pathname: "seldonchat/orphan.png",
      uploadedAt: old,
    };
    const referenced = new Set<string>();
    const result = selectOrphanBlobs([blob], referenced, now, ttlMs);
    assert.equal(result.toDelete.length, 1);
    assert.equal(result.toDelete[0].url, blob.url);
    assert.equal(result.keptFresh.length, 0);
    assert.equal(result.keptReferenced.length, 0);
  });

  test("referenced video URL + old -> keptReferenced", () => {
    const blob: SeldonchatBlob = {
      url: "https://blob.vercel-storage.com/seldonchat/video.mp4",
      pathname: "seldonchat/video.mp4",
      uploadedAt: old,
    };
    const referenced = new Set([blob.url]);
    const result = selectOrphanBlobs([blob], referenced, now, ttlMs);
    assert.equal(result.toDelete.length, 0);
    assert.equal(result.keptReferenced.length, 1);
    assert.equal(result.keptFresh.length, 0);
  });

  test("referenced only in a version snapshot + old -> keptReferenced", () => {
    const blob: SeldonchatBlob = {
      url: "https://blob.vercel-storage.com/seldonchat/old-snapshot-video.mp4",
      pathname: "seldonchat/old-snapshot-video.mp4",
      uploadedAt: old,
    };
    // Simulates a URL collected only from landing_payload_versions.payload
    const referenced = new Set([
      "https://blob.vercel-storage.com/seldonchat/old-snapshot-video.mp4",
    ]);
    const result = selectOrphanBlobs([blob], referenced, now, ttlMs);
    assert.equal(result.toDelete.length, 0);
    assert.equal(result.keptReferenced.length, 1);
  });

  test("unreferenced + fresh (< ttl) -> keptFresh", () => {
    const blob: SeldonchatBlob = {
      url: "https://blob.vercel-storage.com/seldonchat/just-uploaded.png",
      pathname: "seldonchat/just-uploaded.png",
      uploadedAt: fresh,
    };
    const referenced = new Set<string>();
    const result = selectOrphanBlobs([blob], referenced, now, ttlMs);
    assert.equal(result.toDelete.length, 0);
    assert.equal(result.keptFresh.length, 1);
    assert.equal(result.keptReferenced.length, 0);
  });

  test("pathname-substring match (query suffix variant) + old -> keptReferenced", () => {
    const blob: SeldonchatBlob = {
      url: "https://blob.vercel-storage.com/seldonchat/suffixed.png",
      pathname: "seldonchat/suffixed.png",
      uploadedAt: old,
    };
    // The referenced URL includes the pathname as a substring but isn't an exact match
    // (e.g. a query string or download suffix was appended).
    const referenced = new Set([
      "https://blob.vercel-storage.com/seldonchat/suffixed.png?download=1",
    ]);
    const result = selectOrphanBlobs([blob], referenced, now, ttlMs);
    assert.equal(result.toDelete.length, 0);
    assert.equal(result.keptReferenced.length, 1);
  });
});

describe("runSeldonchatBlobGc", () => {
  const now = new Date("2026-07-06T00:00:00.000Z");
  const ttlMs = 48 * 60 * 60 * 1000;
  const old = new Date(now.getTime() - 72 * 60 * 60 * 1000);

  function makeBlob(name: string, uploadedAt: Date): SeldonchatBlob {
    return {
      url: `https://blob.vercel-storage.com/seldonchat/${name}`,
      pathname: `seldonchat/${name}`,
      uploadedAt,
    };
  }

  test("dryRun=true deletes nothing but reports to_delete > 0", async () => {
    const blobs = [makeBlob("orphan1.png", old), makeBlob("orphan2.png", old)];
    let delCalls = 0;
    const summary = await runSeldonchatBlobGc(
      {
        listSeldonchatBlobs: async () => ({ blobs, hasMore: false }),
        collectReferenced: async () => new Set<string>(),
        delBlobs: async () => {
          delCalls++;
        },
        now: () => now,
      },
      { ttlMs, dryRun: true, maxDeletions: 1000 }
    );
    assert.equal(delCalls, 0);
    assert.equal(summary.to_delete, 2);
    assert.equal(summary.deleted, 0);
    assert.equal(summary.dry_run, true);
  });

  test("dryRun=false calls delBlobs with exactly the orphan URLs", async () => {
    const orphan = makeBlob("orphan.png", old);
    const referencedBlob = makeBlob("keep.png", old);
    const referenced = new Set([referencedBlob.url]);
    let capturedUrls: string[] = [];
    const summary = await runSeldonchatBlobGc(
      {
        listSeldonchatBlobs: async () => ({
          blobs: [orphan, referencedBlob],
          hasMore: false,
        }),
        collectReferenced: async () => referenced,
        delBlobs: async (urls) => {
          capturedUrls = urls;
        },
        now: () => now,
      },
      { ttlMs, dryRun: false, maxDeletions: 1000 }
    );
    assert.deepEqual(capturedUrls, [orphan.url]);
    assert.equal(summary.deleted, 1);
    assert.equal(summary.dry_run, false);
  });

  test("maxDeletions cap slices toDelete and sets capped=true", async () => {
    const blobs = [
      makeBlob("a.png", old),
      makeBlob("b.png", old),
      makeBlob("c.png", old),
    ];
    let capturedUrls: string[] = [];
    const summary = await runSeldonchatBlobGc(
      {
        listSeldonchatBlobs: async () => ({ blobs, hasMore: false }),
        collectReferenced: async () => new Set<string>(),
        delBlobs: async (urls) => {
          capturedUrls = urls;
        },
        now: () => now,
      },
      { ttlMs, dryRun: false, maxDeletions: 2 }
    );
    assert.equal(capturedUrls.length, 2);
    assert.equal(summary.deleted, 2);
    assert.equal(summary.capped, true);
    assert.equal(summary.to_delete, 2); // post-cap
    assert.equal(summary.to_delete_total, 3); // true backlog before the cap
  });

  test("pagination via cursor accumulates all blobs across two pages", async () => {
    const page1 = [makeBlob("p1.png", old)];
    const page2 = [makeBlob("p2.png", old)];
    let callCount = 0;
    const summary = await runSeldonchatBlobGc(
      {
        listSeldonchatBlobs: async (cursor?: string) => {
          callCount++;
          if (!cursor) {
            return { blobs: page1, cursor: "cursor-1", hasMore: true };
          }
          assert.equal(cursor, "cursor-1");
          return { blobs: page2, hasMore: false };
        },
        collectReferenced: async () => new Set<string>(),
        delBlobs: async () => {},
        now: () => now,
      },
      { ttlMs, dryRun: true, maxDeletions: 1000 }
    );
    assert.equal(callCount, 2);
    assert.equal(summary.scanned, 2);
    assert.equal(summary.to_delete, 2);
  });
});
