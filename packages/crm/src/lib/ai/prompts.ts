import type { OrgSoul } from "@/lib/soul/types";

export function withSoulContext(basePrompt: string, soul: OrgSoul | null) {
  if (!soul) {
    return basePrompt;
  }

  return `${basePrompt}\n\nBusiness context: ${soul.aiContext}\nVoice style: ${soul.voice.style}\nPreferred vocabulary: ${soul.voice.vocabulary.join(", ")}\nAvoid words: ${soul.voice.avoidWords.join(", ")}`;
}
