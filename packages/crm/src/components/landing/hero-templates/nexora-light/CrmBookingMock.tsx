// v1.43.0 — Generic CRM + booking dashboard mockup for nexora-light hero.
//
// Static, presentational. Mirrors the structure of every SeldonFrame
// workspace (CRM pipeline + booking calendar) so the hero doubles as
// a product preview: "this is what you actually get."
//
// Pure SVG/Tailwind — no live data, no API calls. The visual signature
// matches Nexora's reference (frosted-glass wrapper, small text, dense
// info layout) but the content is operator-shaped instead of fake bank.

import { Calendar, Users, Inbox, CheckCircle2, Search, Bell, Plus } from "lucide-react";

const PIPELINE_STAGES = [
  { label: "Inquiry", count: 8, color: "#94a3b8" },
  { label: "Discovery", count: 5, color: "#6366f1" },
  { label: "Proposal", count: 3, color: "#10b981" },
  { label: "Active", count: 11, color: "#0a0a0a" },
];

const RECENT_CONTACTS = [
  { name: "Sarah Chen", company: "Acme Co.", stage: "Discovery", initial: "SC" },
  { name: "Marcus Lee", company: "Bright Lab", stage: "Active", initial: "ML" },
  { name: "Priya Singh", company: "Independent", stage: "Inquiry", initial: "PS" },
  { name: "Jordan Reeve", company: "Forge Studio", stage: "Proposal", initial: "JR" },
];

const UPCOMING_BOOKINGS = [
  { time: "9:00 AM", label: "Strategy Call · Sarah Chen", today: true },
  { time: "11:30 AM", label: "Discovery · Marcus Lee", today: true },
  { time: "2:00 PM", label: "Onboarding · Forge Studio", today: false },
  { time: "4:30 PM", label: "Follow-up · Priya Singh", today: false },
];

function StageDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export function CrmBookingMock() {
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl"
      style={{
        background: "rgba(255,255,255,0.55)",
        border: "1px solid rgba(255,255,255,0.6)",
        boxShadow: "0 25px 80px -12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 border-b border-black/5 bg-white/40 px-3 py-2.5 md:px-4">
        <div className="flex items-center gap-2">
          <div className="flex size-5 items-center justify-center rounded bg-[#0a0a0a] text-[10px] font-semibold text-white">
            W
          </div>
          <span className="text-[11px] font-semibold text-[#0a0a0a]">
            Your Workspace
          </span>
        </div>
        <div className="hidden flex-1 items-center gap-1.5 rounded-md bg-black/[0.04] px-2 py-1 md:flex">
          <Search className="size-3 text-[#0a0a0a]/40" strokeWidth={2} />
          <span className="text-[10px] text-[#0a0a0a]/40">Search</span>
          <span className="ml-auto rounded border border-black/10 px-1 text-[9px] text-[#0a0a0a]/50">
            ⌘K
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Bell className="size-3.5 text-[#0a0a0a]/60" strokeWidth={2} />
          <div className="flex size-5 items-center justify-center rounded-full bg-[#0a0a0a]/10 text-[9px] font-medium text-[#0a0a0a]">
            JB
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12">
        {/* Sidebar */}
        <aside className="col-span-3 hidden border-r border-black/5 bg-white/30 p-2.5 md:block">
          <button className="mb-3 flex w-full items-center gap-1.5 rounded-md bg-[#0a0a0a] px-2 py-1.5 text-[10px] font-semibold text-white">
            <Plus className="size-3" strokeWidth={2.5} />
            New
          </button>
          {[
            { label: "Pipeline", icon: Inbox, active: true, count: 27 },
            { label: "Contacts", icon: Users, active: false, count: 156 },
            { label: "Bookings", icon: Calendar, active: false, count: 12 },
            { label: "Completed", icon: CheckCircle2, active: false, count: 84 },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={
                  "flex items-center gap-2 rounded px-2 py-1 text-[10px] " +
                  (item.active
                    ? "bg-[#0a0a0a]/10 text-[#0a0a0a]"
                    : "text-[#0a0a0a]/60")
                }
              >
                <Icon className="size-3" strokeWidth={2} />
                <span className="flex-1">{item.label}</span>
                <span className="text-[#0a0a0a]/40">{item.count}</span>
              </div>
            );
          })}
        </aside>

        {/* Main */}
        <main className="col-span-12 p-3 md:col-span-9 md:p-4">
          {/* Pipeline strip */}
          <div className="mb-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold text-[#0a0a0a]">Pipeline</h3>
              <span className="text-[10px] text-[#0a0a0a]/50">27 active</span>
            </div>
            <div className="flex gap-1.5">
              {PIPELINE_STAGES.map((stage) => (
                <div
                  key={stage.label}
                  className="flex-1 rounded-md border border-black/5 bg-white/60 px-2 py-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <StageDot color={stage.color} />
                    <span className="text-[9px] font-medium text-[#0a0a0a]/70">
                      {stage.label}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[14px] font-semibold text-[#0a0a0a]">
                    {stage.count}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Two-column: contacts + bookings */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* Recent contacts */}
            <div className="rounded-md border border-black/5 bg-white/60 p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-semibold text-[#0a0a0a]">
                  Recent contacts
                </h3>
                <span className="text-[9px] text-[#0a0a0a]/40">156 total</span>
              </div>
              <div className="space-y-1">
                {RECENT_CONTACTS.map((c) => (
                  <div key={c.name} className="flex items-center gap-2">
                    <div className="flex size-5 items-center justify-center rounded-full bg-[#0a0a0a]/10 text-[9px] font-semibold text-[#0a0a0a]/70">
                      {c.initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[10px] font-medium text-[#0a0a0a]">
                        {c.name}
                      </div>
                      <div className="truncate text-[9px] text-[#0a0a0a]/50">
                        {c.company}
                      </div>
                    </div>
                    <span className="text-[9px] text-[#0a0a0a]/50">{c.stage}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming bookings */}
            <div className="rounded-md border border-black/5 bg-white/60 p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-semibold text-[#0a0a0a]">
                  Today &amp; tomorrow
                </h3>
                <span className="text-[9px] text-[#0a0a0a]/40">12 bookings</span>
              </div>
              <div className="space-y-1">
                {UPCOMING_BOOKINGS.map((b, idx) => (
                  <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={idx}
                    className="flex items-center gap-2 rounded px-1.5 py-1"
                    style={{
                      backgroundColor: b.today ? "rgba(99,102,241,0.06)" : "transparent",
                    }}
                  >
                    <span
                      className="w-12 text-[9px] font-semibold"
                      style={{ color: b.today ? "#6366f1" : "rgba(0,0,0,0.55)" }}
                    >
                      {b.time}
                    </span>
                    <span className="flex-1 truncate text-[10px] text-[#0a0a0a]/75">
                      {b.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
