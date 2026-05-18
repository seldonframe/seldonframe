"use client";

// 2026-05-18 — workspace switcher on /automations/[id]/configure that
// auto-submits the form on change. Replaces the previous two-step
// "select then click Switch & configure" pattern per operator feedback:
// "as soon as the user toggles the right workspace he wants to apply
//  the agent to, it should work — no need to also click a button."
//
// The submit triggers setActiveOrgAction (server action) which flips
// the active-org cookie + redirects back to /automations/[id]/configure,
// re-rendering the page against the new workspace.

import { useRef, useTransition } from "react";

type Org = { id: string; name: string };

export function WorkspaceAutoApplySelect({
  orgs,
  activeOrgId,
  switchAction,
  redirectTo,
}: {
  orgs: Org[];
  activeOrgId: string | null;
  switchAction: (formData: FormData) => Promise<void> | void;
  redirectTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const newOrgId = event.currentTarget.value;
    if (!newOrgId || newOrgId === activeOrgId) return;
    const fd = new FormData(formRef.current ?? undefined);
    fd.set("orgId", newOrgId);
    fd.set("redirectTo", redirectTo);
    startTransition(async () => {
      await switchAction(fd);
    });
  }

  return (
    <form ref={formRef} className="flex items-center gap-2">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <select
        name="orgId"
        defaultValue={activeOrgId ?? ""}
        onChange={handleChange}
        disabled={pending}
        className="crm-input h-10 px-3 flex-1 disabled:opacity-60"
      >
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
            {org.id === activeOrgId ? " (active)" : ""}
          </option>
        ))}
      </select>
      {pending ? (
        <span className="text-xs text-muted-foreground">Switching…</span>
      ) : null}
    </form>
  );
}
