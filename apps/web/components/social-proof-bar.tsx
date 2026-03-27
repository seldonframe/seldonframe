export function SocialProofBar() {
  const niches = ["Coaching", "Consulting", "Agency", "Real Estate", "Therapy", "Financial Advisory", "Freelance"];

  return (
    <section className="web-section pt-0">
      <div className="web-container">
        <p className="text-center text-[hsl(var(--color-text-secondary))]">Trusted by coaches, consultants, agencies, and service professionals</p>
        <div className="relative mt-5">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent md:hidden" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent md:hidden" />
          <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:justify-center md:overflow-visible">
            {niches.map((item) => (
              <span key={item} className="glass-card shrink-0 rounded-full px-3 py-1 text-xs font-medium text-[hsl(var(--color-text-secondary))]">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
