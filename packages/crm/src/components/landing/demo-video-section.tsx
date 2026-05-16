import Image from "next/image";

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
          60 seconds. Signup to live workspace.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
          Watch the full flow: sign up with Google, paste a client URL, and walk through the CRM, booking
          page, intake form, AI chatbot, and demo portal that get built in under a minute.
        </p>
      </div>

      <div className="mt-10 overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900">
        <Image
          src="/marketing/demo-placeholder.gif"
          alt=""
          role="presentation"
          width={1280}
          height={720}
          className="h-auto w-full motion-reduce:hidden"
          unoptimized
        />
        <div
          aria-hidden="true"
          className="hidden h-[60px] items-center justify-center bg-zinc-900 px-6 text-sm text-zinc-500 motion-reduce:flex"
        >
          Animated preview hidden because you prefer reduced motion. The full narrated demo lands soon.
        </div>
        <p className="border-t border-zinc-800/50 bg-zinc-950 px-6 py-3 text-center text-xs text-zinc-400">
          Polished 60-second narrated demo ships in week 6.
        </p>
      </div>
    </section>
  );
}
