"use client";

import { useState, useTransition } from "react";
import { generateSoulFromNarrative } from "@/lib/ai/actions";

export function AiCustomizationPanel() {
  const [pending, startTransition] = useTransition();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<string | null>(null);

  return (
    <section className="crm-card space-y-3">
      <div>
        <h2 className="text-card-title">AI Customization Panel</h2>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Refine your Soul with narrative prompts and AI-guided tuning.</p>
      </div>

      <textarea
        className="crm-input min-h-24 w-full p-3"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Describe how you want your CRM behavior, labels, and tone to evolve..."
      />

      <button
        type="button"
        className="crm-button-primary h-10 px-4"
        disabled={pending || !input.trim()}
        onClick={() => {
          startTransition(async () => {
            const response = await generateSoulFromNarrative(input);
            setResult(response.message);
          });
        }}
      >
        {pending ? "Generating..." : "Generate AI Customization"}
      </button>

      {result ? <pre className="crm-input max-h-64 overflow-auto whitespace-pre-wrap p-3 text-xs">{result}</pre> : null}
    </section>
  );
}
