import { Check } from "lucide-react";

export function LandingComparisonSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 md:py-32">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 opacity-60">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Without SeldonFrame</span>
          <div className="mt-8 space-y-4 text-sm text-zinc-500">
            <p>Five different logins</p>
            <p>Set up your brand in each one separately</p>
            <p>Copy-paste contacts between tools</p>
            <p>Automations break when something updates</p>
            <p>AI gives you generic text that could be anyone&apos;s</p>
            <div className="mt-4 border-t border-zinc-800 pt-4 text-zinc-400">
              Change your service name → update it everywhere manually
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 border-l-2 border-l-[#14b8a6] bg-zinc-900 p-8">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">With SeldonFrame</span>
          <div className="mt-8 space-y-4">
            {[
              "One login",
              "Set up your business once",
              "Everything shares the same data",
              "Blocks connect automatically",
              "Content sounds like you",
              "Change something once → it updates everywhere",
            ].map((text) => (
              <div key={text} className="flex items-center gap-3 text-sm text-zinc-300">
                <Check size={14} className="text-[#14b8a6]" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
