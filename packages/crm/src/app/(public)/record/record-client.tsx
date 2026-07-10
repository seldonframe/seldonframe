// packages/crm/src/app/(public)/record/record-client.tsx
//
// Client island for the public /record page. Drives recorder-machine.ts's
// pure reducer; all I/O (session mint, capture, blob upload, compile-trace,
// interview, compile-agent) happens in handlers here, never inside the
// reducer itself.
//
// Palette: dark theme (this app's default — see try-client.tsx's header
// comment on why /try overrides to light; /record does NOT override,
// it's meant to feel like the rest of the dark dashboard chrome the
// operator will land in after claiming). Ink #0B0F0E paper / #E7E5DE text
// / #14B8A6 teal accent — same teal as OnboardingShell's brand mark, so
// the visual language is consistent from record → claim → dashboard.
//
// Session persistence across the claim redirect: the raw bearer token only
// ever exists in memory (server never re-issues it), so it's mirrored into
// localStorage the same way try-client.tsx mirrors its build seed — read
// back on return from /signup when the page loads with ?claimed=1.
"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { initialRecorderState, recorderReducer } from "./recorder-machine";
import { startCapture, type CaptureHandle } from "./capture";
import {
  MAX_FRAME_EDGE_PX,
  MAX_FRAMES_PER_RECORDING,
  MAX_RECORDING_SECONDS,
} from "@/lib/recordings/policy";
import type { CoverageEntry, CoverageTier, FlowModel } from "@/lib/recordings/trace-schema";

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

const TIER_COLOR: Record<CoverageTier, string> = {
  green: "#22C55E",
  yellow: "#EAB308",
  red: "#EF4444",
};

const TIER_LABEL: Record<CoverageTier, string> = {
  green: "Automatable",
  yellow: "Needs approval",
  red: "Stays with you",
};

export function RecordClient({
  claimedSessionId,
  claimed,
  isAuthed,
}: {
  claimedSessionId: string | null;
  claimed: boolean;
  isAuthed: boolean;
}) {
  const [state, dispatch] = useReducer(recorderReducer, undefined, initialRecorderState);
  const [message, setMessage] = useState<string | null>(null);
  const [interviewInput, setInterviewInput] = useState("");
  const [interviewPending, setInterviewPending] = useState(false);
  const [interviewError, setInterviewError] = useState<string | null>(null);
  const lastInterviewMessage = useRef<string | null>(null);
  const [fallbackText, setFallbackText] = useState<Record<number, string>>({});
  const [compiling, setCompiling] = useState(false);
  const [compiledTemplateId, setCompiledTemplateId] = useState<string | null>(null);
  const captureHandles = useRef<Record<number, CaptureHandle>>({});

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
    dispatch({ type: "START_RECORDING", slotIndex });
    try {
      const handle = await startCapture({
        maxSeconds: MAX_RECORDING_SECONDS,
        maxFrames: MAX_FRAMES_PER_RECORDING,
        maxEdgePx: MAX_FRAME_EDGE_PX,
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

  async function handleStop(slotIndex: number) {
    const handle = captureHandles.current[slotIndex];
    if (!handle || !state.sessionId || !state.token) return;
    dispatch({ type: "STOP_RECORDING", slotIndex });

    try {
      const result = await handle.stop();
      delete captureHandles.current[slotIndex];

      const transcript =
        result.transcript.length > 0
          ? result.transcript
          : fallbackText[slotIndex]
            ? [{ atMs: 0, text: fallbackText[slotIndex] }]
            : [];

      const frameBlobUrls: string[] = [];
      for (const [i, frame] of result.frames.entries()) {
        const blobResult = await upload(`recordings/${state.sessionId}/frame-${slotIndex}-${i}.jpg`, frame, {
          access: "public",
          handleUploadUrl: "/api/v1/recordings/upload",
          clientPayload: JSON.stringify({ token: state.token, contentType: "image/jpeg" }),
        });
        frameBlobUrls.push(blobResult.url);
      }

      let videoBlobUrl: string | null = null;
      if (result.video) {
        const videoResult = await upload(`recordings/${state.sessionId}/video-${slotIndex}.webm`, result.video, {
          access: "public",
          handleUploadUrl: "/api/v1/recordings/upload",
          clientPayload: JSON.stringify({ token: state.token, contentType: "video/webm" }),
        });
        videoBlobUrl = videoResult.url;
      }

      const recordingRes = await fetch("/api/v1/recordings/recording", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.token}` },
        body: JSON.stringify({ slotIndex, transcript, frameBlobUrls, videoBlobUrl }),
      });
      if (!recordingRes.ok) throw new Error(`recording_save_failed:${recordingRes.status}`);
      const { recording_id: recordingId } = (await recordingRes.json()) as { recording_id: string };

      dispatch({ type: "UPLOADED", slotIndex });

      const traceRes = await fetch("/api/v1/recordings/compile-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.token}` },
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
    } catch (err) {
      dispatch({
        type: "SLOT_FAILED",
        slotIndex,
        error: err instanceof Error ? err.message : "Recording failed to process.",
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

  return (
    <main className="min-h-screen bg-[#0B0F0E] px-5 py-10 text-[#E7E5DE] md:px-8 md:py-16">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8">
        <header className="flex flex-col items-center text-center">
          <p className="inline-flex items-center gap-2.5 font-sans text-[12.5px] tracking-[0.04em] text-[#9CA3AF]">
            <span className="inline-block size-1.5 rounded-full bg-[#14B8A6]" aria-hidden />
            Record a workflow — no signup required
          </p>
          <h1 className="mt-3 max-w-[26ch] text-balance font-sans text-[clamp(26px,3.6vw,40px)] font-[500] leading-[1.08] tracking-[-0.02em] text-[#F5F4F0]">
            Show Seldon how you work. It builds the agent.
          </h1>
          <p className="mx-auto mt-3 max-w-[58ch] text-pretty text-[15px] leading-[1.55] text-[#9CA3AF]">
            Screen-record yourself doing a job — record a few edge cases too — and Seldon compiles
            a draft agent from what it saw.
          </p>
          {message ? (
            <p role="alert" className="mt-3 text-[13px] text-[#EF4444]">
              {message}
            </p>
          ) : null}
        </header>

        <div className="flex flex-col gap-6 lg:flex-row">
          <section aria-label="Recording slots" className="flex flex-1 flex-col gap-3">
            {state.sessionId ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleStartFresh}
                  className="text-[12.5px] text-[#6B7280] underline-offset-2 hover:text-[#9CA3AF] hover:underline"
                >
                  Start fresh
                </button>
              </div>
            ) : null}
            {state.slots.map((slot) => {
              const isActive = state.activeSlot === slot.slotIndex;
              const canStart = state.activeSlot === null && slot.status === "empty";
              return (
                <div
                  key={slot.slotIndex}
                  className="rounded-[14px] border border-[rgba(231,229,222,.12)] bg-[#12171533] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <input
                      type="text"
                      value={slot.label ?? ""}
                      onChange={(e) =>
                        dispatch({ type: "SET_LABEL", slotIndex: slot.slotIndex, label: e.target.value })
                      }
                      placeholder={
                        slot.slotIndex === 0 ? "Happy path" : `Edge case ${slot.slotIndex}`
                      }
                      className="flex-1 bg-transparent text-[14px] text-[#E7E5DE] outline-none placeholder:text-[#6B7280]"
                    />
                    <span className="rounded-full border border-[rgba(231,229,222,.16)] px-2.5 py-1 text-[11px] uppercase tracking-[0.05em] text-[#9CA3AF]">
                      {slot.status}
                    </span>
                  </div>

                  {slot.error ? (
                    <p className="mt-2 text-[12.5px] text-[#EF4444]">{slot.error}</p>
                  ) : null}

                  <div className="mt-3 flex items-center gap-2.5">
                    {slot.status === "empty" ? (
                      <button
                        type="button"
                        disabled={!canStart || !state.sessionId}
                        onClick={() => handleStart(slot.slotIndex)}
                        className="inline-flex h-9 items-center justify-center rounded-full bg-[#14B8A6] px-4 text-[13px] font-[600] text-[#0B0F0E] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Record
                      </button>
                    ) : null}
                    {slot.status === "recording" ? (
                      <button
                        type="button"
                        onClick={() => handleStop(slot.slotIndex)}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-[#EF4444] px-4 text-[13px] font-[600] text-[#EF4444]"
                      >
                        Stop
                      </button>
                    ) : null}
                  </div>

                  {isActive && slot.status === "recording" ? (
                    <textarea
                      value={fallbackText[slot.slotIndex] ?? ""}
                      onChange={(e) =>
                        setFallbackText((prev) => ({ ...prev, [slot.slotIndex]: e.target.value }))
                      }
                      placeholder="Describe what you did (used if your browser can't transcribe speech)"
                      className="mt-3 h-16 w-full resize-none rounded-[10px] border border-[rgba(231,229,222,.12)] bg-transparent p-2.5 text-[13px] text-[#E7E5DE] outline-none placeholder:text-[#6B7280]"
                    />
                  ) : null}

                  {slot.whatChanged && slot.whatChanged.length > 0 ? (
                    <ul className="mt-2 list-disc pl-4 text-[12.5px] text-[#14B8A6]">
                      {slot.whatChanged.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </section>

          {state.phase === "recap" || state.phase === "approved" ? (
            <section
              aria-label="Recap"
              className="flex flex-1 flex-col gap-5 rounded-[16px] border border-[rgba(231,229,222,.12)] bg-[#12171533] p-5"
            >
              <div>
                <h2 className="text-[15px] font-[600] text-[#F5F4F0]">
                  {state.flowModel?.title ?? "Your workflow"}
                </h2>
                <p className="mt-1 text-[13px] text-[#9CA3AF]">{state.flowModel?.goal}</p>
              </div>

              <ol className="flex flex-col gap-2">
                {state.flowModel?.steps.map((step) => {
                  const entry = state.coverage.find((c) => c.stepIndex === step.index);
                  const tier: CoverageTier = entry?.tier ?? "red";
                  return (
                    <li
                      key={step.index}
                      className="flex items-start gap-2.5 rounded-[10px] border border-[rgba(231,229,222,.08)] p-2.5"
                    >
                      <span
                        className="mt-1 inline-block size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: TIER_COLOR[tier] }}
                        aria-hidden
                      />
                      <div className="flex-1">
                        <p className="text-[13.5px] text-[#E7E5DE]">
                          {step.app} — {step.action}
                        </p>
                        <p className="text-[12px] text-[#9CA3AF]">
                          {TIER_LABEL[tier]}
                          {entry?.reason ? ` — ${entry.reason}` : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {state.flowModel?.branches && state.flowModel.branches.length > 0 ? (
                <div>
                  <h3 className="text-[12px] font-[600] uppercase tracking-[0.05em] text-[#9CA3AF]">
                    Branches
                  </h3>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {state.flowModel.branches.map((branch, i) => (
                      <li key={i} className="text-[12.5px] text-[#E7E5DE]">
                        {branch.condition} → {branch.behavior}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {state.openQuestions.length > 0 ? (
                <div>
                  <h3 className="text-[12px] font-[600] uppercase tracking-[0.05em] text-[#9CA3AF]">
                    Open questions ({state.openQuestions.length})
                  </h3>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {state.openQuestions.map((q, i) => (
                      <li key={i} className="text-[12.5px] text-[#EAB308]">
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <h3 className="text-[12px] font-[600] uppercase tracking-[0.05em] text-[#9CA3AF]">
                  Ask Seldon
                </h3>
                <div className="flex max-h-[180px] flex-col gap-1.5 overflow-y-auto">
                  {state.interview.map((turn, i) => (
                    <p
                      key={i}
                      className={`text-[13px] ${turn.role === "user" ? "text-[#E7E5DE]" : "text-[#14B8A6]"}`}
                    >
                      <strong>{turn.role === "user" ? "You: " : "Seldon: "}</strong>
                      {turn.text}
                    </p>
                  ))}
                  {interviewPending ? (
                    <p className="text-[13px] italic text-[#6B7280]">Seldon is updating the flow&hellip;</p>
                  ) : null}
                  {interviewError ? (
                    <p role="alert" className="text-[13px] text-[#EF4444]">
                      {interviewError}{" "}
                      <button
                        type="button"
                        onClick={() => void handleInterviewRetry()}
                        className="underline underline-offset-2 hover:text-[#F5F4F0]"
                      >
                        Retry
                      </button>
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={interviewInput}
                    disabled={interviewPending}
                    onChange={(e) => setInterviewInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleInterviewSend();
                      }
                    }}
                    placeholder="Answer an open question or add detail..."
                    className="flex-1 rounded-[10px] border border-[rgba(231,229,222,.12)] bg-transparent px-3 py-2 text-[13px] text-[#E7E5DE] outline-none placeholder:text-[#6B7280] disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={interviewPending}
                    onClick={() => void handleInterviewSend()}
                    className="rounded-[10px] bg-[#14B8A6] px-3 py-2 text-[13px] font-[600] text-[#0B0F0E] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>

              {state.phase === "recap" && isAuthed ? (
                <button
                  type="button"
                  disabled={compiling}
                  onClick={() => void handleCompileNow()}
                  className="mt-1 inline-flex items-center justify-center gap-2.5 rounded-full bg-[#14B8A6] px-5 py-3 text-[14px] font-[600] text-[#0B0F0E] disabled:opacity-50"
                >
                  {compiling ? "Compiling..." : "Looks right — compile my agent"}
                </button>
              ) : null}

              {state.phase === "recap" && !isAuthed ? (
                <a
                  href={claimHref}
                  onClick={() => dispatch({ type: "APPROVED" })}
                  className="mt-1 inline-flex items-center justify-center gap-2.5 rounded-full bg-[#14B8A6] px-5 py-3 text-[14px] font-[600] text-[#0B0F0E]"
                >
                  Looks right — claim &amp; compile my agent
                </a>
              ) : null}

              {state.phase === "approved" && !compiledTemplateId ? (
                <button
                  type="button"
                  disabled={compiling}
                  onClick={() => void handleCompileAgent()}
                  className="mt-1 inline-flex items-center justify-center gap-2.5 rounded-full bg-[#14B8A6] px-5 py-3 text-[14px] font-[600] text-[#0B0F0E] disabled:opacity-50"
                >
                  {compiling ? "Compiling..." : "Compile my agent"}
                </button>
              ) : null}

              {compiledTemplateId ? (
                <div className="mt-1 flex flex-col gap-2">
                  <p className="text-[13.5px] font-[600] text-[#F5F4F0]">Your agent is compiled</p>
                  <a
                    href={`/studio/agents/${compiledTemplateId}`}
                    className="inline-flex items-center justify-center gap-2.5 rounded-full bg-[#14B8A6] px-5 py-3 text-[14px] font-[600] text-[#0B0F0E]"
                  >
                    Open your agent
                  </a>
                  <p className="text-[12px] text-[#9CA3AF]">
                    It was compiled from your recording — run its evals and test it before
                    publishing. It&apos;s a draft.
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
