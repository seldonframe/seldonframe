// Email-agent slice (Part A1) — sent-mail voice-profile ingestion.
//
// Fetches the operator's last-50 sent emails via the org's Composio Gmail
// binding, distills them into a compact style profile (ONE LLM call — never
// full bodies), and upserts it as a Brain note at `voice-profiles/email.md`.
// Consumed by email-channel turns (Part A2) as a "write in the operator's
// voice" prompt section.
//
// DI'd + fail-soft throughout (mirrors composio-calendar-backend.ts): every
// I/O is injected so this runs offline in tests, and every failure path
// returns a typed `{ok:false, reason}` — this function NEVER throws. Privacy
// posture: only `{subject, snippet}` ever leaves Gmail, and snippets are
// truncated to <=500 chars before they reach `distill` — full bodies are
// never fetched or stored.

export type SentEmailSample = {
  subject: string;
  snippet: string;
};

export type VoiceIngestDeps = {
  /** Execute a Composio Gmail action for this org (the real impl is
   *  defaultComposioWrapDeps().executeTool). Throws when Gmail isn't
   *  connected / the call fails — every throw is handled below. */
  callTool: (slug: string, args: Record<string, unknown>) => Promise<unknown>;
  /** ONE LLM call that distills the sample emails into a markdown style
   *  profile (tone, openings/closings, sentence length, dos/don'ts, 2-3 tiny
   *  fragments). Never receives full email bodies — only truncated snippets. */
  distill: (emails: SentEmailSample[]) => Promise<string>;
  /** Upsert the Brain note (prod = writeBrainNote at voice-profiles/email.md). */
  writeNote: (
    path: string,
    body: string,
    metadata: Record<string, unknown>,
  ) => Promise<void>;
  log?: (event: string, data: Record<string, unknown>) => void;
};

export type VoiceIngestResult =
  | { ok: true; notePath: string }
  | { ok: false; reason: string };

/** The fixed Brain note path every email-channel turn reads by exact path. */
export const VOICE_PROFILE_NOTE_PATH = "voice-profiles/email.md";

/** Cap on the number of sent emails sampled per ingestion run. */
const MAX_SAMPLES = 50;

/** Privacy cap: no snippet leaves this function longer than this. */
const SNIPPET_MAX_CHARS = 500;

/** Best-effort detection of a "Gmail isn't connected for this workspace" error
 *  from callTool's thrown message (mirrors the message defaultComposioWrapDeps
 *  throws for a missing Composio key / unconnected toolkit). Anything else is
 *  treated as a generic fetch failure. */
function isNoGmailError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not configured|no api key|not connected/i.test(msg);
}

/** Pull an array of message-like objects out of a few plausible Composio
 *  GMAIL_FETCH_EMAILS response shapes. Mirrors extractFreeWindows' defensive
 *  parsing (composio-calendar-backend.ts) — returns [] for anything
 *  unrecognized rather than throwing. */
function extractMessages(res: unknown): Array<Record<string, unknown>> {
  const data = (res as { data?: unknown } | null | undefined)?.data ?? res;
  if (!data || typeof data !== "object") return [];
  const candidates: unknown[] = [
    (data as Record<string, unknown>).messages,
    (data as Record<string, unknown>).items,
    (data as Record<string, unknown>).emails,
    (data as Record<string, unknown>).results,
  ];
  const raw = candidates.find((c) => Array.isArray(c)) as unknown[] | undefined;
  if (!raw) return [];
  return raw.filter(
    (m): m is Record<string, unknown> => Boolean(m) && typeof m === "object",
  );
}

/** Map raw Composio message objects to the privacy-safe sample shape,
 *  truncating the snippet/body to SNIPPET_MAX_CHARS. Tolerates a few
 *  plausible field names (snippet / body / preview). */
function toSample(raw: Record<string, unknown>): SentEmailSample {
  const subject = typeof raw.subject === "string" ? raw.subject : "";
  const rawSnippet =
    (typeof raw.snippet === "string" && raw.snippet) ||
    (typeof raw.body === "string" && raw.body) ||
    (typeof raw.preview === "string" && raw.preview) ||
    "";
  const snippet =
    rawSnippet.length > SNIPPET_MAX_CHARS
      ? rawSnippet.slice(0, SNIPPET_MAX_CHARS)
      : rawSnippet;
  return { subject, snippet };
}

/**
 * Ingest the operator's sent-mail voice into a Brain note. Fail-soft
 * end-to-end: no Gmail binding, an empty inbox, an LLM error, or a write
 * error all return a typed `{ok:false, reason}` — this NEVER throws.
 */
export async function ingestSentMailVoiceProfile(
  deps: VoiceIngestDeps,
  args: { orgId: string },
): Promise<VoiceIngestResult> {
  const log = deps.log ?? (() => {});

  let res: unknown;
  try {
    res = await deps.callTool("GMAIL_FETCH_EMAILS", {
      query: "in:sent",
      max_results: MAX_SAMPLES,
    });
  } catch (err) {
    const reason = isNoGmailError(err) ? "no_gmail" : "fetch_failed";
    log("voice_ingest.fetch_failed", {
      orgId: args.orgId,
      reason,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason };
  }

  const messages = extractMessages(res);
  if (messages.length === 0) {
    return { ok: false, reason: "no_sent_mail" };
  }

  const samples = messages.slice(0, MAX_SAMPLES).map(toSample);

  let profile: string;
  try {
    profile = await deps.distill(samples);
  } catch (err) {
    log("voice_ingest.distill_failed", {
      orgId: args.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "distill_failed" };
  }

  const source = `ingestion:sent-mail:${new Date().toISOString().slice(0, 10)}`;
  try {
    await deps.writeNote(VOICE_PROFILE_NOTE_PATH, profile, {
      type: "voice-profile",
      source,
    });
  } catch (err) {
    log("voice_ingest.write_failed", {
      orgId: args.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "write_failed" };
  }

  return { ok: true, notePath: VOICE_PROFILE_NOTE_PATH };
}
