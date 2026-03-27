import type { SoulWizardInput } from "@/lib/soul/types";

type Props = {
  value: SoulWizardInput;
  onChange: (patch: Partial<SoulWizardInput>) => void;
};

export function SoulStepBusiness({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Tell us about your business</h2>
      <input className="crm-input h-10 w-full px-3" placeholder="Business name" value={value.businessName} onChange={(e) => onChange({ businessName: e.target.value })} />
      <input className="crm-input h-10 w-full px-3" placeholder="What do you sell?" value={value.offerType} onChange={(e) => onChange({ offerType: e.target.value })} />
      <textarea className="crm-input min-h-24 w-full p-3" placeholder="One-sentence description" value={value.businessDescription} onChange={(e) => onChange({ businessDescription: e.target.value })} />
      <input className="crm-input h-10 w-full px-3" placeholder="Industry / niche" value={value.industry} onChange={(e) => onChange({ industry: e.target.value })} />
    </div>
  );
}
