"use client";

import { useState, useTransition } from "react";

export function ShareToShowcase({
  submit,
}: {
  submit: (payload: { deploymentUrl: string; screenshotUrl?: string }) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  return (
    <form
      className="crm-card space-y-3"
      action={(formData) => {
        startTransition(async () => {
          try {
            await submit({
              deploymentUrl: String(formData.get("deploymentUrl") ?? ""),
              screenshotUrl: String(formData.get("screenshotUrl") ?? "") || undefined,
            });
            setStatus("success");
          } catch {
            setStatus("error");
          }
        });
      }}
    >
      <p className="text-card-title">Share to Showcase</p>
      <input className="crm-input h-10 w-full px-3" name="deploymentUrl" placeholder="https://your-app.vercel.app" required />
      <input className="crm-input h-10 w-full px-3" name="screenshotUrl" placeholder="https://.../screenshot.png (optional)" />
      <button type="submit" className="crm-button-primary h-9 px-3" disabled={pending}>
        {pending ? "Submitting..." : "Submit"}
      </button>
      {status === "success" ? <p className="text-label text-green-500">Shared successfully.</p> : null}
      {status === "error" ? <p className="text-label text-red-400">Share failed.</p> : null}
    </form>
  );
}
