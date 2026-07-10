// packages/crm/src/app/(public)/record/capture.ts
//
// Browser-only screen + voice capture for one recording slot. NOT unit
// tested (browser APIs — getDisplayMedia/getUserMedia/MediaRecorder/Web
// Speech — have no meaningful fake in node:test per the plan); kept thin
// and typed so record-client.tsx's own logic (reducer wiring, upload,
// compile-trace calls) stays the testable surface instead.
//
// Feature-detection contract: Web Speech (webkitSpeechRecognition /
// SpeechRecognition) is absent in some browsers (e.g. Firefox). When
// absent, `transcript` is always `[]` — record-client.tsx is responsible
// for showing a "describe what you did" textarea per slot and treating it
// as required whenever the returned transcript came back empty, per the
// plan's UI contract. This module never throws for a missing Speech API;
// it silently degrades to video+frames-only capture.

import type { TranscriptSegment } from "@/lib/recordings/trace-schema";

export type CaptureResult = {
  frames: Blob[];
  transcript: TranscriptSegment[];
  video: Blob | null;
  durationMs: number;
};

export type CaptureHandle = {
  stop(): Promise<CaptureResult>;
};

export type StartCaptureOptions = {
  maxSeconds: number;
  maxFrames: number;
  maxEdgePx: number;
  onTick?: (elapsedMs: number) => void;
  /** Fired ONCE when the capture ends outside the app's own Stop button —
   *  the user clicked the browser's native "Stop sharing" bar (the display
   *  track's `ended` event) or the maxSeconds auto-stop fired. The client
   *  must respond by running its normal stop flow (`handle.stop()` still
   *  resolves with the full CaptureResult). Without this hook the app never
   *  learns the share ended and the recording is stranded — the exact bug
   *  from the first live test. */
  onEnded?: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function downscaleEdge(width: number, height: number, maxEdgePx: number): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdgePx) return { width, height };
  const scale = maxEdgePx / longEdge;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Grabs one downscaled JPEG keyframe from a live video element via an
 *  offscreen canvas. Returns null if the video has no dimensions yet
 *  (e.g. capture just started) — callers skip that tick rather than crash. */
async function grabFrame(
  video: HTMLVideoElement,
  maxEdgePx: number,
): Promise<Blob | null> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const { width, height } = downscaleEdge(vw, vh, maxEdgePx);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.6);
  });
}

export async function startCapture(opts: StartCaptureOptions): Promise<CaptureHandle> {
  const startedAt = Date.now();

  const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  let audioStream: MediaStream | null = null;
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    // Mic permission denied/unavailable — capture continues video-only.
    audioStream = null;
  }

  const recordedTracks = [...screenStream.getVideoTracks(), ...(audioStream?.getAudioTracks() ?? [])];
  const combinedStream = new MediaStream(recordedTracks);

  const video = document.createElement("video");
  video.srcObject = screenStream;
  video.muted = true;
  await video.play().catch(() => {});

  const recordedChunks: Blob[] = [];
  const recorder = new MediaRecorder(combinedStream, { mimeType: "video/webm" });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  };
  recorder.start();

  const frames: Blob[] = [];
  const transcript: TranscriptSegment[] = [];

  const RecognitionCtor = getSpeechRecognitionCtor();
  let recognition: SpeechRecognitionLike | null = null;
  if (RecognitionCtor) {
    recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const results = (event as { results?: ArrayLike<{ 0: { transcript: string } }> }).results;
      if (!results) return;
      for (let i = 0; i < results.length; i++) {
        const text = results[i]?.[0]?.transcript?.trim();
        if (text) transcript.push({ atMs: Date.now() - startedAt, text });
      }
    };
    recognition.onerror = () => {
      // Feature-detected but failing at runtime (e.g. permission revoked
      // mid-session) — degrade the same as "absent": keep whatever
      // transcript we already captured, stop trying to append more.
    };
    try {
      recognition.start();
    } catch {
      recognition = null;
    }
  }

  let frameTimer: ReturnType<typeof setInterval> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let autoStopTimer: ReturnType<typeof setTimeout> | null = null;

  async function teardown(): Promise<void> {
    if (frameTimer) clearInterval(frameTimer);
    if (tickTimer) clearInterval(tickTimer);
    if (autoStopTimer) clearTimeout(autoStopTimer);
    try {
      recognition?.stop();
    } catch {
      // Already stopped — ignore.
    }
    for (const track of recordedTracks) track.stop();
  }

  // Single-flight: every caller of stop() gets the SAME CaptureResult. The
  // previous early-return-on-stopped fabricated a second result with
  // `video: null`, silently discarding the webm whenever the auto-stop (or
  // the ended-notification path) raced the client's own stop call.
  let stopPromise: Promise<CaptureResult> | null = null;

  async function doStop(): Promise<CaptureResult> {
    await teardown();

    const video = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => resolve(recordedChunks.length ? new Blob(recordedChunks, { type: "video/webm" }) : null);
      if (recorder.state !== "inactive") {
        recorder.stop();
      } else {
        resolve(recordedChunks.length ? new Blob(recordedChunks, { type: "video/webm" }) : null);
      }
    });

    return { frames, transcript, video, durationMs: Date.now() - startedAt };
  }

  function stop(): Promise<CaptureResult> {
    if (!stopPromise) stopPromise = doStop();
    return stopPromise;
  }

  // The share can end WITHOUT the app's Stop button: the browser's native
  // "Stop sharing" bar ends the display track, and the maxSeconds cap fires
  // here. Either way, notify the client exactly once so its normal stop flow
  // (upload + compile) runs; if no onEnded was provided, stop internally so
  // timers/tracks never leak.
  let endedNotified = false;
  function notifyEnded(): void {
    if (endedNotified || stopPromise) return;
    endedNotified = true;
    if (opts.onEnded) {
      opts.onEnded();
    } else {
      void stop();
    }
  }

  const displayTrack = screenStream.getVideoTracks()[0];
  if (displayTrack?.readyState === "ended") {
    // Share was killed while we were still awaiting the mic prompt — the
    // 'ended' event predates our listener. Defer one macrotask so the caller
    // has received (and stored) the handle before its stop flow runs.
    setTimeout(notifyEnded, 0);
  } else {
    displayTrack?.addEventListener("ended", notifyEnded);
  }

  // 1 fps keyframes, capped at opts.maxFrames total.
  frameTimer = setInterval(() => {
    if (frames.length >= opts.maxFrames) return;
    void grabFrame(video, opts.maxEdgePx).then((blob) => {
      if (blob && frames.length < opts.maxFrames) frames.push(blob);
    });
  }, 1000);

  if (opts.onTick) {
    tickTimer = setInterval(() => {
      opts.onTick?.(Date.now() - startedAt);
    }, 250);
  }

  autoStopTimer = setTimeout(() => {
    notifyEnded();
  }, opts.maxSeconds * 1000);

  return { stop };
}
