import type { OrgSoul } from "@/lib/soul/types";

export function SoulReview({ soul }: { soul: OrgSoul }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Review your CRM identity</h2>
      <p className="text-sm text-[hsl(var(--color-text-secondary))]">Business: {soul.businessName}</p>
      <p className="text-sm text-[hsl(var(--color-text-secondary))]">Industry: {soul.industry}</p>
      <p className="text-sm text-[hsl(var(--color-text-secondary))]">
        Labels: {soul.entityLabels.contact.singular} / {soul.entityLabels.deal.singular}
      </p>
      <p className="text-sm text-[hsl(var(--color-text-secondary))]">Pipeline: {soul.pipeline.stages.map((x) => x.name).join(" → ")}</p>
    </div>
  );
}
