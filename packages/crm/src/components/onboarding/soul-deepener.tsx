"use client";

type SoulDeepSetupResponse = {
  field: string;
  question: string;
  response: string;
  answeredAt: string;
};

/*
  Square UI class reference (source of truth):
  - templates/chat/components/chat/chat-conversation-view.tsx
    - messages shell: "flex-1 overflow-y-auto px-4 md:px-8 py-8"
    - thread width: "max-w-[640px] mx-auto space-y-6"
    - composer footer: "border-t border-border px-4 md:px-8 py-[17px]"
  - templates/chat/components/chat/chat-message.tsx
    - message row: "flex gap-4" + "justify-start/justify-end"
    - bubble: "rounded-2xl px-4 py-3 max-w-[80%]"
  - templates/chat/components/chat/chat-input-box.tsx
    - composer shell: "rounded-2xl border border-border bg-secondary ... p-1"
    - composer inner: "rounded-xl border ... bg-card"
*/

type SoulDeepenerProps = {
  existingResponses?: SoulDeepSetupResponse[];
};

export function SoulDeepener({ existingResponses = [] }: SoulDeepenerProps) {
  void existingResponses;

  return null;
}
