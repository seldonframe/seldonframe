// packages/crm/src/app/(public)/record/record-client.tsx
//
// Client island for the public /record page. Drives recorder-machine.ts's
// pure reducer; all I/O (session mint, capture, blob upload, compile-trace,
// interview, compile-agent) happens in handlers here, never inside the
// reducer itself.
//
// Palette: renders inside a dark-mode .lp-root (data-mode="record"), using
// the --lp-* tokens from components/landing/landing-theme.css — see that
// file's dark block for the resolved values. This component owns no page
// shell/hero of its own (Task 6's record-hero.tsx + the landing composition
// supply that); it renders only the interactive recorder surface.
//
// Session persistence across the claim redirect: the raw bearer token only
// ever exists in memory (server never re-issues it), so it's mirrored into
// localStorage the same way try-client.tsx mirrors its build seed — read
// back on return from /signup when the page loads with ?claimed=1.
"use client";

import { useEffect, useReducer, useRef, useState, type ChangeEvent } from "react";
import { upload } from "@vercel/blob/client";
import { currentStep, initialRecorderState, pickFirstEmptySlot, recorderReducer } from "./recorder-machine";
import { startCapture, type CaptureHandle } from "./capture";
import { extractFromVideoFile } from "./capture-file";
import {
  MAX_FRAME_EDGE_PX,
  MAX_FRAMES_PER_RECORDING,
  MAX_RECORDING_SECONDS,
  MAX_RECORDINGS_PER_SESSION,
} from "@/lib/recordings/policy";
// NOTE: never import lib/media/resolve-url here — its import chain reaches
// next/cache (server-only) and breaks the client bundle at next build
// (L-18). policy.ts carries the client-safe copy of the cap.
import { RECORDING_VIDEO_MAX_BYTES } from "@/lib/recordings/policy";
import {
  SHARE_CACHE_NAME,
  STAGED_RECORDING_CACHE_KEY,
} from "@/lib/recordings/share-target";
import type { CoverageEntry, FlowModel, TranscriptSegment } from "@/lib/recordings/trace-schema";
import { StepStrip } from "./record-ui/step-strip";
import { RestoredBanner } from "./record-ui/restored-banner";
import { CaptureCard } from "./record-ui/capture-card";
import { TracedList } from "./record-ui/traced-list";
import { RecapPanel } from "./record-ui/recap-panel";

const STORAGE_KEY = "sf-record-session";

type StoredSession = { sessionId: string; token: string };

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.sessionId === "string" && typeof parsed.token === "string") {
      return { sessionId: parsed.sessionId, token: parsed.token };
    }
  } catch {
    // Malformed/inaccessible storage — treat as absent.
  }
  return null;
}

function writeStoredSession(session: StoredSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Quota/permission errors — non-fatal, capture still works this tab.
  }
}

/** Drops a stale stored {sessionId, token} pair (GET /session 401/404'd —
 *  unknown token, rotated secret, or expired session) so the next mount
 *  doesn't keep retrying it and instead mints a fresh session. */
function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal — worst case the stale pair is retried and fails again.
  }
}

export function RecordClient({
  claimedSessionId,
  claimed,
  isAuthed,
  sharedFlag = null,
}: {
  claimedSessionId: string | null;
  claimed: boolean;
  isAuthed: boolean;
  /** Set from the /record?shared=... query param: "1" when record-sw.js
   *  staged a shared file in CacheStorage and redirected here, "miss" when
   *  the no-service-worker fallback route (share-target/route.ts) redirected
   *  here instead, null on an ordinary page load. */
  sharedFlag?: "1" | "miss" | null;
}) {
  const [state, dispatch] = useReducer(recorderReducer, undefined, initialRecorderState);
  const [message, setMessage] = useState<string | null>(null);
  const [sharedNotice, setSharedNotice] = useState<string | null>(null);
  const [interviewInput, setInterviewInput] = useState("");
  const [interviewPending, setInterviewPending] = useState(false);
  const [interviewError, setInterviewError] = useState<string | null>(null);
  const lastInterviewMessage = useRef<string | null>(null);
  const [fallbackText, setFallbackText] = useState<Record<number, string>>({});
  const [compiling, setCompiling] = useState(false);
  const [compiledTemplateId, setCompiledTemplateId] = useState<string | null>(null);
  const captureHandles = useRef<Record<number, CaptureHandle>>({});

  // Presentation-only additions for the capture card (record-ui/capture-card.tsx):
  // live elapsed-ms while a slot is recording (capture.ts's existing, previously
  // unused onTick option), and the settled clip length once known (from the
  // same CaptureResult/ExtractFromVideoFileResult the upload path already
  // reads durationMs off of). Neither touches the reducer or the
  // upload/trace/compile flow — display state only.
  const [elapsedMs, setElapsedMs] = useState<Record<number, number>>({});
  const [slotDurationMs, setSlotDurationMs] = useState<Record<number, number>>({});
  // True once the stored-session rehydrate path (below) successfully restores
  // an earlier session — drives the "Restored from earlier · Start fresh"
  // strip. Local UI state only; the rehydrate flow itself is unchanged.
  const [restoredSession, setRestoredSession] = useState(false);

  // Mobile browsers have no getDisplayMedia — phones use the OS's built-in
  // screen recorder, then upload the file here. Default to `true` so the
  // server-rendered markup (no `navigator` on the server) shows the
  // desktop-style Record button, matching the existing render-smoke test;
  // the real feature-detect only runs client-side, post-mount, and flips
  // this to `false` on browsers that genuinely lack the API.
  const [supportsScreenCapture, setSupportsScreenCapture] = useState(true);
  useEffect(() => {
    setSupportsScreenCapture(typeof navigator.mediaDevices?.getDisplayMedia === "function");
  }, []);

  // Upload-a-recording path: a file is picked but not yet processed until
  // the operator supplies the required summary (there's no live transcript
  // for an uploaded file, so the "describe what you did" textarea — the
  // same one live-capture falls back to when Web Speech is unavailable —
  // is mandatory here instead of optional).
  const [pendingUpload, setPendingUpload] = useState<Record<number, File>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<number, { done: number; total: number }>>({});

  // Register the Web Share Target worker (record-sw.js) — a separate,
  // minimal worker from the portal PWA's sw.js (that one is deliberately
  // scoped to /portal/<orgSlug>/, see its own header; this repo keeps that
  // scope untouched). Registered here, from the /record client only, so no
  // other surface ever picks it up.
  //
  // Scope math: a worker served from a root-level script (/record-sw.js)
  // defaults to controlling everything at or below "/" — a
  // `Service-Worker-Allowed` response header is only needed to WIDEN a
  // worker's scope past its script's own directory, never to narrow it.
  // "/record" is a subpath of that default "/" scope, so requesting it
  // explicitly here works with no extra header and keeps the worker from
  // ever being asked to control anything outside /record in the first
  // place (on top of the fetch handler's own pathname guard).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/record-sw.js", { scope: "/record" }).catch(() => {
      // Registration failures (unsupported browser, insecure context in
      // local dev) are non-fatal — share-target/route.ts's server-side
      // fallback still handles the share intent if the OS ever POSTs there
      // directly without a controlling worker.
    });
  }, []);

  // Web Share Target landing: read the file record-sw.js staged in
  // CacheStorage (see share-target.ts for the shared cache name/key) and
  // feed it into the SAME pendingUpload flow a manual file picker uses
  // (handleFileChange below) — the required-summary textarea still gates
  // processing, exactly as it does for a manually picked file. Runs once
  // per page load (sharedHandledRef), independent of session-mint timing —
  // slots exist from the initial reducer state regardless of whether the
  // session has finished minting yet.
  const sharedHandledRef = useRef(false);
  useEffect(() => {
    if (sharedHandledRef.current) return;

    if (sharedFlag === "miss") {
      sharedHandledRef.current = true;
      setSharedNotice("Couldn't find the shared recording — upload it below.");
      return;
    }
    if (sharedFlag !== "1") return;
    if (typeof window === "undefined" || !("caches" in window)) return;
    sharedHandledRef.current = true;

    (async () => {
      try {
        const cache = await window.caches.open(SHARE_CACHE_NAME);
        const cached = await cache.match(STAGED_RECORDING_CACHE_KEY);
        if (!cached) {
          setSharedNotice("Couldn't find the shared recording — upload it below.");
          return;
        }
        await cache.delete(STAGED_RECORDING_CACHE_KEY);
        const blob = await cached.blob();
        const contentType = cached.headers.get("Content-Type") || blob.type || "video/mp4";
        const file = new File([blob], "shared-recording", { type: contentType });

        const slotIndex = pickFirstEmptySlot(state);
        if (slotIndex === null) {
          setSharedNotice("All recording slots are full — clear one to use the shared recording.");
          return;
        }
        setPendingUpload((prev) => ({ ...prev, [slotIndex]: file }));
      } catch {
        setSharedNotice("Couldn't find the shared recording — upload it below.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedFlag]);

  // Restore (or mint) the anonymous recording session on first mount.
  //
  // A stored {sessionId, token} pair covers two cases the same way: the
  // post-claim return from /signup AND an ordinary page refresh mid-capture.
  // Either way, all React state (phase/flowModel/coverage/interview) only
  // ever lived in memory, so it's re-fetched from the persisted session row
  // via GET /session rather than assumed from a bare SESSION_READY (which
  // would silently drop back to phase "capturing" with flowModel null — see
  // final-review B-1). A 401/404 on that GET means the stored pair is stale
  // (cleared/rotated/expired secret), so it's cleared and we fall back to
  // minting a fresh session exactly as before.
  useEffect(() => {
    if (state.sessionId) return;

    const stored = readStoredSession();
    let cancelled = false;

    function mintFreshSession() {
      fetch("/api/v1/recordings/session", { method: "POST" })
        .then(async (res) => {
          if (!res.ok) throw new Error(`session_create_failed:${res.status}`);
          return (await res.json()) as { session_id: string; token: string };
        })
        .then((data) => {
          if (cancelled) return;
          writeStoredSession({ sessionId: data.session_id, token: data.token });
          dispatch({ type: "SESSION_READY", sessionId: data.session_id, token: data.token });
        })
        .catch((err) => {
          if (cancelled) return;
          setMessage(err instanceof Error ? err.message : "Could not start a recording session.");
        });
    }

    if (stored) {
      fetch("/api/v1/recordings/session", {
        headers: { Authorization: `Bearer ${stored.token}` },
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`session_fetch_failed:${res.status}`);
          return (await res.json()) as {
            session_id: string;
            status: string;
            flow_model: FlowModel | null;
            open_questions: string[];
            slots: Array<{ slot_index: number; label: string | null; status: "traced" | "failed" | "uploaded" }>;
          };
        })
        .then((data) => {
          if (cancelled) return;
          dispatch({
            type: "REHYDRATED",
            sessionId: stored.sessionId,
            token: stored.token,
            status: data.status,
            flowModel: data.flow_model,
            openQuestions: data.open_questions,
            slots: data.slots.map((s) => ({ slotIndex: s.slot_index, label: s.label, status: s.status })),
            // Only trust ?claimed=1 for the session it was minted for — a
            // stale localStorage pair from a different session must not skip
            // its own recap.
            claimed: claimed && (claimedSessionId === null || claimedSessionId === stored.sessionId),
          });
          setRestoredSession(true);
        })
        .catch(() => {
          if (cancelled) return;
          // Stale/invalid stored pair (401/404/network error) — clear it and
          // fall back to the fresh-mint path exactly as if none existed.
          clearStoredSession();
          mintFreshSession();
        });
    } else {
      mintFreshSession();
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStart(slotIndex: number) {
    if (!state.sessionId || !state.token) return;
    // Belt for the Re-record path (opus review 2026-07-12, blocking #1): if any
    // slot is mid-capture, START_RECORDING would no-op in the reducer but
    // startCapture below would still open a second, uncontrollable
    // getDisplayMedia. Never start while another capture is in flight.
    if (state.activeSlot !== null) return;
    dispatch({ type: "START_RECORDING", slotIndex });
    setElapsedMs((prev) => ({ ...prev, [slotIndex]: 0 }));
    try {
      const handle = await startCapture({
        maxSeconds: MAX_RECORDING_SECONDS,
        maxFrames: MAX_FRAMES_PER_RECORDING,
        maxEdgePx: MAX_FRAME_EDGE_PX,
        // Live elapsed-ms for the capture card's timer (record-ui/capture-card.tsx)
        // — an already-existing capture.ts option, previously unwired.
        onTick: (ms) => setElapsedMs((prev) => ({ ...prev, [slotIndex]: ms })),
        // The browser's native "Stop sharing" bar (or the max-length cap)
        // ends the capture without our Stop button — run the exact same
        // finalize→upload→compile flow. handleStop is safe to double-fire:
        // the handle is deleted on the first pass, so a simultaneous button
        // click no-ops.
        onEnded: () => {
          void handleStop(slotIndex);
        },
      });
      captureHandles.current[slotIndex] = handle;
    } catch (err) {
      dispatch({
        type: "SLOT_FAILED",
        slotIndex,
        error: err instanceof Error ? err.message : "Could not start screen capture.",
      });
    }
  }

  // Shared upload+compile tail for BOTH capture paths (live screen-record and
  // uploaded-file): uploads frames (and the video, when provided) as blobs,
  // saves the recording, then compiles its trace. Extracted here because
  // handleFilePicked below is the second occurrence of this exact sequence
  // (live-capture's handleStop was the first) — copy-pasting a third time
  // would just invite drift between the two paths.
  async function finalizeRecording(params: {
    slotIndex: number;
    frames: Blob[];
    transcript: TranscriptSegment[];
    video: Blob | null;
  }): Promise<void> {
    const { slotIndex, frames, transcript, video } = params;
    if (!state.sessionId || !state.token) return;
    const sessionId = state.sessionId;
    const token = state.token;

    const frameBlobUrls: string[] = [];
    for (const [i, frame] of frames.entries()) {
      const blobResult = await upload(`recordings/${sessionId}/frame-${slotIndex}-${i}.jpg`, frame, {
        access: "public",
        handleUploadUrl: "/api/v1/recordings/upload",
        clientPayload: JSON.stringify({ token, contentType: "image/jpeg" }),
      });
      frameBlobUrls.push(blobResult.url);
    }

    let videoBlobUrl: string | null = null;
    if (video) {
      // Live capture produces webm; uploaded files keep their real type
      // (mp4 on Android, quicktime/.mov on iOS) — the grant accepts all
      // three, and Whisper needs the true content type to transcribe.
      const videoType = video.type && video.type.startsWith("video/") ? video.type : "video/webm";
      const ext = videoType === "video/mp4" ? "mp4" : videoType === "video/quicktime" ? "mov" : "webm";
      const videoResult = await upload(`recordings/${sessionId}/video-${slotIndex}.${ext}`, video, {
        access: "public",
        handleUploadUrl: "/api/v1/recordings/upload",
        clientPayload: JSON.stringify({ token, contentType: videoType }),
      });
      videoBlobUrl = videoResult.url;
    }

    const recordingRes = await fetch("/api/v1/recordings/recording", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ slotIndex, transcript, frameBlobUrls, videoBlobUrl }),
    });
    if (!recordingRes.ok) throw new Error(`recording_save_failed:${recordingRes.status}`);
    const { recording_id: recordingId } = (await recordingRes.json()) as { recording_id: string };

    dispatch({ type: "UPLOADED", slotIndex });

    const traceRes = await fetch("/api/v1/recordings/compile-trace", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ recording_id: recordingId }),
    });
    if (!traceRes.ok) {
      const body = await traceRes.json().catch(() => ({}) as { error?: string });
      throw new Error(body.error ?? `compile_trace_failed:${traceRes.status}`);
    }
    const traced = (await traceRes.json()) as {
      trace: unknown;
      whatChanged: string[];
      openQuestions: string[];
      coverage: CoverageEntry[];
      flow_model: FlowModel;
    };

    // flow_model is the session's own persisted, merged FlowModel (the
    // source of truth) — use it directly instead of reconstructing it
    // client-side from trace/coverage/openQuestions.
    dispatch({
      type: "TRACED",
      slotIndex,
      flowModel: traced.flow_model,
      coverage: traced.coverage,
      whatChanged: traced.whatChanged,
      openQuestions: traced.openQuestions,
    });
  }

  async function handleStop(slotIndex: number) {
    const handle = captureHandles.current[slotIndex];
    if (!handle || !state.sessionId || !state.token) return;
    dispatch({ type: "STOP_RECORDING", slotIndex });

    try {
      const result = await handle.stop();
      delete captureHandles.current[slotIndex];
      setSlotDurationMs((prev) => ({ ...prev, [slotIndex]: result.durationMs }));

      const transcript =
        result.transcript.length > 0
          ? result.transcript
          : fallbackText[slotIndex]
            ? [{ atMs: 0, text: fallbackText[slotIndex] }]
            : [];

      await finalizeRecording({ slotIndex, frames: result.frames, transcript, video: result.video });
    } catch (err) {
      dispatch({
        type: "SLOT_FAILED",
        slotIndex,
        error: err instanceof Error ? err.message : "Recording failed to process.",
      });
    }
  }

  function handleFileChange(slotIndex: number, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    // Reset so picking the SAME file twice still fires onChange next time.
    e.target.value = "";
    if (!file) return;
    setPendingUpload((prev) => ({ ...prev, [slotIndex]: file }));
  }

  function cancelPendingUpload(slotIndex: number) {
    setPendingUpload((prev) => {
      const next = { ...prev };
      delete next[slotIndex];
      return next;
    });
  }

  // Uploaded-recording path: an already-recorded video file, no live
  // transcript (Web Speech never ran against it) — the summary the operator
  // typed into the required textarea IS the transcript, encoded the same
  // way live-capture's own no-speech fallback encodes it (a single segment
  // at atMs 0).
  async function handleFilePicked(slotIndex: number, file: File) {
    if (!state.sessionId || !state.token) return;
    dispatch({ type: "FILE_PICKED", slotIndex });

    try {
      const { frames, durationMs } = await extractFromVideoFile(file, {
        maxFrames: MAX_FRAMES_PER_RECORDING,
        maxEdgePx: MAX_FRAME_EDGE_PX,
        onProgress: (done, total) =>
          setUploadProgress((prev) => ({ ...prev, [slotIndex]: { done, total } })),
      });
      setSlotDurationMs((prev) => ({ ...prev, [slotIndex]: durationMs }));

      const transcript: TranscriptSegment[] = fallbackText[slotIndex]
        ? [{ atMs: 0, text: fallbackText[slotIndex] }]
        : [];

      // The recordings routes only accept video/webm (route-guards.ts); a
      // non-webm upload (e.g. iOS .mov/.mp4) still contributes its frames —
      // only the raw video attachment is skipped when it wouldn't be
      // accepted or is over the size cap, same fail-soft posture as an
      // oversized live-capture video.
      const video =
        file.size <= RECORDING_VIDEO_MAX_BYTES &&
        ["video/webm", "video/mp4", "video/quicktime"].includes(file.type)
          ? file
          : null;

      await finalizeRecording({ slotIndex, frames, transcript, video });
    } catch (err) {
      dispatch({
        type: "SLOT_FAILED",
        slotIndex,
        error: err instanceof Error ? err.message : "Recording failed to process.",
      });
    } finally {
      setUploadProgress((prev) => {
        const next = { ...prev };
        delete next[slotIndex];
        return next;
      });
    }
  }

  // Interview replies merge the FlowModel server-side, which is a slower LLM
  // call — the operator's own message must render the instant they hit Send
  // (INTERVIEW_USER_SENT), not wait behind that round-trip. `sendText` is
  // split out from the click handler so a failed turn can be retried without
  // re-appending the user's message (it's already in state.interview).
  async function sendInterviewMessage(text: string) {
    if (!state.token) return;
    setInterviewPending(true);
    setInterviewError(null);
    try {
      const res = await fetch("/api/v1/recordings/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.token}` },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error(`interview_failed:${res.status}`);
      const data = (await res.json()) as {
        reply: string;
        open_questions: string[];
        flow_model?: FlowModel;
      };
      dispatch({ type: "INTERVIEW_REPLY", seldon: data.reply, openQuestions: data.open_questions });
      // The interview turn also merges answers into the FlowModel server-side
      // (never-lies: what Seldon says it learned must be what compiles) — if
      // the response carries the updated model, refresh the recap with it.
      if (data.flow_model) {
        dispatch({ type: "MODEL_UPDATED", flowModel: data.flow_model, openQuestions: data.open_questions });
      }
      lastInterviewMessage.current = null;
    } catch (err) {
      setInterviewError(err instanceof Error ? err.message : "Could not send that message.");
    } finally {
      setInterviewPending(false);
    }
  }

  async function handleInterviewSend() {
    const text = interviewInput.trim();
    if (!text || !state.token || interviewPending) return;
    setInterviewInput("");
    lastInterviewMessage.current = text;
    dispatch({ type: "INTERVIEW_USER_SENT", user: text });
    await sendInterviewMessage(text);
  }

  async function handleInterviewRetry() {
    const text = lastInterviewMessage.current;
    if (!text || interviewPending) return;
    await sendInterviewMessage(text);
  }

  async function handleCompileAgent() {
    if (!state.sessionId || !state.token) return;
    setCompiling(true);
    try {
      const res = await fetch("/api/v1/recordings/compile-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: state.sessionId, token: state.token, approve: true }),
      });
      if (!res.ok) throw new Error(`compile_agent_failed:${res.status}`);
      const data = (await res.json()) as { template_id: string };
      setCompiledTemplateId(data.template_id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not compile your agent yet.");
    } finally {
      setCompiling(false);
    }
  }

  // 2026-07-10 — live-test fix: an already-signed-in visitor never needs the
  // /signup hop (their session already exists, and this session's bearer
  // token is still in memory), so approve-and-compile can run in place. Same
  // handleCompileAgent flow the "approved" phase button already used.
  async function handleCompileNow() {
    dispatch({ type: "APPROVED" });
    await handleCompileAgent();
  }

  const claimHref =
    "/signup?callbackUrl=" +
    encodeURIComponent(`/record?session=${state.sessionId ?? ""}&claimed=1`);

  // 2026-07-10 — live-test fix: a restored session (via localStorage or the
  // post-claim return) had no way back to a clean slate — the founder's own
  // testing kept landing back on an old session. Clearing the stored session
  // and reloading `/record` mints a brand-new one server-side, same path a
  // first-time visitor takes.
  function handleStartFresh() {
    if (
      state.flowModel &&
      !window.confirm(
        "Start over? Your current recap stays saved on your compiled agent, but this page will start a new session.",
      )
    ) {
      return;
    }
    clearStoredSession();
    window.location.assign("/record");
  }

  const recapVisible = state.phase === "recap" || state.phase === "approved";

  // Single-slot capture (record v3 S1) — exactly ONE capture card renders:
  // the first slot that hasn't traced yet (empty/recording/uploading/
  // compiling/failed). Once every slot has traced, there's nothing left to
  // capture. Traced slots move to the compact <TracedList> below it.
  const captureSlot = state.slots.find((slot) => slot.status !== "traced") ?? null;
  const tracedSlots = state.slots.filter((slot) => slot.status === "traced");
  // Also gates the traced/failed Re-record buttons (review #1b): no slot
  // may start while any capture is in flight.
  const canStart = state.activeSlot === null;
  const nextEmptySlot = pickFirstEmptySlot(state);
  // "Make it trustworthy" row (S1): only once something's traced, only when
  // nothing is mid-capture, only while a slot remains to fill, and only in
  // the "recap" phase (review minor #5 — it must not linger into "approved").
  // Also suppressed whenever the capture card is showing a FAILED slot's
  // re-record state (review minor #4): that state already offers its own
  // record affordance, and showing both at once is two capture surfaces
  // fighting for the same click. The capture card is only ever "empty" or
  // busy/failed, so gating on captureSlot.status === "empty" is the whole
  // rule — one recording affordance on screen at a time.
  const edgeCasePrompt =
    state.phase === "recap" &&
    tracedSlots.length > 0 &&
    canStart &&
    nextEmptySlot !== null &&
    captureSlot?.status === "empty"
      ? {
          onRecord: () => handleStart(nextEmptySlot),
          onFileChange: (e: ChangeEvent<HTMLInputElement>) => handleFileChange(nextEmptySlot, e),
          supportsScreenCapture,
        }
      : undefined;

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8">
        {message ? (
          <p role="alert" className="text-[13.5px] leading-[1.55]" style={{ color: "#EF4444" }}>
            {message}
          </p>
        ) : null}
        {sharedNotice ? (
          <p className="text-[13.5px] leading-[1.55]" style={{ color: "var(--lp-body)" }}>
            {sharedNotice}
          </p>
        ) : null}
        <div className="w-full max-w-[720px]">
          <StepStrip current={currentStep(state)} />
        </div>

        {/* Stacks to one column below ~900px (capture above, recap below) —
            the two-column layout only kicks in once there's room for both.
            Below 720px (mobile), everything centers — see the `items-center
            text-center min-[720px]:items-stretch min-[720px]:text-left`
            pairs throughout this section (record v3 S3). */}
        <div className="flex flex-col items-center gap-6 text-center min-[720px]:items-stretch min-[720px]:text-left min-[900px]:flex-row">
          <section
            aria-label="Recording slots"
            className="flex w-full flex-1 flex-col items-center gap-3 min-[720px]:items-stretch"
          >
            <RestoredBanner restored={restoredSession} onStartFresh={handleStartFresh} />

            {captureSlot ? (
              <CaptureCard
                slot={captureSlot}
                isActive={state.activeSlot === captureSlot.slotIndex}
                canStart={canStart}
                sessionReady={!!state.sessionId}
                supportsScreenCapture={supportsScreenCapture}
                elapsedMs={captureSlot.status === "recording" ? (elapsedMs[captureSlot.slotIndex] ?? 0) : null}
                fallbackText={fallbackText[captureSlot.slotIndex] ?? ""}
                pendingUpload={pendingUpload[captureSlot.slotIndex]}
                uploadProgress={uploadProgress[captureSlot.slotIndex]}
                onRecord={() => handleStart(captureSlot.slotIndex)}
                onStop={() => handleStop(captureSlot.slotIndex)}
                onFileChange={(e) => handleFileChange(captureSlot.slotIndex, e)}
                onFallbackTextChange={(text) =>
                  setFallbackText((prev) => ({ ...prev, [captureSlot.slotIndex]: text }))
                }
                onProcessUpload={() => {
                  const file = pendingUpload[captureSlot.slotIndex];
                  if (!file) return;
                  cancelPendingUpload(captureSlot.slotIndex);
                  void handleFilePicked(captureSlot.slotIndex, file);
                }}
                onCancelUpload={() => cancelPendingUpload(captureSlot.slotIndex)}
              />
            ) : (
              <p className="text-[13.5px] leading-[1.55]" style={{ color: "var(--lp-body)" }}>
                All {MAX_RECORDINGS_PER_SESSION} recording slots are used.
              </p>
            )}

            <TracedList
              slots={tracedSlots}
              canStart={canStart}
              sessionReady={!!state.sessionId}
              stepsFound={state.flowModel?.steps.length ?? 0}
              durationMsBySlot={slotDurationMs}
              onLabelChange={(slotIndex, label) => dispatch({ type: "SET_LABEL", slotIndex, label })}
              onRerecord={(slotIndex) => handleStart(slotIndex)}
            />
          </section>

          {recapVisible ? (
            <RecapPanel
              phase={state.phase}
              flowModel={state.flowModel}
              coverage={state.coverage}
              openQuestions={state.openQuestions}
              interview={state.interview}
              interviewInput={interviewInput}
              interviewPending={interviewPending}
              interviewError={interviewError}
              isAuthed={isAuthed}
              compiling={compiling}
              compiledTemplateId={compiledTemplateId}
              claimHref={claimHref}
              onInterviewInputChange={setInterviewInput}
              onInterviewSend={() => void handleInterviewSend()}
              onInterviewRetry={() => void handleInterviewRetry()}
              onCompileNow={() => void handleCompileNow()}
              onCompileAgent={() => void handleCompileAgent()}
              onApprove={() => dispatch({ type: "APPROVED" })}
              edgeCasePrompt={edgeCasePrompt}
            />
          ) : null}
        </div>
    </div>
  );
}
