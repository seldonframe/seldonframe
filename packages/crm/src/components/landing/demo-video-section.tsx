// Cut C Phase 3 — Demo video section.
//
// Shipped: live walkthrough recorded post-Cut B. The MP4 lives at
// /marketing/walkthrough/spin-up-60-seconds.mp4; the GIF serves as
// both the poster frame and as a no-video fallback for clients that
// don't support <video>.
export function LandingDemoVideoSection() {
  return (
    <section
      id="demo"
      // tabIndex=-1 makes the section a programmatic focus target so
      // the hero's "Watch the 60-second build" CTA (href="#demo")
      // moves focus here on jump for screen reader announcement
      // (a11y-review N2). Does not enter the natural Tab order.
      tabIndex={-1}
      aria-labelledby="demo-heading"
      className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 outline-none md:py-20"
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
        <video
          src="/marketing/walkthrough/spin-up-60-seconds.mp4"
          poster="/marketing/walkthrough/spin-up-60-seconds.gif"
          controls
          preload="metadata"
          playsInline
          className="aspect-video w-full rounded-2xl bg-zinc-100 object-cover shadow-(--shadow-card)"
        >
          Your browser doesn&apos;t support video.{" "}
          <a href="/marketing/walkthrough/spin-up-60-seconds.gif">View GIF</a>
        </video>
        <p className="border-t border-zinc-800/50 bg-zinc-950 px-6 py-3 text-center text-xs text-zinc-400">
          Live walkthrough — paste a URL, get a workspace.
        </p>
      </div>
    </section>
  );
}
