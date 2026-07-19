"use client";

// Shared deploy-time fill form (Task 4) — mounted at every deploy confirm
// surface for a template with declared `templateVariables`
// (AgentBlueprint.templateVariables, Task 1): the single-client deploy
// wizard's Review step (studio/agents/[id]/deploy/deploy-client.tsx) and the
// marketplace fork/install path (the same declared shape rides the cloned
// blueprint — see fork-listing.ts, Task 4 verified this by construction).
//
// ALL declared variables are REQUIRED: an unfilled one would silently vanish
// via fillPlaceholders' drop-unknown-token behavior at runtime — a dishonest
// output (CLAUDE.md 3.1 Optimistic Path) — so this component marks every
// blank field and `templateVariablesComplete` is the shared gate the caller
// uses to disable its Deploy/Continue button. The SAME requirement is also
// enforced server-side (validateTemplateVarValues, generalize.ts) — this
// form is a UX nicety, never the only gate.

export type TemplateVariableDecl = { name: string; description: string; example: string };

/** True once every declared variable has a non-blank value. Absent/empty
 *  `variables` → always true (nothing to require). Pure. */
export function templateVariablesComplete(
  variables: TemplateVariableDecl[],
  values: Record<string, string>,
): boolean {
  return variables.every((v) => (values[v.name] ?? "").trim() !== "");
}

export function TemplateVariablesForm({
  variables,
  values,
  onChange,
  disabled,
}: {
  variables: TemplateVariableDecl[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  disabled?: boolean;
}) {
  if (variables.length === 0) return null;

  return (
    <div data-template-variables-form className="space-y-3 rounded-lg border bg-background p-3.5">
      <p className="text-xs font-medium text-foreground">
        This agent needs a few details filled in before it can go live
      </p>
      {variables.map((v) => {
        const value = values[v.name] ?? "";
        const missing = value.trim() === "";
        return (
          <div key={v.name} className="space-y-1" data-template-variable-row>
            <label className="text-xs font-medium text-foreground" htmlFor={`tvar-${v.name}`}>
              {v.description || v.name}{" "}
              {missing ? (
                <span data-template-variable-required className="text-rose-600 dark:text-rose-400">
                  *
                </span>
              ) : null}
            </label>
            <input
              id={`tvar-${v.name}`}
              type="text"
              value={value}
              onChange={(e) => onChange(v.name, e.target.value)}
              disabled={disabled}
              placeholder={v.example}
              data-template-variable-input
              aria-required="true"
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
            />
          </div>
        );
      })}
    </div>
  );
}
