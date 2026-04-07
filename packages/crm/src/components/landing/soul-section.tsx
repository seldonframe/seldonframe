export function LandingSoulSection() {
  return (
    <section className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 md:py-20">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Your Soul</p>
          <h2 className="text-3xl font-bold text-zinc-100 md:text-4xl">Set it up once. It works everywhere.</h2>
          <p className="mt-4 leading-relaxed text-zinc-400">
            Right now, you enter your business name in your booking tool. Then again in your email tool. If you change
            your prices, you update them in five places.
          </p>
          <p className="mt-3 leading-relaxed text-zinc-400">
            Your soul is one place. Put your business info in once. Every page, form, and email uses it. Change
            something in your soul — it changes everywhere.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Business Intelligence</p>
          <div className="space-y-3">
            {[
              "What you sell and what you charge",
              "How you talk to clients",
              "What your clients say about you",
              "Questions people always ask",
              "What makes you different",
              "Who you work with best",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-zinc-300">
                <div className="h-1.5 w-1.5 rounded-full bg-[#14b8a6]" />
                {item}
              </div>
            ))}
          </div>
          <div className="mt-6 border-t border-zinc-800 pt-3">
            <p className="text-[11px] italic text-zinc-500">Learns more about your business as you grow.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
