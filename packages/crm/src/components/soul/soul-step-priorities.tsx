import type { SoulWizardInput } from "@/lib/soul/types";

type Props = {
  value: SoulWizardInput;
  onChange: (patch: Partial<SoulWizardInput>) => void;
};

export function SoulStepPriorities({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">What matters most to you?</h2>
      <input className="crm-input h-10 w-full px-3" placeholder="Top priorities (comma separated)" value={value.priorities.join(", ")} onChange={(e) => onChange({ priorities: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
      <textarea className="crm-input min-h-24 w-full p-3" placeholder="What should your current system do better?" value={value.painPoint} onChange={(e) => onChange({ painPoint: e.target.value })} />
    </div>
  );
}
