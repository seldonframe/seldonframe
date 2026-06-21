"use client";

// ICP-3 (Phase 2, Task 6) — the "Describe your agent" create flow.
//
// The product bar: anybody with an LLM key describes an agent in one sentence
// and gets a generated, editable, testable agent. This button opens a dialog
// whose body is a prominent "What should your agent do?" textarea, two surface
// cards (Voice · Web chat), a quiet "or start blank" link, and a Generate CTA.
//
// On Generate: generateAgentDraftAction → createAgentTemplateAction (name from
// deriveName) → saveAgentTemplateBlueprintAction(patch) → route to the editor.
// On "or start blank": createAgentTemplateAction with no generate, then route.
//
// Reuses the existing crm-button-primary/secondary classes, the useTransition +
// action-calling pattern, and the rounded-xl border bg-card card layout.

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Phone, MessageSquare, Sparkles, X } from "lucide-react";
import {
  createAgentTemplateAction,
  saveAgentTemplateBlueprintAction,
  generateAgentDraftAction,
} from "@/lib/agent-templates/actions";
import { deriveName, type AgentSurface } from "@/lib/agent-templates/store";

const PLACEHOLDER =
  "Answer my plumbing company's phone, book jobs, and text customers a quote range…";

// Rotating status copy shown on the Generate button while the draft is being
// written, so a multi-second LLM call feels alive instead of a frozen
// "Writing your agent…". Cycled every GEN_STATUS_INTERVAL_MS.
const GEN_STATUS_MESSAGES = [
  "Drafting the persona…",
  "Choosing the right tools…",
  "Writing the guardrails…",
  "Adding starter FAQs…",
  "Polishing the greeting…",
];
const GEN_STATUS_INTERVAL_MS = 1500;

export function NewAgentButton({
  variant = "primary",
}: {
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [surface, setSurface] = useState<AgentSurface>("voice");
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [isPending, startTransition] = useTransition();

  // Rotating loader copy index. Resets to 0 each time a generation starts and
  // advances on an interval while pending; the interval is cleared when pending
  // ends or the component unmounts (cleanup return). Plain client-side timer.
  const [statusIdx, setStatusIdx] = useState(0);
  useEffect(() => {
    if (!isPending) return;
    setStatusIdx(0);
    const id = setInterval(() => {
      setStatusIdx((i) => (i + 1) % GEN_STATUS_MESSAGES.length);
    }, GEN_STATUS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPending]);

  // Close the modal (used by backdrop click, the X, Cancel, and Escape). Never
  // close mid-generation — a click-out shouldn't abandon an in-flight draft.
  const close = () => {
    if (isPending) return;
    setOpen(false);
    setError(null);
  };

  // Portal to document.body so the `fixed inset-0` overlay is viewport-relative
  // (the dashboard shell's `.animate-page-enter` transform would otherwise scope
  // a fixed child to that section). Mounted gate keeps the portal client-only.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // While the modal is open: close on Escape + lock body scroll. Both are no-ops
  // when closed, and the cleanup restores the prior overflow on close/unmount.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // `close` reads isPending but is stable enough for this guard; re-run only
    // when open toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Shared tail: create the template of the right type, optionally save the
  // generated patch, then route to its editor. Returns false (and sets an
  // error) if creation fails so callers can stop.
  const createAndRoute = async (patch?: unknown) => {
    const type = surface === "chat" ? "chat_assistant" : "voice_receptionist";
    const name = patch ? deriveName(prompt) : "New agent";
    const created = await createAgentTemplateAction({ name, type });
    if (!created.ok) {
      setError(`Couldn't create the agent — ${created.error}`);
      return;
    }
    // Best-effort: persist the generated draft. If the save fails we still
    // route to the editor (the builder can Refine/edit there) rather than
    // stranding them with an orphaned blank template.
    if (patch) {
      await saveAgentTemplateBlueprintAction({
        templateId: created.id,
        patch,
      });
    }
    router.push(`/studio/agents/${created.id}`);
  };

  const generate = () => {
    setError(null);
    const intent = prompt.trim();
    if (!intent) {
      setError("Describe what your agent should do first.");
      return;
    }
    startTransition(async () => {
      const draft = await generateAgentDraftAction({ prompt: intent, surface });
      if (!draft.ok) {
        if (draft.error === "needs_key") {
          setError(
            <span>
              Add your LLM key to generate.{" "}
              <Link
                href="/settings/integrations/llm"
                className="font-medium underline underline-offset-2 hover:opacity-80"
              >
                Add LLM key
              </Link>
            </span>,
          );
        } else if (draft.error === "generation_failed") {
          setError("Couldn't generate — try rephrasing.");
        } else {
          setError("Something went wrong. Please try again.");
        }
        return;
      }
      await createAndRoute(draft.patch);
    });
  };

  const startBlank = () => {
    setError(null);
    startTransition(async () => {
      await createAndRoute();
    });
  };

  // The card body — identical content/logic to the previous inline card, now
  // rendered inside the centered modal below.
  const cardBody = (
    <>
      <div className="flex items-start gap-2">
        <span
          className="inline-flex size-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
          aria-hidden
        >
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-card-title">What should your agent do?</h2>
          <p className="text-xs text-muted-foreground">
            Describe it in a sentence — we&apos;ll draft a working agent you can
            edit and test.
          </p>
        </div>
        {/* Close (X) — disabled mid-generation, matching the other controls. */}
        <button
          type="button"
          onClick={close}
          disabled={isPending}
          aria-label="Close"
          className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-60"
        >
          <X className="size-4" />
        </button>
      </div>

      <textarea
        autoFocus
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder={PLACEHOLDER}
        disabled={isPending}
        className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed focus:border-primary focus:outline-none disabled:opacity-60"
      />

      {/* Surface cards */}
      <fieldset className="mt-3" disabled={isPending}>
        <legend className="sr-only">Agent surface</legend>
        <div className="grid grid-cols-2 gap-2">
          <SurfaceCard
            label="Voice"
            description="Answers the phone"
            icon={<Phone className="size-4" />}
            selected={surface === "voice"}
            onSelect={() => setSurface("voice")}
          />
          <SurfaceCard
            label="Web chat"
            description="Chats on your site"
            icon={<MessageSquare className="size-4" />}
            selected={surface === "chat"}
            onSelect={() => setSurface("chat")}
          />
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={generate}
          disabled={isPending}
          className="crm-button-primary inline-flex h-10 items-center gap-1.5 px-5 text-sm"
        >
          <Sparkles className={`size-4 ${isPending ? "animate-pulse" : ""}`} />
          {isPending ? GEN_STATUS_MESSAGES[statusIdx] : "Generate"}
        </button>
        <button
          type="button"
          onClick={startBlank}
          disabled={isPending}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-60"
        >
          or start blank
        </button>
        <button
          type="button"
          onClick={close}
          disabled={isPending}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          Cancel
        </button>
      </div>

      {error && (
        <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}
    </>
  );

  return (
    <>
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

      {/* Centered modal. Portal to document.body so the fixed overlay covers the
          viewport (not the transformed dashboard section). Backdrop click +
          Escape close; clicks inside the card stopPropagation so they don't
          dismiss. Body scroll is locked while open (effect above). */}
      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Describe your agent"
            onClick={close}
          >
            <div
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card p-5 text-left shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              {cardBody}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function SurfaceCard({
  label,
  description,
  icon,
  selected,
  onSelect,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "bg-background hover:bg-muted/50"
      }`}
    >
      <span
        className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md ${
          selected
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground"
        }`}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}
