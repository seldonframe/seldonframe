// packages/crm/src/app/(public)/record/capture-file.ts
//
// Keyframe extraction from an ALREADY-RECORDED video file (the mobile path:
// phones have no getDisplayMedia, so the operator records with the OS's
// built-in screen recorder, then uploads the file here). Complements
// capture.ts's live-capture path — same downscale/JPEG approach (reused via
// capture.ts's exported `downscaleEdge`/`grabFrame` helpers) so uploaded and
// live-recorded frames are indistinguishable to the rest of the pipeline.
//
// sampleTimestamps is pure and fully unit-tested (capture-file.spec.ts).
// extractFromVideoFile is browser-only (HTMLVideoElement/canvas) — no
// meaningful fake in node:test, same rationale as capture.ts's header
// comment; it stays thin and delegates all extraction math to
// sampleTimestamps and all pixel work to capture.ts's grabFrame.

import { downscaleEdge, grabFrame } from "./capture";

const FIRST_SAMPLE_FLOOR_MS = 500;
const DEFAULT_MIN_INTERVAL_MS = 1000;

/**
 * Spreads up to `maxFrames` timestamps evenly across `durationMs`, adaptively:
 * a short clip samples roughly once per second (via `minIntervalMs`, default
 * 1000ms) capped by `maxFrames`; a long clip instead spreads `maxFrames`
 * evenly across the whole duration so it never exceeds the cap. The first
 * sample is always >= 500ms in (skips the black/blank first frame). Pure —
 * no I/O, no browser APIs.
 */
export function sampleTimestamps(
  durationMs: number,
  maxFrames: number,
  minIntervalMs: number = DEFAULT_MIN_INTERVAL_MS,
): number[] {
  if (!Number.isFinite(durationMs) || durationMs <= FIRST_SAMPLE_FLOOR_MS) return [];
  if (!Number.isFinite(maxFrames) || maxFrames <= 0) return [];

  // How many samples would a fixed ~1/sec (or custom interval) cadence give
  // across the whole duration, starting at the floor?
  const availableMs = durationMs - FIRST_SAMPLE_FLOOR_MS;
  const intervalCount = Math.floor(availableMs / minIntervalMs) + 1;
  const count = Math.min(maxFrames, Math.max(1, intervalCount));

  if (count === 1) return [FIRST_SAMPLE_FLOOR_MS];

  // Evenly spread `count` timestamps across [FIRST_SAMPLE_FLOOR_MS, durationMs),
  // strictly ascending and strictly below durationMs.
  const span = durationMs - FIRST_SAMPLE_FLOOR_MS;
  const step = span / count;
  const timestamps: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = Math.round(FIRST_SAMPLE_FLOOR_MS + i * step);
    timestamps.push(Math.min(t, durationMs - 1));
  }
  return timestamps;
}

export type ExtractFromVideoFileOptions = {
  maxFrames: number;
  maxEdgePx: number;
  onProgress?: (done: number, total: number) => void;
};

export type ExtractFromVideoFileResult = {
  frames: Blob[];
  durationMs: number;
};

const SEEK_TIMEOUT_MS = 5000;

/** Seeks `video` to `timeMs` and waits for the 'seeked' event, with a 5s
 *  timeout that resolves false (rather than hanging forever) if the browser
 *  never fires it for that timestamp — the caller skips that frame. */
function seekTo(video: HTMLVideoElement, timeMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", onSeeked);
      resolve(false);
    }, SEEK_TIMEOUT_MS);

    function onSeeked() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      resolve(true);
    }

    video.addEventListener("seeked", onSeeked);
    video.currentTime = timeMs / 1000;
  });
}

/**
 * Extracts up to `opts.maxFrames` downscaled JPEG keyframes from an uploaded
 * video file, by seeking a hidden <video> element to each of
 * `sampleTimestamps()`'s timestamps and grabbing a canvas frame. Browser-only
 * — not unit tested (see header comment).
 */
export async function extractFromVideoFile(
  file: File,
  opts: ExtractFromVideoFileOptions,
): Promise<ExtractFromVideoFileResult> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("video_metadata_load_failed")), {
        once: true,
      });
    });

    const durationMs = Math.round((video.duration || 0) * 1000);
    const timestamps = sampleTimestamps(durationMs, opts.maxFrames);
    const frames: Blob[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const ok = await seekTo(video, timestamps[i]!);
      if (ok) {
        const blob = await grabFrame(video, opts.maxEdgePx);
        if (blob) frames.push(blob);
      }
      opts.onProgress?.(i + 1, timestamps.length);
    }

    return { frames, durationMs };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// Re-exported for callers that want the shared downscale math without
// reaching into capture.ts directly.
export { downscaleEdge };
