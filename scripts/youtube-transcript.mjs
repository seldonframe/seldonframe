#!/usr/bin/env node
// youtube-transcript.mjs — the "information-gain" sourcing helper.
//
// Pulls a YouTube video's transcript to plain text so a content loop can mine
// ORIGINAL source material (founder stories, real numbers, failures) that
// exists nowhere else in writing — the non-commodity content Google's helpful-
// content system rewards. Used by the `information-gain` skill (see
// .claude/skills/information-gain/SKILL.md).
//
// USAGE:
//   node scripts/youtube-transcript.mjs <youtube-url-or-id> [--json]
//
// It prints the transcript to stdout (plain text by default; `--json` emits
// { videoId, url, ok, chars, transcript }). NON-ZERO exit + a clear stderr
// line when no transcript can be extracted — the caller must treat a failure
// as "no source brief", never invent one (never-lies).
//
// SOURCES (tried in order, fail-soft):
//   1. youtubetranscript.com  — the same programmatic endpoint the Soul-wiki
//      ingester already uses (packages/crm/src/lib/soul-wiki/ingest.ts); returns
//      caption XML we parse to text. Works headless, no key.
//   2. video timedtext API    — YouTube's own caption track, when public.
// If BOTH fail (captions disabled / region-locked), the video needs the manual
// route: paste the URL into https://notegpt.io/youtube-transcript-generator
// (a browser tool — it drives the player, so it isn't scriptable here) and save
// the text next to the article. The script says so explicitly rather than
// returning a fake transcript.

const TIMEOUT_MS = 20_000;

/** Parse an 11-char YouTube id out of any watch/share/embed URL, or accept a
 *  bare id. Returns "" when nothing id-shaped is present. */
export function extractYouTubeId(input) {
  if (typeof input !== "string") return "";
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/|\/v\/)([\w-]{11})/);
  return m ? m[1] : "";
}

/** Known "we couldn't get captions" bodies that transcript services return as
 *  HTTP 200 — treat these as FAILURE, never as a transcript (never-lies: a
 *  non-empty body is not the same as a real transcript). */
const ERROR_SENTINELS = [
  "youtube is currently blocking",
  "we're sorry",
  "we are sorry",
  "preventing us from",
  "could not be extracted",
  "no transcript",
  "no subtitles",
  "transcript is disabled",
  "sign in to confirm",
];

/** A response counts as a real transcript only if it's substantive AND doesn't
 *  match a known service-error body. */
function isRealTranscript(text) {
  if (!text || text.trim().length < 40) return false;
  const low = text.toLowerCase();
  return !ERROR_SENTINELS.some((s) => low.includes(s));
}

function decodeEntities(t) {
  return t
    .replace(/&amp;#39;|&#39;/g, "'")
    .replace(/&amp;quot;|&quot;/g, '"')
    .replace(/&amp;amp;|&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, "")
    .trim();
}

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; SeldonFrame-InfoGain/1.0)" },
    });
  } finally {
    clearTimeout(t);
  }
}

/** youtubetranscript.com → caption XML → text. "" on any failure. */
async function fromYoutubeTranscriptCom(videoId) {
  try {
    const res = await fetchWithTimeout(`https://youtubetranscript.com/?server_vid2=${videoId}`);
    if (!res.ok) return "";
    const xml = await res.text();
    const nodes = xml.match(/<text[^>]*>([\s\S]*?)<\/text>/g);
    if (!nodes) return "";
    const text = nodes.map((n) => decodeEntities(n.replace(/<text[^>]*>/, "").replace(/<\/text>/, ""))).join(" ").trim();
    return isRealTranscript(text) ? text : "";
  } catch {
    return "";
  }
}

/** YouTube's own public timedtext track → text. "" on any failure. */
async function fromTimedText(videoId) {
  try {
    const res = await fetchWithTimeout(
      `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}`,
    );
    if (!res.ok) return "";
    const xml = await res.text();
    const nodes = xml.match(/<text[^>]*>([\s\S]*?)<\/text>/g);
    if (!nodes) return "";
    const text = nodes.map((n) => decodeEntities(n.replace(/<text[^>]*>/, "").replace(/<\/text>/, ""))).join(" ").trim();
    return isRealTranscript(text) ? text : "";
  } catch {
    return "";
  }
}

/** Resolve a transcript for a URL/id. { ok, videoId, url, transcript }. */
export async function getTranscript(urlOrId) {
  const videoId = extractYouTubeId(urlOrId);
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  if (!videoId) return { ok: false, videoId: "", url: "", transcript: "" };
  for (const source of [fromYoutubeTranscriptCom, fromTimedText]) {
    const text = await source(videoId);
    if (text && text.length > 0) return { ok: true, videoId, url, transcript: text };
  }
  return { ok: false, videoId, url, transcript: "" };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// import.meta.main is not universal; guard on argv instead.
const invokedDirectly = process.argv[1] && process.argv[1].endsWith("youtube-transcript.mjs");
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) {
    process.stderr.write("usage: node scripts/youtube-transcript.mjs <youtube-url-or-id> [--json]\n");
    process.exit(2);
  }
  const result = await getTranscript(target);
  if (!result.ok) {
    process.stderr.write(
      `[no-transcript] ${result.videoId || target} — captions unavailable via the programmatic sources. ` +
        `Manual route: paste ${result.url || target} into https://notegpt.io/youtube-transcript-generator and save the text. ` +
        `Do NOT fabricate a transcript.\n`,
    );
    process.exit(1);
  }
  if (asJson) {
    process.stdout.write(
      JSON.stringify({ videoId: result.videoId, url: result.url, ok: true, chars: result.transcript.length, transcript: result.transcript }) + "\n",
    );
  } else {
    process.stdout.write(result.transcript + "\n");
  }
}
