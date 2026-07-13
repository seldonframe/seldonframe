// packages/crm/src/components/landing/record/record-proof.tsx
//
// Static two-panel proof figure for record mode (spec §4.4): a traced
// steps list turning into a compiled agent card. This is clearly
// illustrative UI, not a fabricated screenshot or receipt (house rule:
// GENERATED vs CAPTURE — never fake a receipt). No live data. Server
// component.

const TRACED_ROWS = [
  "Opened the quote spreadsheet ✓",
  "Copied totals into the email ✓",
  "Sent follow-up to the customer ✓",
] as const;

export function RecordProof() {
  return (
    <section aria-label="From recording to agent" className="px-5 py-16 md:px-8 md:py-20">
      <div className="mx-auto w-full max-w-[860px]">
        <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center">
          <div className="flex-1 rounded-[14px] border border-[var(--lp-border-soft)] bg-[var(--lp-card)] p-5">
            <p className="text-[13.5px] tracking-[0.04em] text-[var(--lp-muted)]">Traced from your recording</p>
            <ul className="mt-3 flex flex-col gap-2.5 font-mono">
              {TRACED_ROWS.map((row) => (
                <li key={row} className="flex items-start gap-2 text-[16px] leading-[1.5] text-[var(--lp-body)]">
                  <span className="mt-[2px] text-[var(--lp-accent)]" aria-hidden>
                    &#10003;
                  </span>
                  <span>{row.replace(" ✓", "")}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex shrink-0 items-center justify-center px-1 text-[var(--lp-faint)] md:rotate-0" aria-hidden>
            <span className="text-[22px]">&rarr;</span>
          </div>

          <div className="flex-1 rounded-[14px] border border-[var(--lp-border-soft)] bg-[var(--lp-card)] p-5">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-[var(--lp-accent)]" aria-hidden />
              <h3 className="text-[17px] font-[600] leading-[1.3] text-[var(--lp-ink)]">
                Quote follow-up agent
              </h3>
            </div>
            <p className="mt-2 text-[16px] leading-[1.55] text-[var(--lp-body)]">Compiled &middot; ready to test</p>
            <p className="mt-1 text-[13.5px] text-[var(--lp-faint)]">Built from a 4-minute recording</p>
          </div>
        </div>

        <p className="mt-6 text-[16px] leading-[1.55] text-[var(--lp-body)]">
          Your recording becomes a checkable plan — then an agent you can test.
        </p>
      </div>
    </section>
  );
}
