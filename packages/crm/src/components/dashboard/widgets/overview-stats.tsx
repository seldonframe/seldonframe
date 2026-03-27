import { formatCurrencyCompact } from "@/lib/utils/formatters";

export function OverviewStats({
  totalContacts,
  totalDeals,
  pipelineValue,
}: {
  totalContacts: number;
  totalDeals: number;
  pipelineValue: number;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <article className="crm-card">
        <p className="text-tiny text-[hsl(var(--color-text-muted))]">Contacts</p>
        <p className="mt-2 text-[32px] font-semibold leading-[1.1] tracking-tight">{totalContacts}</p>
      </article>
      <article className="crm-card">
        <p className="text-tiny text-[hsl(var(--color-text-muted))]">Deals</p>
        <p className="mt-2 text-[32px] font-semibold leading-[1.1] tracking-tight">{totalDeals}</p>
      </article>
      <article className="crm-card">
        <p className="text-tiny text-[hsl(var(--color-text-muted))]">Pipeline Value</p>
        <p className="mt-2 text-[32px] font-semibold leading-[1.1] tracking-tight">{formatCurrencyCompact(pipelineValue)}</p>
      </article>
    </div>
  );
}
