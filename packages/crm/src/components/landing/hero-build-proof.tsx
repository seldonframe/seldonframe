// packages/crm/src/components/landing/hero-build-proof.tsx
//
// Task 2 (onboarding-batch-2, #6) — above-the-fold "watch it build" proof
// panel for the marketing hero. Sits beside (desktop) or below (mobile) the
// paste-and-go form so a visitor can see a real 60-second build before they
// commit to anything.
//
// Asset: public/marketing/walkthrough/spin-up-60-seconds.mp4, real encoded
// size 1728x1080 (read from the file's tkhd atom — no ffprobe on this box),
// i.e. an 8:5 (1.6:1) aspect ratio. The box below reserves that ratio so
// there's zero layout shift while the video is still `preload="none"`.
//
// Poster: public/shots/rapid-rooter-plumbing-828a.jpg — the first slug in
// LIVE_DEMOS (marketing-demo-marquee.tsx). Its native size is 1200x806
// (~1.49:1), a little squarer than the video's 1.6:1 box, so it's rendered
// with object-cover to fill the frame without distortion.
//
// prefers-reduced-motion: reduce → we never autoplay. Render the poster as a
// static <img> with a visible play button; clicking swaps in the real
// <video> (a user-initiated play, which is allowed even under the
// reduced-motion media query — the guidance is against motion the user did
// not ask for, not against motion on request).

"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";

const VIDEO_SRC = "/marketing/walkthrough/spin-up-60-seconds.mp4";
const POSTER_SRC = "/shots/rapid-rooter-plumbing-828a.jpg";

export function HeroBuildProof({
  ungatedBuildEnabled = false,
}: {
  ungatedBuildEnabled?: boolean;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const showVideo = !reduceMotion || playing;

  return (
    <div className="flex w-full flex-col items-center gap-3 lg:items-start">
      <div className="relative aspect-[8/5] w-full max-w-[520px] overflow-hidden rounded-[18px] border border-[rgba(34,29,23,.14)] bg-[#FFFDFA] shadow-[0_1px_2px_rgba(34,29,23,.06),0_10px_30px_rgba(34,29,23,.08)]">
        {showVideo ? (
          <video
            src={VIDEO_SRC}
            muted
            autoPlay
            loop
            playsInline
            preload="none"
            poster={POSTER_SRC}
            controls={reduceMotion}
            className="size-full object-cover"
          />
        ) : (
          <>
            <img
              src={POSTER_SRC}
              alt="Preview of a SeldonFrame workspace being built"
              className="size-full object-cover"
            />
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label="Play the 60-second build video"
              className="absolute inset-0 flex items-center justify-center bg-[#221D17]/25 transition-colors hover:bg-[#221D17]/35"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-[#FFFDFA] text-[#221D17] shadow-[0_6px_20px_rgba(34,29,23,.28)] transition-transform hover:scale-105">
                <Play size={22} fill="currentColor" aria-hidden />
              </span>
            </button>
          </>
        )}
      </div>

      <p className="text-center text-[13.5px] leading-[1.5] text-[#6E665A] lg:text-left">
        A real build — 60 seconds, unedited.
      </p>

      <a
        href={ungatedBuildEnabled ? "/try" : "/signup"}
        className="text-[13.5px] font-[500] text-[#00897B] transition-colors hover:text-[#00796B]"
      >
        Try it with your URL →
      </a>
    </div>
  );
}
