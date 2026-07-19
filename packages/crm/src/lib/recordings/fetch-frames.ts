// Fetches a recording's keyframe blobs and base64-encodes them for the
// trace compiler. Re-validates host+prefix even though the URLs were
// already validated at write time (recording/route.ts's
// isValidRecordingBlobUrl) — defense in depth: this is the read path that
// feeds bytes into an LLM call, so it never trusts a URL merely because it
// came out of our own DB.

import { MAX_FRAMES_PER_RECORDING } from "./policy";

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const RECORDINGS_PREFIX = "recordings/";

function isAllowedFrameUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!parsed.hostname.endsWith(BLOB_HOST_SUFFIX)) {
    return false;
  }
  return parsed.pathname.replace(/^\//, "").startsWith(RECORDINGS_PREFIX);
}

/**
 * Fetches every url (capped at `opts.maxFrames`), validates each one's host
 * + `recordings/` prefix, and returns base64-encoded bodies in the same
 * order. Throws on the first disallowed URL or non-200 response — never a
 * silent partial result (Optimistic Path rule: a caller that gets back
 * fewer frames than it asked for without an error would silently compile a
 * trace off incomplete evidence).
 */
export async function fetchFramesAsBase64(
  urls: string[],
  opts?: { fetchImpl?: typeof fetch; maxFrames?: number },
): Promise<Array<{ base64: string }>> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const maxFrames = opts?.maxFrames ?? MAX_FRAMES_PER_RECORDING;
  const capped = urls.slice(0, maxFrames);

  const frames: Array<{ base64: string }> = [];
  for (const url of capped) {
    if (!isAllowedFrameUrl(url)) {
      throw new Error(`frame url not allowed: ${url}`);
    }
    const res = await fetchImpl(url);
    if (!res.ok) {
      throw new Error(`frame fetch failed (${res.status}): ${url}`);
    }
    const buf = await res.arrayBuffer();
    frames.push({ base64: Buffer.from(buf).toString("base64") });
  }
  return frames;
}
