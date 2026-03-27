import type { SoulWizardInput } from "@/lib/soul/types";

type Props = {
  value: SoulWizardInput;
  onChange: (patch: Partial<SoulWizardInput>) => void;
};

export function SoulStepVoice({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">How do you communicate?</h2>
      <input className="crm-input h-10 w-full px-3" placeholder="Communication style" value={value.communicationStyle} onChange={(e) => onChange({ communicationStyle: e.target.value })} />
      <input className="crm-input h-10 w-full px-3" placeholder="Words you use (comma separated)" value={value.vocabulary.join(", ")} onChange={(e) => onChange({ vocabulary: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
      <input className="crm-input h-10 w-full px-3" placeholder="Words to avoid (comma separated)" value={value.avoidWords.join(", ")} onChange={(e) => onChange({ avoidWords: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
    </div>
  );
}
