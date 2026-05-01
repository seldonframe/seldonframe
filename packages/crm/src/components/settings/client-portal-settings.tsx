"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

/**
 * May 1, 2026 — Client Portal V1: workspace-level settings page.
 *
 * Surfaces a "is the portal active for this workspace" overview and
 * the public portal URL with a one-click copy button. The toggle
 * itself is *derived* from the plan-gate result — there is no separate
 * workspace-level kill switch (yet). On Free we render a disabled
 * toggle + upgrade nudge; on Growth/Scale the toggle reads ON and
 * directs the operator to enable individual contacts via the contact
 * record's Portal Access card (which is the actual writable surface).
 *
 * The page also renders a small branding preview so the operator can
 * see roughly how the portal header will look to clients with their
 * current brand color + workspace name.
 */

export interface ClientPortalSettingsProps {
  /** "active", "growth", "scale", or "free". */
  tier: string;
  planAllowed: boolean;
  planReason?: string | null;
  orgSlug: string | null;
  workspaceName: string;
  brandPrimaryColor: string | null;
  /** How many contacts have portalAccessEnabled = true. */
  enabledContactsCount: number;
  /** How many of those have logged in at least once. */
  activeContactsCount: number;
  /** Total contacts in the workspace (for the "X of Y" denominator). */
  totalContactsCount: number;
  /** Public app origin to build the portal URL — server resolves it. */
  portalUrl: string | null;
}

export function ClientPortalSettings({
  tier,
  planAllowed,
  planReason,
  orgSlug,
  workspaceName,
  brandPrimaryColor,
  enabledContactsCount,
  activeContactsCount,
  totalContactsCount,
  portalUrl,
}: ClientPortalSettingsProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const tierLabel = tier === "growth" ? "Growth" : tier === "scale" ? "Scale" : "Free";
  const previewColor = brandPrimaryColor || "#0f172a";

  async function copyPortalUrl() {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      window.prompt("Copy the portal link:", portalUrl);
    }
  }

  return (
    <div className="space-y-6">
      {/* Plan-gate banner — green check on paid, amber upgrade on Free. */}
      {planAllowed ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Client portal is active on the {tierLabel} plan
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Toggle access for individual clients from the Portal Access
                card on each contact&apos;s record.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Upgrade to enable the client portal
              </p>
              <p className="text-sm text-muted-foreground">
                {planReason ??
                  "The client portal is a Growth ($29/mo) or Scale ($99/mo) feature. Upgrade your workspace to give clients their own login + dashboard."}
              </p>
              <Link
                href="/settings/billing"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-90"
              >
                View billing →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Workspace toggle (derived from plan, read-only). */}
      <article className="rounded-xl border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <ShieldCheck className="size-3.5 text-muted-foreground" />
              Enable client portal for this workspace
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              When enabled, you can grant portal access to individual clients
              from each contact&apos;s record.
            </p>
          </div>
          <ToggleSwitch checked={planAllowed} disabled label="Workspace portal access" />
        </div>

        {planAllowed ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Portal-enabled clients"
              value={`${enabledContactsCount}`}
              caption={`of ${totalContactsCount} contacts`}
            />
            <Stat
              label="Active in last 30 days"
              value={`${activeContactsCount}`}
              caption={
                enabledContactsCount > 0
                  ? `${Math.round((activeContactsCount / Math.max(enabledContactsCount, 1)) * 100)}% engagement`
                  : "No activity yet"
              }
            />
            <Stat
              label="Plan"
              value={tierLabel}
              caption={tier === "scale" ? "Scale tier" : "Growth tier"}
            />
          </div>
        ) : null}
      </article>

      {/* Portal URL display (read-only + copy button). */}
      <article className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Public portal URL</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Share this URL with your clients. They&apos;ll sign in with the
          email address you have on file.
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
            {portalUrl ?? "(workspace slug missing)"}
          </code>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyPortalUrl}
              disabled={!portalUrl}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Copy className="size-3.5" />
              {copyState === "copied" ? "Copied ✓" : "Copy"}
            </button>
            {portalUrl ? (
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted/50"
              >
                <ExternalLink className="size-3.5" />
                Open
              </a>
            ) : null}
          </div>
        </div>

        {!orgSlug ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Set a workspace slug in{" "}
            <Link
              href="/settings/workspace"
              className="text-primary underline-offset-4 hover:underline"
            >
              Workspace settings
            </Link>{" "}
            so we can generate a public portal URL.
          </p>
        ) : null}
      </article>

      {/* Branding preview — a tiny mock of the portal header. */}
      <article className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Branding preview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This is roughly how the portal header looks to clients with your
          current brand color.
        </p>

        <div className="mt-4 overflow-hidden rounded-lg border bg-white">
          {/* Browser chrome */}
          <div className="flex items-center gap-1.5 border-b bg-zinc-50 px-3 py-2">
            <span className="size-2 rounded-full bg-zinc-300" />
            <span className="size-2 rounded-full bg-zinc-300" />
            <span className="size-2 rounded-full bg-zinc-300" />
            <span className="ml-3 truncate font-mono text-[10px] text-zinc-500">
              {portalUrl ?? "portal.example.com"}
            </span>
          </div>

          {/* Mock portal header */}
          <div className="bg-white p-5">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Client Portal
                </p>
                <p
                  className="mt-0.5 text-base font-semibold"
                  style={{ color: previewColor }}
                >
                  Welcome, Client
                </p>
              </div>
              <nav className="hidden items-center gap-1 sm:flex">
                <span
                  className="rounded-md px-2 py-1 text-[10px] font-medium text-white"
                  style={{ backgroundColor: previewColor }}
                >
                  Overview
                </span>
                <span className="rounded-md px-2 py-1 text-[10px] font-medium text-zinc-500">
                  Pipeline
                </span>
                <span className="rounded-md px-2 py-1 text-[10px] font-medium text-zinc-500">
                  Bookings
                </span>
                <span className="rounded-md px-2 py-1 text-[10px] font-medium text-zinc-500">
                  Messages
                </span>
              </nav>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-zinc-200 p-3">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {workspaceName}
                </p>
                <p className="mt-1 text-xs font-medium text-zinc-900">
                  Active clients
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 p-3">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  Brand color
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className="size-3 rounded-full ring-1 ring-zinc-200"
                    style={{ backgroundColor: previewColor }}
                  />
                  <span className="font-mono text-[10px] text-zinc-700">
                    {previewColor}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 p-3">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  Plan
                </p>
                <p className="mt-1 text-xs font-medium text-zinc-900">
                  {tierLabel}
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Adjust your brand color in{" "}
          <Link
            href="/settings/theme"
            className="text-primary underline-offset-4 hover:underline"
          >
            Brand &amp; Theme
          </Link>
          .
        </p>
      </article>

      {/* Quick-action footer */}
      {planAllowed ? (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Manage individual clients
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Go to a contact&apos;s record and use the Portal Access card to
            enable login and send invites.
          </p>
          <Link
            href="/contacts"
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted/50"
          >
            <Users className="size-3.5" />
            Open contacts
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string | null;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/40 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {caption ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  );
}

function ToggleSwitch({
  checked,
  disabled,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <span
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled}
      className={
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors " +
        (disabled ? "opacity-60 " : "") +
        (checked ? "bg-primary" : "bg-muted")
      }
    >
      <span
        className={
          "inline-block size-4 transform rounded-full bg-background shadow-sm transition-transform " +
          (checked ? "translate-x-4" : "translate-x-0.5")
        }
      />
    </span>
  );
}
