export function LandingBentoSection() {
  return (
    <section className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 md:py-20">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex h-[280px] flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 md:col-span-2">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">CRM + Pipeline</p>
          <div className="grid flex-1 grid-cols-3 gap-3 overflow-hidden">
            {[
              { status: "Lead", names: ["Sarah M.", "John K."] },
              { status: "Qualified", names: ["Mike R.", "Amy L."] },
              { status: "Client", names: ["Lisa T.", "David P."] },
            ].map((column, i) => (
              <div key={column.status} className="rounded-lg border border-zinc-800/50 bg-[#050505]/50 p-2">
                <p className="mb-2 text-[10px] font-bold uppercase text-zinc-600">{column.status}</p>
                <div className="space-y-2">
                  {column.names.map((name, nameIndex) => (
                    <div
                      key={name}
                      className={`rounded border border-zinc-700/50 bg-zinc-800 p-2 ${
                        i === 0 && nameIndex === 0 ? "border-l-2 border-l-[#14b8a6]" : ""
                      }`}
                    >
                      <p className="text-[11px] font-medium text-zinc-300">{name}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex h-[280px] flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 md:col-span-1">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Booking</p>
          <div className="flex flex-1 flex-col">
            <div className="mb-2 grid grid-cols-5 gap-1">
              {["M", "T", "W", "T", "F"].map((day) => (
                <span key={day} className="text-center text-[9px] font-bold text-zinc-600">
                  {day}
                </span>
              ))}
            </div>
            <div className="space-y-1">
              {[9, 10, 11].map((time) => (
                <div key={time} className="flex items-center gap-2">
                  <span className="w-8 text-[9px] text-zinc-700">{time}:00</span>
                  <div className="grid flex-1 grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((d) => (
                      <div
                        key={d}
                        className={`h-4 rounded-sm border border-zinc-800/50 ${
                          time === 10 && d === 2
                            ? "border-[#14b8a6]/20 bg-[#14b8a6]"
                            : d % 2 === 0
                              ? "bg-zinc-800/30"
                              : "bg-[#050505]/50"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-auto rounded border border-zinc-800 bg-zinc-800/50 p-2">
              <p className="text-[10px] font-bold text-[#14b8a6]">10:30 AM — Sarah M.</p>
              <p className="text-[9px] text-zinc-500">Discovery Call</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 md:col-span-1">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Forms</p>
          <div className="space-y-3">
            {["Name", "Email", "Budget"].map((label) => (
              <div key={label} className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-zinc-600">{label}</label>
                <div className="h-8 rounded border border-zinc-800 bg-[#050505]/50" />
              </div>
            ))}
            <button className="mt-2 h-8 w-full rounded bg-[#14b8a6] text-[11px] font-bold text-white">Submit</button>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 md:col-span-1">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Email</p>
          <div className="space-y-2 rounded-lg border border-zinc-800 bg-[#050505]/50 p-3">
            <p className="text-[11px] font-bold text-zinc-200">Re: Next Steps</p>
            <p className="text-[9px] text-zinc-500">To: Sarah M.</p>
            <div className="space-y-1 pt-2">
              <div className="h-1.5 w-full rounded bg-zinc-800" />
              <div className="h-1.5 w-full rounded bg-zinc-800" />
              <div className="h-1.5 w-3/4 rounded bg-zinc-800" />
            </div>
            <div className="pt-2">
              <button className="h-7 w-full rounded border border-[#14b8a6]/30 bg-[#14b8a6]/20 text-[10px] font-bold text-[#14b8a6]">
                Book Your Call →
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 md:col-span-1">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Pages</p>
          <div className="overflow-hidden rounded border border-zinc-800 bg-[#050505]/50">
            <div className="flex h-10 items-center justify-center bg-zinc-800/30">
              <div className="h-1.5 w-1/2 rounded bg-zinc-700" />
            </div>
            <div className="grid grid-cols-3 gap-1 p-2">
              <div className="h-6 rounded bg-zinc-800/20" />
              <div className="h-6 rounded bg-zinc-800/20" />
              <div className="h-6 rounded bg-zinc-800/20" />
            </div>
            <div className="flex justify-center p-2 pt-0">
              <div className="h-4 w-12 rounded bg-[#14b8a6]/20" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 md:col-span-3">
          <p className="mb-8 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Automation Engine</p>
          <div className="relative mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 md:flex-row">
            <div className="absolute left-[5%] top-[12px] z-0 hidden h-px w-[90%] bg-zinc-800 md:block" />
            {[
              { label: "Form Filled", active: true },
              { label: "Added to CRM", active: false },
              { label: "Email Sent", active: false },
              { label: "Call Booked", active: false },
              { label: "On Calendar", active: false },
            ].map((node, i) => (
              <div key={node.label} className="group relative z-10 flex flex-col items-center gap-2">
                <div
                  className={`flex h-6 items-center justify-center rounded-full border px-3 transition-colors ${
                    node.active
                      ? "border-[#14b8a6] bg-[#14b8a6] text-white"
                      : "border-zinc-700 bg-zinc-800 text-zinc-400"
                  }`}
                >
                  <span className="whitespace-nowrap text-[10px] font-bold">{node.label}</span>
                </div>
                {i < 4 ? <div className="h-4 w-px bg-zinc-800 md:hidden" /> : null}
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-xs text-zinc-500">Automatically. No Zapier. No manual steps.</p>
        </div>
      </div>
    </section>
  );
}
