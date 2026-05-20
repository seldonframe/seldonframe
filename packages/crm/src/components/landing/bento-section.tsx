// Bento grid — six product surfaces in a single visual scan.
//
// Four of the six tiles render real workspace screenshots from
// /public/marketing (CRM + pipeline, booking, forms, automations).
// The remaining two (Email, Pages) keep their CSS-painted previews
// because we don't have screenshots for them yet; they sit alongside
// the real ones without looking out of place.
//
// Layout note: the first two tiles use a fixed h-[280px] frame so
// the top row stays even on md+. The image tiles fill that frame
// with object-cover. Lower-row tiles size to their content.

export function LandingBentoSection() {
  return (
    <section className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 md:py-20">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex h-[280px] flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 md:col-span-2">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">CRM + Pipeline</p>
          <div className="flex-1 overflow-hidden rounded-md border border-zinc-800/60 bg-zinc-950/40">
            <img
              src="/marketing/crm-pipeline.png"
              alt="CRM + pipeline — leads moving from Sarah M. and John K. through qualified and client columns."
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        </div>

        <div className="flex h-[280px] flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 md:col-span-1">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Booking</p>
          <div className="flex-1 overflow-hidden rounded-md border border-zinc-800/60 bg-zinc-950/40">
            <img
              src="/marketing/booking-page.png"
              alt="Public booking page — operator's calendar with open slots highlighted."
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 md:col-span-1">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Forms</p>
          <div className="overflow-hidden rounded-md border border-zinc-800/60 bg-zinc-950/40">
            <img
              src="/marketing/form.png"
              alt="Intake form — branded, fields auto-derived from the workspace's vertical."
              className="aspect-[16/10] w-full object-cover"
              loading="lazy"
            />
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

        <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 md:col-span-3">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Automation Engine</p>
          <div className="overflow-hidden rounded-md border border-zinc-800/60 bg-zinc-950/40">
            <img
              src="/marketing/agents.png"
              alt="Automation engine — speed-to-lead and other agents firing in sequence on a form submission."
              className="aspect-[16/6] w-full object-cover"
              loading="lazy"
            />
          </div>
          <p className="mt-4 text-center text-xs text-zinc-500">Automatically. No Zapier. No manual steps.</p>
        </div>
      </div>
    </section>
  );
}
