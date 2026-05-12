"use client";

// v1.41.0 — rAF-driven crossfade <video> for cinematic landing pages.
//
// Manual loop (loop attribute OFF) with smooth opacity fade-in at start
// and 0.55s fade-out before end. Each new fade cancels the previous rAF
// so animations don't compete. On `ended`, opacity → 0, then 100ms later
// currentTime resets to 0, play() restarts, and we fade back in.
//
// Why not CSS transitions: we want fades to resume from the *current*
// opacity, not snap. CSS transitions reset to the start on each new
// transition.

import { useEffect, useRef } from "react";

const FADE_MS = 500;
const FADE_OUT_LEAD_S = 0.55;

export function FadingVideo({
  src,
  poster,
  className = "",
  style,
}: {
  src: string;
  poster?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const fadingOutRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const cancelRaf = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };

    const fadeTo = (target: number, durationMs = FADE_MS) => {
      cancelRaf();
      const startOpacity = Number.parseFloat(video.style.opacity || "0");
      const startTs = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTs;
        const t = Math.min(1, elapsed / durationMs);
        const next = startOpacity + (target - startOpacity) * t;
        video.style.opacity = String(next);
        if (t < 1) {
          rafIdRef.current = requestAnimationFrame(step);
        } else {
          rafIdRef.current = null;
        }
      };
      rafIdRef.current = requestAnimationFrame(step);
    };

    const onLoadedData = () => {
      video.style.opacity = "0";
      void video.play().catch(() => {
        // Autoplay can be blocked on some browsers/devices. Leave the
        // poster image showing rather than fighting the browser.
      });
      fadeTo(1);
    };

    const onTimeUpdate = () => {
      if (fadingOutRef.current) return;
      const remaining = (video.duration || 0) - video.currentTime;
      if (remaining > 0 && remaining <= FADE_OUT_LEAD_S) {
        fadingOutRef.current = true;
        fadeTo(0);
      }
    };

    const onEnded = () => {
      video.style.opacity = "0";
      setTimeout(() => {
        try {
          video.currentTime = 0;
          fadingOutRef.current = false;
          void video.play().catch(() => {});
          fadeTo(1);
        } catch {
          // If something throws (browser restrictions), just stop the loop.
        }
      }, 100);
    };

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);

    // If the video was already buffered (e.g. via SSR cache), loadeddata
    // might have already fired by the time the effect mounts. Kick it
    // manually in that case.
    if (video.readyState >= 2) {
      onLoadedData();
    }

    return () => {
      cancelRaf();
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      autoPlay
      muted
      playsInline
      preload="auto"
      // loop is intentionally OFF — manual loop via the `ended` listener
      // so we can crossfade between cycles.
      className={className}
      style={{ opacity: 0, ...style }}
    />
  );
}
