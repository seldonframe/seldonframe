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
// there's zero layout shift between the poster state and the mounted video.
//
// Poster: public/shots/rapid-rooter-plumbing-828a.jpg — the first slug in
// LIVE_DEMOS (marketing-demo-marquee.tsx). Its native size is 1200x806
// (~1.49:1), a little squarer than the video's 1.6:1 box, so it's rendered
// with object-cover to fill the frame without distortion.
//
// Click-to-play chosen because the video asset is 62.6 MB — autoloading would
// wreck LCP and bandwidth on every homepage visit. All visitors see the poster
// + play button; click swaps in the <video> for user-initiated playback.
// (Perf review 2026-07-04)

"use client";

import { useState } from "react";
import { Play } from "lucide-react";

const VIDEO_SRC = "/marketing/walkthrough/spin-up-60-seconds.mp4";
// Poster = the first LIVE_DEMOS slug's screenshot (keep in sync with
// marketing-demo-marquee.tsx's first entry).
const POSTER_SRC = "/shots/j-marin-heating-air-conditioning-9599.jpg";

export function HeroBuildProof({
  ungatedBuildEnabled = false,
}: {
  ungatedBuildEnabled?: boolean;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="flex w-full flex-col items-center gap-3 lg:items-start">
      <div className="relative aspect-[8/5] w-full max-w-[520px] overflow-hidden rounded-[18px] border border-[rgba(34,29,23,.14)] bg-[#FFFDFA] shadow-[0_1px_2px_rgba(34,29,23,.06),0_10px_30px_rgba(34,29,23,.08)]">
        {playing ? (
          <video
            src={VIDEO_SRC}
            muted
            autoPlay
            loop
            playsInline
            preload="auto"
            poster={POSTER_SRC}
            controls
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
              <span className="flex flex-col items-center justify-center gap-1">
                <span className="flex size-14 items-center justify-center rounded-full bg-[#FFFDFA] text-[#221D17] shadow-[0_6px_20px_rgba(34,29,23,.28)] transition-transform hover:scale-105">
                  <Play size={22} fill="currentColor" aria-hidden />
                </span>
                <span className="text-[11px] font-[500] text-[#FFFDFA]">60s</span>
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
