export function SoulSystem() {
  const steps = [
    ["What do you do?", "Your CRM labels, pipeline, and fields configure automatically"],
    ["Who are your clients?", "Entity names update everywhere — Clients, Patients, Accounts"],
    ["What's your process?", "Pipeline stages match YOUR actual workflow"],
    ["How do you communicate?", "Email sequences write themselves in YOUR voice"],
    ["What matters most?", "Dashboard prioritizes what YOU care about"],
  ] as const;

  return (
    <section className="web-section">
      <div className="web-container">
        <p className="section-label text-center">Soul System</p>
        <h2 className="text-center text-[32px] font-semibold tracking-[-0.02em]">5 questions. Your entire business system.</h2>
        <p className="mt-3 text-center text-[hsl(var(--color-text-secondary))]">No code. No configuration files. No developer needed.</p>

        <div className="mt-10 grid gap-4 lg:grid-cols-5">
          {steps.map(([title, desc], index) => (
            <div key={title} className="relative">
              <div className={`glass-card mx-auto mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full border ${index < 2 ? "bg-primary text-primary-foreground glow-teal" : "text-primary"}`}>
                <span className="text-sm font-semibold">{index + 1}</span>
              </div>
              {index < steps.length - 1 ? <div className="flow-connector absolute left-[52%] top-5 hidden h-0.5 w-[88%] lg:block" /> : null}
              <p className="text-center text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-center text-xs text-[hsl(var(--color-text-secondary))]">{desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <article className="glass-card rounded-2xl p-4">
            <p className="text-sm font-medium text-[hsl(var(--color-text-secondary))]">Before</p>
            <p className="mt-2 font-semibold">Generic CRM with "Contacts" and "Deals"</p>
          </article>
          <div className="text-center text-primary">→</div>
          <article className="glass-card rounded-2xl border-primary/30 p-4">
            <p className="text-sm font-medium text-[hsl(var(--color-text-secondary))]">After</p>
            <p className="mt-2 font-semibold">YOUR CRM with "Coaching Clients" and "Engagements"</p>
          </article>
        </div>
      </div>
    </section>
  );
}
