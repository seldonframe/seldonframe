export function LandingBentoSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 md:py-32">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="min-h-[240px] rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:col-span-2">
          <div className="flex h-full flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">CRM + Pipeline</span>
            <div className="mt-8 flex h-full items-end gap-3 pb-2">
              {[1, 2, 3].map((col) => (
                <div
                  key={col}
                  className="h-32 flex-1 space-y-2 rounded-lg border border-zinc-800/50 bg-zinc-950/50 p-2"
                >
                  <div className="h-1 w-8 rounded bg-zinc-800" />
                  <div className="flex h-10 items-center rounded bg-zinc-800/40 px-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#14b8a6]" />
                  </div>
                  {col === 1 ? <div className="h-10 rounded bg-zinc-800/40" /> : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:col-span-1">
          <div className="flex h-full flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Booking</span>
            <div className="mt-8 grid grid-cols-7 gap-1">
              {[...Array(21)].map((_, i) => (
                <div
                  key={i}
                  className={`aspect-square rounded-sm border border-zinc-800 ${i === 12 ? "relative bg-[#14b8a6]/20" : "bg-zinc-950/30"}`}
                >
                  {i === 12 ? <div className="absolute inset-0 m-auto h-1 w-1 rounded-full bg-[#14b8a6]" /> : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:col-span-1">
          <div className="flex h-full flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Forms</span>
            <div className="mt-8 space-y-2">
              <div className="h-2 w-full rounded bg-zinc-800/50" />
              <div className="h-2 w-full rounded bg-zinc-800/50" />
              <div className="h-2 w-2/3 rounded bg-zinc-800/50" />
              <div className="mt-4 flex h-6 w-full items-center justify-center rounded-md bg-zinc-800/80">
                <div className="h-1 w-4 rounded bg-zinc-700" />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:col-span-1">
          <div className="flex h-full flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Email</span>
            <div className="mt-8 space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <div className="mb-4 h-1 w-1/3 rounded bg-zinc-700" />
              <div className="h-1 w-full rounded bg-zinc-800" />
              <div className="h-1 w-full rounded bg-zinc-800" />
              <div className="mx-auto mt-4 h-4 w-1/2 rounded bg-[#14b8a6]/20" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:col-span-1">
          <div className="flex h-full flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Pages</span>
            <div className="mt-8 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/50">
              <div className="h-12 bg-zinc-800/30" />
              <div className="flex gap-2 p-2">
                <div className="h-8 flex-1 rounded bg-zinc-800/20" />
                <div className="h-8 flex-1 rounded bg-zinc-800/20" />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 md:col-span-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">The Flow</span>
          <div className="relative mx-auto mt-10 flex max-w-3xl items-center justify-between">
            <div className="absolute top-1/2 z-0 h-px w-full -translate-y-1/2 bg-zinc-800" />
            {["Form", "CRM", "Email", "Booking", "Calendar"].map((node, i) => (
              <div key={node} className="relative z-10 flex flex-col items-center gap-3">
                <div
                  className={`h-3 w-3 rounded-full border-2 border-zinc-900 ${i === 0 ? "bg-[#14b8a6]" : "bg-zinc-700"}`}
                />
                <span className="text-[10px] font-medium text-zinc-500">{node}</span>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-12 max-w-2xl text-center text-sm leading-relaxed text-zinc-400">
            Someone fills your form. They show up in your CRM. They get an email. They book a call. It&apos;s on your
            calendar. <span className="text-zinc-100">Automatically.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
