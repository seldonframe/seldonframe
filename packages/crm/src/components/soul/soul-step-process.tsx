import type { SoulWizardInput } from "@/lib/soul/types";

type Props = {
  value: SoulWizardInput;
  onChange: (patch: Partial<SoulWizardInput>) => void;
};

export function SoulStepProcess({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">What does your process look like?</h2>
      <textarea className="crm-input min-h-24 w-full p-3" placeholder="Describe your typical journey" value={value.processDescription} onChange={(e) => onChange({ processDescription: e.target.value })} />
      <input className="crm-input h-10 w-full px-3" placeholder="How long does this usually take?" value={value.processDuration} onChange={(e) => onChange({ processDuration: e.target.value })} />
      <input className="crm-input h-10 w-full px-3" placeholder="Key stages (comma separated)" value={value.stages.join(", ")} onChange={(e) => onChange({ stages: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
    </div>
  );
}
