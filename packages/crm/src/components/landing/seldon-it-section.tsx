import { Check } from "lucide-react";

export function LandingSeldonItSection() {
  return (
    <section className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 md:py-20">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div className="order-2 rounded-xl border border-zinc-800 bg-zinc-900 p-1 md:order-1">
          <div className="border-b border-zinc-800 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Prompt</p>
            <div className="rounded-lg bg-zinc-800 p-3 text-sm text-zinc-300">
              Build a quiz that scores leads and books top scorers into a free call
            </div>
          </div>
          <div className="p-3">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Live Output</p>
            <div className="space-y-2">
              {[
                { name: "Lead Scoring Quiz", info: "6 questions" },
                { name: "Results Page", info: "dynamic logic" },
                { name: "Follow-up Email", info: "instant" },
                { name: "Call Booking", info: "calendar sync" },
              ].map((tool) => (
                <div key={tool.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <Check size={14} className="text-[#14b8a6]" />
                    {tool.name}
                  </div>
                  <span className="text-[10px] text-zinc-600">{tool.info}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 text-[11px] text-zinc-500">Connected to your soul. Ready to go live.</div>
          </div>
        </div>
        <div className="order-1 md:order-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Seldon It</p>
          <h2 className="text-3xl font-bold text-zinc-100 md:text-4xl">If it doesn&apos;t exist, Seldon it.</h2>
          <p className="mt-4 leading-relaxed text-zinc-400">
            Describe the tool you need in plain English. Seldon builds the quiz, the results page, the email, and the
            booking page in seconds.
          </p>
          <p className="mt-3 leading-relaxed text-zinc-400">
            They aren&apos;t just templates. They are production-ready tools linked directly to your business data and
            logic.
          </p>
        </div>
      </div>
    </section>
  );
}
