// ============================================================================
// v1.41.0 — Pexels video resolver for the cinematic-landing fat skill.
// ============================================================================
//
// One call inside enhance-blocks.ts when the chosen archetype wants a
// cinematic-aura hero. Returns the best looping-friendly HD MP4 plus
// photographer attribution (Pexels licence requires the credit, even
// though it's CC-style permissive — we render it as a small bottom-right
// "Video by NAME on Pexels" pill).
//
// SOFT-FAIL EVERYWHERE: if PEXELS_API_KEY is unset, if the network errors,
// if the search returns 0 results — return null. The hero-cinematic-aura
// renderer treats a missing video as a branded-gradient empty state that
// still looks intentional. We never break the workspace over a missing
// background video.
//
// COST: free tier — 200 req/hour, 20k/month. We call this exactly once
// per workspace creation (the resolved URL persists inline in the hero
// section's JSONB, so subsequent renders re-use the same CDN URL forever).
// At our current scale that's ~50 workspaces/day → 1.5k/month, well inside
// the free tier with order-of-magnitude headroom.

const PEXELS_VIDEO_SEARCH_URL = "https://api.pexels.com/videos/search";

/** Photographer attribution payload mirrored on the hero section JSONB. */
export type PexelsVideoAttribution = {
  /** Photographer's display name as Pexels returned it. */
  photographer_name: string;
  /** Photographer's Pexels profile URL. */
  photographer_url: string;
  /** Pexels video page URL — required by their attribution guidelines. */
  source_url: string;
  /** Pexels video ID, useful for debugging + dedupe. */
  video_id: number;
};

/** Resolved cinematic background video ready to drop into the hero JSONB. */
export type ResolvedPexelsVideo = {
  /** Direct MP4 URL. Pexels serves these from their own CDN with no auth. */
  url: string;
  /** Poster frame (still image) — used as the <video poster> for fast first paint. */
  poster_url: string;
  /** Photographer credit + back-link. */
  attribution: PexelsVideoAttribution;
  /** Duration in seconds. Used by the FadingVideo component to time its
   *  crossfade (we fade out 0.55s before the end). */
  duration: number;
};

type PexelsVideoFile = {
  id: number;
  quality: "hd" | "sd" | "hls" | string;
  file_type: string;
  width: number;
  height: number;
  link: string;
};

type PexelsVideoResult = {
  id: number;
  duration: number;
  width: number;
  height: number;
  image: string;
  url: string;
  user: { name: string; url: string };
  video_files: PexelsVideoFile[];
};

type PexelsSearchResponse = {
  videos?: PexelsVideoResult[];
};

/**
 * Search Pexels for a cinematic background video matching the query.
 * Picks the closest HD landscape MP4 ≤1080p and ≤30s long.
 *
 * Returns null on missing API key, network/HTTP errors, or empty results.
 * Callers should treat null as "no video available — fall back to the
 * branded gradient" and continue without failing.
 */
export async function searchPexelsVideo(
  query: string,
  opts: {
    orientation?: "landscape" | "portrait" | "square";
    /** Pexels size buckets — "medium" caps around 1080p which is what we
     *  want for a hero background. "large" goes up to 4K which is wasteful. */
    size?: "medium" | "small" | "large";
  } = {},
): Promise<ResolvedPexelsVideo | null> {
  const cleanedQuery = query?.trim();
  if (!cleanedQuery) return null;

  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) {
    // Silent — same pattern as resolveHeroImage. Operators may not have
    // set the key yet, and the hero still renders fine without it.
    return null;
  }

  const params = new URLSearchParams({
    query: cleanedQuery,
    orientation: opts.orientation ?? "landscape",
    size: opts.size ?? "medium",
    per_page: "15",
  });

  try {
    const res = await fetch(`${PEXELS_VIDEO_SEARCH_URL}?${params.toString()}`, {
      headers: { Authorization: apiKey },
      // Pexels recommends caching; Next 16 fetch caches by default for
      // server-side calls. We're fine with day-stale results since the
      // resolved URL persists into the hero JSONB anyway.
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      console.warn(
        JSON.stringify({
          event: "pexels_api_http_error",
          query: cleanedQuery,
          status: res.status,
        }),
      );
      return null;
    }

    const data = (await res.json()) as PexelsSearchResponse;
    const videos = data.videos ?? [];
    if (videos.length === 0) {
      console.warn(
        JSON.stringify({ event: "pexels_api_zero_results", query: cleanedQuery }),
      );
      return null;
    }

    const picked = pickBestVideo(videos);
    if (!picked) return null;

    const bestFile = pickBestVideoFile(picked.video_files);
    if (!bestFile) return null;

    return {
      url: bestFile.link,
      poster_url: picked.image,
      duration: picked.duration,
      attribution: {
        photographer_name: picked.user?.name ?? "Pexels",
        photographer_url: picked.user?.url ?? "https://www.pexels.com",
        source_url: picked.url,
        video_id: picked.id,
      },
    };
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "pexels_api_throw",
        query: cleanedQuery,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

/**
 * Among the search results, prefer videos that are:
 *   1. Landscape (width > height)
 *   2. Reasonably short (≤30s — loops better, smaller payload)
 *   3. Have at least one HD MP4 file
 *
 * Falls back to the first result if no candidate matches strictly, so
 * we always return *something* when Pexels returned any results at all.
 */
function pickBestVideo(videos: PexelsVideoResult[]): PexelsVideoResult | null {
  const scored = videos
    .map((v) => {
      let score = 0;
      if (v.width > v.height) score += 3; // landscape preferred
      if (v.duration <= 30) score += 2; // short loops well
      if (v.duration >= 6 && v.duration <= 20) score += 1; // sweet spot
      if (v.video_files.some((f) => f.quality === "hd" && f.file_type === "video/mp4")) {
        score += 2;
      }
      return { v, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.v ?? null;
}

/**
 * Pick the best MP4 file from a video's variants. Targets ≤1920x1080 HD;
 * avoids 4K (oversized for a web hero) and HLS (not all browsers).
 */
function pickBestVideoFile(files: PexelsVideoFile[]): PexelsVideoFile | null {
  const mp4s = files.filter((f) => f.file_type === "video/mp4");
  if (mp4s.length === 0) return null;

  // Prefer HD ≤1080p, then SD, then anything mp4.
  const hdSubFullHD = mp4s.filter(
    (f) => f.quality === "hd" && f.width <= 1920 && f.height <= 1080,
  );
  if (hdSubFullHD.length > 0) {
    return hdSubFullHD.sort((a, b) => b.width - a.width)[0];
  }

  const anyHd = mp4s.filter((f) => f.quality === "hd");
  if (anyHd.length > 0) {
    // Pick the smallest HD to stay under 1080p budget.
    return anyHd.sort((a, b) => a.width - b.width)[0];
  }

  const sd = mp4s.filter((f) => f.quality === "sd");
  if (sd.length > 0) return sd.sort((a, b) => b.width - a.width)[0];

  return mp4s[0];
}
