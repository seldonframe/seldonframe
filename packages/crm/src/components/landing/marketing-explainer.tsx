// packages/crm/src/components/landing/marketing-explainer.tsx
//
// The launch explainer — the one place on the homepage that tells the whole
// story in a minute (title → one sentence builds a real medspa front office →
// natural-language edits → the tools it plugs into → own it / leave anytime →
// $99 flat → CTA). Source project: `launch-video/` (Remotion `MasterV2`,
// scene timings in launch-video/src/theme.ts).
//
// Placement (unified-landing.tsx, buildStack only — never recordStack): between
// MarketingHero and MarketingIdeStrip. It deliberately carries NO bg override so
// it reads as a continuation of the hero's base parchment; MarketingIdeStrip's
// #EFE9DD band supplies the next beat's contrast. Two adjacent bands would flatten
// the page.
//
// Click-to-play, not autoplay: the asset is ~8 MB. Autoloading it would wreck LCP
// and burn bandwidth on every homepage visit for a video most visitors never
// start — the same call `hero-build-proof.tsx` made at 62 MB (perf review
// 2026-07-04), and this file borrows that component's visual language (#FFFDFA
// card, rgba(34,29,23,.14) border, #221D17/#6E665A ink) rather than inventing a
// second video idiom. Poster-only until click means zero video bytes by default.
//
// The 16/9 box is reserved up front so the poster→video swap causes no layout
// shift. 16/9 is the asset's true encoded ratio (1920x1080) — unlike
// hero-build-proof's 8/5, which matches a differently-encoded asset.
//
// EXPLAINER_DURATION_LABEL is a constant rather than prose in the headline so a
// re-cut of the video is a one-line change and can never leave a stale duration
// claim on the page.

"use client";

import { useState } from "react";
import { Play } from "lucide-react";

// Hosted on Vercel Blob, not in public/ — an 8 MB binary in git would ship in
// every clone and every deploy (see the 77 MB of orphaned walkthrough video that
// arrived that way in 8aec9fd1d). Swapping a re-cut = replace this one URL.
const EXPLAINER_VIDEO_URL = "/marketing/seldonframe-explainer.mp4";
const POSTER_SRC = "/marketing/explainer-poster.jpg";
// m:ss, the video-thumbnail convention (68s reads as "1:08").
const EXPLAINER_DURATION_LABEL = "1:08";

// The workspace on screen in the video is a real, live one — the same one the
// README lists as a demo. Linking it makes the video's claim checkable instead of
// asking the visitor to take a rendered screenshot on faith.
const DEMO_WORKSPACE_URL = "https://app.seldonframe.com/w/metro-medspa-9d24";

export function MarketingExplainer() {
  const [playing, setPlaying] = useState(false);

  return (
    <section
      id="explainer"
      // Programmatic focus target so any "watch the explainer" jump link moves
      // screen-reader focus here on arrival. Not in the natural Tab order.
      tabIndex={-1}
      aria-labelledby="explainer-heading"
      className="px-5 py-14 outline-none md:py-20"
    >
      <div className="mx-auto flex max-w-[1120px] flex-col items-center">
        <p className="text-[13.5px] font-[600] uppercase tracking-[0.08em] text-[#6E665A]">
          Watch
        </p>
        <h2
          id="explainer-heading"
          className="mt-2 max-w-[24ch] text-balance text-center text-[clamp(24px,3.2vw,38px)] font-[500] leading-[1.12] tracking-[-0.025em] text-[#221D17]"
        >
          The whole thing, end to end.
        </h2>
        <p className="mt-4 max-w-[62ch] text-pretty text-center text-[clamp(15px,1.6vw,17px)] leading-[1.55] text-[#6E665A]">
          One sentence becomes a live front office — site, booking, CRM, and an agent
          that answers. Then it&apos;s yours: open source, self-hostable, leave anytime.
        </p>

        <div className="mt-9 w-full max-w-[900px]">
          <div className="relative aspect-video w-full overflow-hidden rounded-[18px] border border-[rgba(34,29,23,.14)] bg-[#FFFDFA] shadow-[0_1px_2px_rgba(34,29,23,.06),0_10px_30px_rgba(34,29,23,.08)]">
            {playing ? (
              <video
                src={EXPLAINER_VIDEO_URL}
                poster={POSTER_SRC}
                autoPlay
                controls
                playsInline
                preload="auto"
                className="size-full object-cover"
              >
                {/* Reached only if the browser can't play the source at all. */}
                Your browser can&apos;t play this video —{" "}
                <a href={EXPLAINER_VIDEO_URL}>download it instead</a>.
              </video>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- static marketing still, already sized; next/image adds no value and a fetch hop */}
                <img
                  src={POSTER_SRC}
                  alt="A SeldonFrame workspace built from one sentence — the live Metro Medspa site, with site, CRM, and calendar checked off"
                  className="size-full object-cover"
                />
                {/* No dark scrim over the poster. hero-build-proof.tsx washes its
                    poster with #221D17/25 because that poster is a busy colour
                    screenshot that a white button would disappear into. This poster
                    is cream parchment — the same wash just greys it out, and the
                    forest button already carries the contrast on its own. Hover
                    darkens slightly for affordance; that's all it needs. */}
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  aria-label={`Play the SeldonFrame explainer (${EXPLAINER_DURATION_LABEL})`}
                  className="group absolute inset-0 flex items-center justify-center transition-colors hover:bg-[#221D17]/10"
                >
                  <span className="flex size-16 items-center justify-center rounded-full bg-[#1F2B24] text-[#F6F2EA] shadow-[0_6px_20px_rgba(34,29,23,.28)] transition-transform group-hover:scale-105">
                    {/* Optical centring: a triangle's visual centre sits left of its
                        bounding box's centre. */}
                    <Play size={24} fill="currentColor" className="translate-x-[1.5px]" aria-hidden />
                  </span>
                </button>
                {/* The duration carries its own dark chip rather than sitting as
                    cream text on the poster — on this cream frame that text was
                    legible ONLY because of the scrim above, so removing the scrim
                    without this would have made it invisible. */}
                <span className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-[6px] bg-[#221D17]/85 px-1.5 py-0.5 text-[11px] font-[500] tabular-nums text-[#F6F2EA]">
                  {EXPLAINER_DURATION_LABEL}
                </span>
              </>
            )}
          </div>

          <p className="mt-3 text-center text-[13px] leading-[1.5] text-[#6E665A]">
            The workspace in the video is live —{" "}
            <a
              href={DEMO_WORKSPACE_URL}
              className="font-[500] text-[#1F2B24] underline underline-offset-2 transition-colors hover:text-[#16201B]"
            >
              see it for yourself
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
