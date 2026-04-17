"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type CreateWorkspaceState = {
  error?: string;
};

type NewWorkspacePromptFormProps = {
  action: (state: CreateWorkspaceState, formData: FormData) => Promise<CreateWorkspaceState>;
};

const initialState: CreateWorkspaceState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" className="h-11 px-5 text-sm sm:text-base" disabled={pending}>
      {pending ? "Generating your OS..." : "Generate my OS with Seldon"}
    </Button>
  );
}

export function NewWorkspacePromptForm({ action }: NewWorkspacePromptFormProps) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <Textarea
        name="description"
        placeholder="Describe your business or paste a URL..."
        className="min-h-48 resize-y px-4 py-3 text-sm sm:text-base"
        required
      />

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex flex-col items-center gap-3">
        <SubmitButton />
        <p className="max-w-2xl text-center text-sm text-muted-foreground">
          First workspace is free forever. Tell Seldon what you need and it will build your complete system.
        </p>
      </div>
    </form>
  );
}
