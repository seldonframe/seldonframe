import Image from "next/image";
import { Play } from "lucide-react";

// Cut C Phase 3 — Demo video section (week-5 placeholder).
//
// The marketing plan calls for a 60-second narrated demo as the
// centerpiece, but the recording happens in week 6 (Phase 9) once
// Cuts A + B are shipped to prod and the real product flow can be
// captured. Week 5 ships this shell with a placeholder GIF so the
// real video can swap in by replacing /marketing/demo-video.mp4 +
// flipping a couple of lines here.
export function LandingDemoVideoSection() {
  return (
    <section
      id="demo"
      aria-labelledby="demo-heading"
      className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 md:py-20"
    >
      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          See it in action
        </p>
        <h2 id="demo-heading" className="text-3xl font-bold text-zinc-100 md:text-4xl">
          60 seconds. Paste to live workspace.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
          Sign up, paste a client URL, and watch the CRM, booking page, intake form, AI chatbot, and demo
          portal build themselves — narrated, end-to-end, in one minute.
        </p>
      </div>

      <div className="mx-auto mt-10 w-full max-w-4xl overflow-hidden rounded-xl border border-zinc-800/50 bg-zinc-900">
        {/* Week 5: placeholder frame with centered Play affordance so the empty
            box reads as "video placeholder", not "broken image". Week 6 swaps
            in the real demo asset and removes the Play icon overlay. */}
        <div className="relative aspect-video w-full motion-reduce:hidden">
          <Image
            src="/marketing/demo-placeholder.gif"
            alt=""
            role="presentation"
            fill
            className="object-cover"
            unoptimized
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3"
          >
            <Play size={64} className="text-[#14b8a6] opacity-40" />
            <p className="text-sm text-zinc-500">Walkthrough recording in progress</p>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="hidden h-[60px] items-center justify-center bg-zinc-900 px-6 text-sm text-zinc-500 motion-reduce:flex"
        >
          Animated preview hidden because you prefer reduced motion. Full narrated demo lands soon.
        </div>
        <p className="border-t border-zinc-800/50 bg-zinc-950 px-6 py-3 text-center text-xs text-zinc-400">
          Polished 60-second walkthrough lands in week 6.
        </p>
      </div>
    </section>
  );
}
