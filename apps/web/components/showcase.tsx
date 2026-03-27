const rows = [
  ["🎯 Coaching", "Clients", "Engagements", "Inquiry → Discovery Call → Proposal → Won"],
  ["💼 Consulting", "Clients", "Projects", "Lead → Assessment → Proposal → Active"],
  ["🏢 Agency", "Accounts", "Retainers", "Brief → Pitch → Negotiation → Active"],
  ["🏠 Real Estate", "Buyers/Sellers", "Listings", "Lead → Showing → Offer → Closing"],
  ["🧠 Therapy", "Patients", "Cases", "Inquiry → Intake → Active → Maintenance"],
] as const;

export function Showcase() {
  return (
    <section className="web-section">
      <div className="web-container">
        <p className="section-label text-center">Showcase</p>
        <h2 className="text-center text-[32px] font-semibold tracking-[-0.02em]">One framework. Five practices.</h2>
        <p className="mt-3 text-center text-[hsl(var(--color-text-secondary))]">The Soul System reconfigures everything for your niche.</p>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[880px] overflow-hidden rounded-2xl border border-white/10">
            <thead className="bg-[hsl(var(--color-surface-raised))/0.5] text-left text-sm text-[hsl(var(--color-text-secondary))]">
              <tr>
                <th className="px-4 py-3">Niche</th>
                <th className="px-4 py-3">Your clients are called</th>
                <th className="px-4 py-3">Your deals are called</th>
                <th className="px-4 py-3">Your pipeline</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[0]} className="glass-card border-t border-white/10 text-sm">
                  <td className="px-4 py-3 font-semibold text-foreground">{row[0]}</td>
                  <td className="px-4 py-3 text-[hsl(var(--color-text-secondary))]">{row[1]}</td>
                  <td className="px-4 py-3 text-[hsl(var(--color-text-secondary))]">{row[2]}</td>
                  <td className="px-4 py-3 text-[hsl(var(--color-text-secondary))]">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-center text-sm text-[hsl(var(--color-text-secondary))]">
          Each showcase includes a complete soul template, sample data, and landing page. Fork one and deploy in 30 seconds.
        </p>
        <div className="mt-5 flex justify-center">
          <a href="https://github.com/seldonframe/crm/tree/main/showcase" className="inline-flex h-11 items-center rounded-lg border border-primary px-5 text-sm font-semibold text-primary transition hover:bg-primary/10">
            Browse Showcase Configs →
          </a>
        </div>
      </div>
    </section>
  );
}
