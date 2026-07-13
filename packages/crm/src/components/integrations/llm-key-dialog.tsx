// packages/crm/src/components/integrations/llm-key-dialog.tsx
//
// Record v3 (S4a) — in-place BYOK modal. Replaces the `needs_byok` Link to
// /settings/integrations/llm that used to bounce the operator off the page
// they were on (editor-client.tsx / test-client.tsx / run-evals.tsx). Same
// "stay in place" UX as the Composio connect popup
// (lifecycle/connected-stage.tsx) — open a dialog, save, close, and let the
// caller re-run whatever it was blocked on.
//
// Fail-soft (Optimistic Path rule): a save error stays IN the dialog with a
// visible message — it never silently closes. Uses saveLlmKeyInPlaceAction
// (lib/integrations/llm/actions.ts), which returns a result object instead
// of redirect()ing — the ordinary saveLlmKeyAction would navigate the
// browser to /settings/integrations/llm out from under this modal, which is
// exactly the bug this component exists to fix.
"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AnthropicKeyField, EncryptionNotice } from "@/components/integrations/anthropic-key-field";
import { Button } from "@/components/ui/button";
import { saveLlmKeyInPlaceAction, type SaveLlmKeyResult } from "@/lib/integrations/llm/actions";

export type LlmKeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the key saves successfully — the caller re-runs whatever
   *  action was blocked on `needs_byok` (refine / test turn / run evals). */
  onSaved?: () => void;
  /** DI seam for tests — defaults to the real server action. */
  action?: (formData: FormData) => Promise<SaveLlmKeyResult>;
};

export function LlmKeyDialog({ open, onOpenChange, onSaved, action = saveLlmKeyInPlaceAction }: LlmKeyDialogProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");

  // Built manually (not `new FormData(formElement)`) — the form-element
  // constructor path is what react-dom's <form action> submitter wiring
  // uses under the hood, and jsdom's implementation of it throws
  // (`FormData constructor: Argument 1 could not be converted`) in the
  // unit-test harness. A plain button onClick + hand-built FormData works
  // identically against the real server action in the browser and is
  // testable here.
  function handleSave() {
    setError(null);
    const formData = new FormData();
    formData.set("provider", "anthropic");
    formData.set("apiKey", apiKey);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        // Never silently close on failure — surface the exact server error.
        setError(result.error);
        return;
      }
      setApiKey("");
      onOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add your Anthropic key</DialogTitle>
          <DialogDescription>
            Your first workspace stays free. Building and testing your own agents runs on your
            Anthropic key.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <AnthropicKeyField
            inputId="llm-key-dialog-apiKey"
            value={apiKey}
            onValueChange={setApiKey}
          />
          <EncryptionNotice variant="footer-text" />

          {error ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="button" onClick={handleSave} disabled={pending || !apiKey.trim()} aria-busy={pending} className="w-full">
            {pending ? "Saving..." : "Save key"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
