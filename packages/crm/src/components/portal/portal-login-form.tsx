"use client";

import { useState, useTransition } from "react";
import { requestPortalAccessCodeAction, verifyPortalAccessCodeAction } from "@/lib/portal/auth";

export function PortalLoginForm({ orgSlug }: { orgSlug: string }) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"request" | "verify">("request");
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  function requestCode() {
    startTransition(async () => {
      try {
        setError(null);
        const result = await requestPortalAccessCodeAction(orgSlug, email);
        setDevCode(result.codePreview ?? null);
        setStage("verify");
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Failed to request access code");
      }
    });
  }

  function verifyCode() {
    startTransition(async () => {
      try {
        setError(null);
        await verifyPortalAccessCodeAction(orgSlug, email, code);
        window.location.assign(`/portal/${orgSlug}`);
      } catch (verifyError) {
        setError(verifyError instanceof Error ? verifyError.message : "Failed to verify access code");
      }
    });
  }

  return (
    <div className="crm-card w-full max-w-md space-y-4 p-6">
      <div>
        <h1 className="text-section-title">Client Portal Login</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Use your contact email and one-time code.</p>
      </div>

      <input
        className="crm-input h-10 w-full px-3"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={pending || stage === "verify"}
      />

      {stage === "verify" ? (
        <input
          className="crm-input h-10 w-full px-3"
          type="text"
          placeholder="6-digit code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={pending}
        />
      ) : null}

      {devCode ? <p className="text-xs text-[hsl(var(--color-text-muted))]">Dev code: {devCode}</p> : null}
      {error ? <p className="text-xs text-negative">{error}</p> : null}

      <button
        type="button"
        className="crm-button-primary h-10 px-4"
        disabled={pending || !email || (stage === "verify" && !code)}
        onClick={stage === "request" ? requestCode : verifyCode}
      >
        {pending ? "Please wait..." : stage === "request" ? "Send code" : "Verify & Continue"}
      </button>
    </div>
  );
}
