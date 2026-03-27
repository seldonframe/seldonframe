import type { SoulWizardInput } from "@/lib/soul/types";

type Props = {
  value: SoulWizardInput;
  onChange: (patch: Partial<SoulWizardInput>) => void;
};

export function SoulStepClients({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Who are your clients?</h2>
      <input className="crm-input h-10 w-full px-3" placeholder="Typical client type (B2B/B2C/Both)" value={value.clientType} onChange={(e) => onChange({ clientType: e.target.value })} />
      <input className="crm-input h-10 w-full px-3" placeholder="What do you call them? (Client, Patient...)" value={value.clientLabel} onChange={(e) => onChange({ clientLabel: e.target.value })} />
      <input className="crm-input h-10 w-full px-3" placeholder="How they find you (comma separated)" value={value.leadSources.join(", ")} onChange={(e) => onChange({ leadSources: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
      <textarea className="crm-input min-h-24 w-full p-3" placeholder="Describe your typical client" value={value.clientDescription} onChange={(e) => onChange({ clientDescription: e.target.value })} />
    </div>
  );
}
