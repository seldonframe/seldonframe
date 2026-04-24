// <CustomerLogin> — themed customer portal login. Composition
// wrapper around the existing OTC + JWT auth plumbing in
// lib/portal/auth.ts (UNCHANGED in SLICE 4b).
//
// Two-stage flow:
//   request: email input → "Send code" → calls
//            requestPortalAccessCodeAction → advances to verify
//   verify:  code input + "Verify" button → calls
//            verifyPortalAccessCodeAction → redirects to
//            postLoginHref (default /portal/<orgSlug>) on success
//
// Shipped in SLICE 4b PR 1 C4 per audit §5.4.
//
// L-17 classification: state-machine 1.7x.
//
// Why this exists: the legacy portal-login-form.tsx uses `crm-card`
// / `crm-input` / `crm-button-primary` utility classes that predate
// the PublicThemeProvider era. It renders unthemed on every
// workspace. <CustomerLogin> replaces it with --sf-* styling so
// workspace branding applies. The underlying server actions are
// imported as-is; zero auth-plumbing changes.

"use client";

import { useState, useTransition } from "react";

import {
  requestPortalAccessCodeAction,
  verifyPortalAccessCodeAction,
} from "@/lib/portal/auth";
import type { OrgTheme } from "@/lib/theme/types";

export type CustomerLoginProps = {
  orgSlug: string;
  theme: OrgTheme;
  /** Default "Sign in". */
  title?: string;
  /** Default "Use your contact email to receive a one-time code." */
  subtitle?: string;
  /** Default `/portal/${orgSlug}`. */
  postLoginHref?: string;
  /** Test hook + deep-link: jump to verify stage with a pre-filled email. */
  initialStage?: "request" | "verify";
  initialEmail?: string;
  /** Dev-env preview code (served by requestPortalAccessCodeAction in dev). */
  devCodePreview?: string;
  /** Explicit error render (e.g., from server-side action dispatch). */
  errorMessage?: string;
};

export function CustomerLogin({
  orgSlug,
  theme,
  title = "Sign in",
  subtitle = "Use your contact email to receive a one-time code.",
  postLoginHref,
  initialStage = "request",
  initialEmail = "",
  devCodePreview: initialDevCode,
  errorMessage: initialError,
}: CustomerLoginProps) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"request" | "verify">(initialStage);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [devCode, setDevCode] = useState<string | null>(initialDevCode ?? null);

  const redirectHref = postLoginHref ?? `/portal/${orgSlug}`;

  function requestCode() {
    startTransition(async () => {
      try {
        setError(null);
        const result = await requestPortalAccessCodeAction(orgSlug, email);
        setDevCode(result.codePreview ?? null);
        setStage("verify");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to request access code");
      }
    });
  }

  function verifyCode() {
    startTransition(async () => {
      try {
        setError(null);
        await verifyPortalAccessCodeAction(orgSlug, email, code);
        window.location.assign(redirectHref);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to verify access code");
      }
    });
  }

  return (
    <div
      data-customer-login=""
      data-customer-login-org={orgSlug}
      className="flex w-full max-w-md flex-col gap-4 p-6"
      style={{
        backgroundColor: "var(--sf-card-bg)",
        color: "var(--sf-text)",
        border: "1px solid var(--sf-border)",
        borderRadius: "var(--sf-radius)",
      }}
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold" style={{ color: "var(--sf-text)" }}>
          {title}
        </h1>
        <p className="text-sm" style={{ color: "var(--sf-muted)" }}>
          {subtitle}
        </p>
      </header>

      <label htmlFor="customer-login-email" className="text-sm font-medium">
        Email
      </label>
      <input
        id="customer-login-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={pending || stage === "verify"}
        placeholder="you@example.com"
        className="px-3 py-2 w-full"
        style={{
          backgroundColor: "var(--sf-bg)",
          color: "var(--sf-text)",
          border: "1px solid var(--sf-border)",
          borderRadius: "var(--sf-radius)",
        }}
      />

      {stage === "verify" ? (
        <>
          <label htmlFor="customer-login-code" className="text-sm font-medium">
            6-digit code
          </label>
          <input
            id="customer-login-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={pending}
            placeholder="123456"
            className="px-3 py-2 w-full tracking-widest"
            style={{
              backgroundColor: "var(--sf-bg)",
              color: "var(--sf-text)",
              border: "1px solid var(--sf-border)",
              borderRadius: "var(--sf-radius)",
            }}
          />
        </>
      ) : null}

      {devCode ? (
        <p
          data-customer-login-devcode=""
          className="text-xs"
          style={{ color: "var(--sf-muted)" }}
        >
          Dev code: <span className="font-mono">{devCode}</span>
        </p>
      ) : null}

      {error ? (
        <p
          data-customer-login-error=""
          role="alert"
          className="text-sm"
          style={{ color: "rgb(220, 38, 38)" }}
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={stage === "request" ? requestCode : verifyCode}
        disabled={pending || !email || (stage === "verify" && !code)}
        className="px-5 py-2 text-sm font-medium"
        style={{
          backgroundColor: theme.primaryColor,
          color: "var(--sf-bg)",
          borderRadius: "var(--sf-radius)",
        }}
      >
        {pending
          ? "Please wait..."
          : stage === "request"
          ? "Send code"
          : "Verify & continue"}
      </button>

      {stage === "verify" ? (
        <button
          type="button"
          onClick={() => {
            setStage("request");
            setCode("");
            setError(null);
            setDevCode(null);
          }}
          disabled={pending}
          className="text-xs underline hover:no-underline"
          style={{ color: "var(--sf-muted)" }}
        >
          Send again
        </button>
      ) : null}
    </div>
  );
}
