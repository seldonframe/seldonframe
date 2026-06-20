"use client";

// ICP-3 — the "New agent" action for the Agents Studio. Creates a
// voice_receptionist template (createAgentTemplateAction) and routes the builder
// straight to its editor. A tiny inline name prompt keeps the first-run flow to
// a single click + a name.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createAgentTemplateAction } from "@/lib/agent-templates/actions";

export function NewAgentButton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, startCreate] = useTransition();

  const create = () => {
    setError(null);
    startCreate(async () => {
      const result = await createAgentTemplateAction({
        name: name.trim() || "Voice Receptionist",
        type: "voice_receptionist",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/studio/agents/${result.id}`);
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "primary"
            ? "crm-button-primary inline-flex h-10 items-center gap-1.5 px-4 text-sm"
            : "crm-button-secondary inline-flex h-10 items-center gap-1.5 px-4 text-sm"
        }
      >
        <Plus className="size-4" />
        New agent
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") create();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Name your agent (e.g. HVAC Front Desk)"
        className="h-10 w-full max-w-xs rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      <button
        type="button"
        onClick={create}
        disabled={isCreating}
        className="crm-button-primary h-10 px-4 text-sm"
      >
        {isCreating ? "Creating…" : "Create"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="crm-button-secondary h-10 px-4 text-sm"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-rose-600">Error: {error}</span>}
    </div>
  );
}
