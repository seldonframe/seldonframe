// Server-side transcription of an uploaded recording's video via OpenAI's
// Whisper API. The typed-summary transcript segment stays the fallback: this
// is best-effort enrichment, never a hard dependency of the compile-trace
// flow (see the fail-soft wiring in app/api/v1/recordings/compile-trace).
//
// Re-validates the video URL's host suffix even though it was already
// validated at write time (recording/route.ts's isValidRecordingBlobUrl) —
// same defense-in-depth posture as fetch-frames.ts: this is a read path that
// fetches a remote body, so it never trusts a URL merely because it came out
// of our own DB. Unlike fetch-frames (which only ever sees blob URLs we
// wrote), the sessionId is required here so the prefix check is exact, not
// merely "some session's recordings/" — never fetch an arbitrary URL.

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

// OpenAI's audio transcription endpoint hard-caps request bodies at 25MB.
export const TRANSCRIBE_MAX_BYTES = 25 * 1024 * 1024;

function isAllowedVideoUrl(url: string, sessionId: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!parsed.hostname.endsWith(BLOB_HOST_SUFFIX)) {
    return false;
  }
  const pathname = parsed.pathname.replace(/^\//, "");
  return pathname.startsWith(`recordings/${sessionId}/`);
}

// Threshold for "this is just the typed-summary fallback, not a real
// transcript": the /record UI writes a single segment at atMs 0 holding
// whatever the operator typed when they skipped narration. Anything shorter
// than this is almost certainly a placeholder/one-liner rather than actual
// spoken narration, so it's still worth replacing with a real transcription.
const TYPED_SUMMARY_FALLBACK_MAX_CHARS = 30;

/**
 * True when `transcript` holds nothing worth compiling from: either no
 * segments at all, or exactly one segment short enough to be the typed
 * one-line summary fallback (never real spoken narration, which the /record
 * client always emits as multiple segments or one long one). Used to decide
 * whether compile-trace should attempt server-side transcription before
 * falling back to whatever's already on the row.
 */
export function isTranscriptEffectivelyEmpty(transcript: Array<{ text: string }>): boolean {
  if (transcript.length === 0) return true;
  if (transcript.length === 1) {
    return transcript[0]!.text.trim().length < TYPED_SUMMARY_FALLBACK_MAX_CHARS;
  }
  return false;
}

export type TranscribeResult =
  | { ok: true; transcript: Array<{ atMs: number; text: string }> }
  | { ok: false; error: string };

type WhisperVerboseSegment = { start: number; text: string };
type WhisperVerboseJson = {
  text?: string;
  segments?: WhisperVerboseSegment[];
};

/**
 * Fetches the recording's video, re-validates its host+prefix, enforces the
 * 25MB Whisper cap via Content-Length (never downloads an oversize body),
 * then POSTs it to OpenAI's audio transcription endpoint. Every failure path
 * — foreign host, oversize, network error, non-200 API response — returns
 * `{ ok: false }`; this NEVER throws, so callers can treat it as pure
 * best-effort enrichment.
 */
export async function transcribeVideoUrl(params: {
  videoUrl: string;
  apiKey: string;
  sessionId: string;
  fetchImpl?: typeof fetch;
}): Promise<TranscribeResult> {
  const fetchImpl = params.fetchImpl ?? fetch;

  if (!isAllowedVideoUrl(params.videoUrl, params.sessionId)) {
    return { ok: false, error: `video url not allowed: ${params.videoUrl}` };
  }

  let videoRes: Response;
  try {
    videoRes = await fetchImpl(params.videoUrl);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "video fetch failed" };
  }
  if (!videoRes.ok) {
    return { ok: false, error: `video fetch failed (${videoRes.status})` };
  }

  const contentLengthHeader = videoRes.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > TRANSCRIBE_MAX_BYTES) {
    return { ok: false, error: `video too large for transcription (${contentLength} bytes)` };
  }

  let videoBuffer: ArrayBuffer;
  try {
    videoBuffer = await videoRes.arrayBuffer();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "video body read failed" };
  }
  if (videoBuffer.byteLength > TRANSCRIBE_MAX_BYTES) {
    return { ok: false, error: `video too large for transcription (${videoBuffer.byteLength} bytes)` };
  }

  const formData = new FormData();
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  formData.append("file", new Blob([videoBuffer], { type: "video/webm" }), "recording.webm");

  let apiRes: Response;
  try {
    apiRes = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${params.apiKey}` },
      body: formData,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "transcription request failed" };
  }
  if (!apiRes.ok) {
    return { ok: false, error: `transcription API failed (${apiRes.status})` };
  }

  let json: WhisperVerboseJson;
  try {
    json = (await apiRes.json()) as WhisperVerboseJson;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "transcription response parse failed" };
  }

  if (json.segments && json.segments.length > 0) {
    return {
      ok: true,
      transcript: json.segments.map((segment) => ({
        atMs: Math.round(segment.start * 1000),
        text: segment.text,
      })),
    };
  }
  if (json.text) {
    return { ok: true, transcript: [{ atMs: 0, text: json.text }] };
  }
  return { ok: false, error: "transcription returned no text" };
}
