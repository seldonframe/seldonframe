// Bento grid — four product surfaces in a single visual scan.
//
// All four tiles render real workspace screenshots from
// /public/marketing (CRM + pipeline, booking, forms, automations).
// The deck reads as a tight 2x2 sampler of the operator dashboard.
//
// Layout note: every tile uses a fixed h-[280px] frame so both rows
// stay even on md+. The top row mirrors the bottom row's rhythm with
// an asymmetric 2/1 + 1/2 split — the wide tiles are CRM (top-left)
// and Automation Engine (bottom-right), the focused tiles are Booking
// (top-right) and Forms (bottom-left). Image tiles fill the frame
// with object-cover.

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

        <div className="flex h-[280px] flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 md:col-span-1">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Forms</p>
          <div className="flex-1 overflow-hidden rounded-md border border-zinc-800/60 bg-zinc-950/40">
            <img
              src="/marketing/form.png"
              alt="Intake form — branded, fields auto-derived from the workspace's vertical."
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        </div>

        <div className="flex h-[280px] flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 md:col-span-2">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Automation Engine</p>
          <div className="flex-1 overflow-hidden rounded-md border border-zinc-800/60 bg-zinc-950/40">
            <img
              src="/marketing/agents.png"
              alt="Automation engine — speed-to-lead and other agents firing in sequence on a form submission."
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
