import { Check } from "lucide-react";

export function LandingSeldonItSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 md:py-32">
      <div className="grid items-center gap-16 md:grid-cols-2">
        <div className="order-2 rounded-xl border border-zinc-800 bg-zinc-900 p-1 md:order-1">
          <div className="border-b border-zinc-800 p-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">User</span>
            <div className="mt-2 rounded-lg bg-zinc-800 p-4 text-sm text-zinc-300">
              Build a quiz that scores leads and books top scorers into a free call
            </div>
          </div>
          <div className="p-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Seldon</span>
            <div className="mt-4 space-y-3">
              {[
                { name: "Lead Scoring Quiz", info: "6 questions" },
                { name: "Results Page", info: "different message by score" },
                { name: "Follow-up Email", info: "sent automatically" },
                { name: "Call Booking", info: "synced to your calendar" },
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
            <div className="mt-6 text-xs text-zinc-500">Everything is connected. Everything uses your soul.</div>
          </div>
        </div>
        <div className="order-1 md:order-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Seldon It</span>
          <h2 className="mt-4 text-3xl font-bold text-zinc-100 md:text-4xl">If it doesn&apos;t exist, Seldon it.</h2>
          <p className="mt-6 leading-relaxed text-zinc-400">
            You need a quiz that scores leads and books the good ones. You could build it in four different tools and
            spend a week connecting them.
          </p>
          <p className="mt-4 leading-relaxed text-zinc-400">
            Or you type one sentence. Seldon builds the quiz, the results page, the email, and the booking page. They
            are live in seconds.
          </p>
        </div>
      </div>
    </section>
  );
}
