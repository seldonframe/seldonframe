"use client";
// packages/crm/src/app/start/_components/step1-form.tsx
// Step 1 of the /start live-sell checkout.
// Collects: workspace (dropdown), business name, owner first name, email, phone.
// Configures: included services (toggles), monthly fee, setup fee.
// On "Continue" → calls createLiveSellCheckoutAction → transitions to Step 2.

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLiveSellCheckoutAction, type LiveSellCheckoutResult } from "../actions";
import { DEFAULT_SERVICES, LIVE_SELL_MONTHLY_PRICE_CENTS, type ServiceItem } from "../constants";

type Workspace = { id: string; name: string; slug: string };

type Step1FormProps = {
  workspaces: Workspace[];
  onCheckoutReady: (result: LiveSellCheckoutResult) => void;
  accentColor: string;
  /** Callback so the wizard can lift pricing/services state up to the value panel. */
  onConfigChange: (config: {
    selectedServices: ServiceItem[];
    monthlyPriceCents: number;
    setupFeeCents: number;
  }) => void;
};

/** Suggested total based on which services are checked. */
function suggestedMonthly(enabled: Set<string>): number {
  return DEFAULT_SERVICES.filter((s) => enabled.has(s.id)).reduce(
    (sum, s) => sum + s.suggestedCents,
    0,
  );
}

export function Step1Form({
  workspaces,
  onCheckoutReady,
  accentColor,
  onConfigChange,
}: Step1FormProps) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [prospectName, setProspectName] = useState("");
  const [prospectFirstName, setProspectFirstName] = useState("");
  const [prospectEmail, setProspectEmail] = useState("");
  const [prospectPhone, setProspectPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── service / pricing config ────────────────────────────────────────────────
  const [enabledServices, setEnabledServices] = useState<Set<string>>(
    () => new Set(DEFAULT_SERVICES.map((s) => s.id)),
  );
  // Monthly field: string for the input, synced to cents for logic.
  const [monthlyField, setMonthlyField] = useState(
    String(LIVE_SELL_MONTHLY_PRICE_CENTS / 100),
  );
  const [setupField, setSetupField] = useState("0");

  // Parse inputs → cents (NaN-safe).
  const monthlyPriceCents = Math.max(0, Math.round((parseFloat(monthlyField) || 0) * 100));
  const setupFeeCents = Math.max(0, Math.round((parseFloat(setupField) || 0) * 100));

  const selectedServices = DEFAULT_SERVICES.filter((s) => enabledServices.has(s.id));

  // Notify parent whenever config changes (so value panel stays in sync).
  useEffect(() => {
    onConfigChange({ selectedServices, monthlyPriceCents, setupFeeCents });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledServices, monthlyField, setupField]);

  function toggleService(id: string) {
    setEnabledServices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      // Auto-suggest monthly total when operator toggles a service,
      // but only if the current value exactly matches the previous suggestion.
      const prevSuggestion = suggestedMonthly(prev);
      const currentCents = Math.round((parseFloat(monthlyField) || 0) * 100);
      if (currentCents === prevSuggestion) {
        const nextSuggestion = suggestedMonthly(next);
        setMonthlyField(String(nextSuggestion / 100));
      }
      return next;
    });
  }

  const isValid =
    workspaceId.trim() !== "" &&
    prospectName.trim() !== "" &&
    prospectFirstName.trim() !== "" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prospectEmail.trim()) &&
    monthlyPriceCents > 0 &&
    selectedServices.length > 0;

  async function handleContinue() {
    if (!isValid) return;
    setLoading(true);
    setError(null);

    const result = await createLiveSellCheckoutAction({
      prospectName: prospectName.trim(),
      prospectFirstName: prospectFirstName.trim(),
      prospectEmail: prospectEmail.trim().toLowerCase(),
      prospectPhone: prospectPhone.trim() || undefined,
      previewWorkspaceId: workspaceId,
      monthlyPriceCents,
      setupFeeCents,
      scopeItems: selectedServices.map((s) => ({ label: s.label })),
    });

    if (!result.ok) {
      const errorMessages: Record<string, string> = {
        unauthorized: "Please sign in and try again.",
        stripe_not_connected: "Stripe is not connected. Please connect Stripe first.",
        stripe_not_configured: "Stripe is not configured. Contact support.",
        stripe_publishable_key_missing: "Stripe publishable key is missing. Contact support.",
        checkout_session_missing_client_secret: "Could not create checkout session. Try again.",
      };
      setError(errorMessages[result.error] ?? `Error: ${result.error}`);
      setLoading(false);
      return;
    }

    onCheckoutReady(result.value);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Client details</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Which client workspace is this for, and who are we signing up?
        </p>
      </div>

      <div className="space-y-4">
        {/* Workspace picker */}
        <div className="space-y-1.5">
          <Label htmlFor="workspace-select">Client workspace</Label>
          {workspaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No client workspaces found.{" "}
              <Link href="/clients/new" className="underline underline-offset-4 text-primary">
                Build one first →
              </Link>
            </p>
          ) : (
            <select
              id="workspace-select"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading}
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-muted-foreground">
            Don&apos;t see it?{" "}
            <Link href="/clients/new" className="underline underline-offset-4 text-primary">
              Build one at /clients/new
            </Link>
          </p>
        </div>

        {/* Business / prospect name */}
        <div className="space-y-1.5">
          <Label htmlFor="prospect-name">Business name</Label>
          <Input
            id="prospect-name"
            placeholder="Acme Plumbing"
            value={prospectName}
            onChange={(e) => setProspectName(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Owner first name */}
        <div className="space-y-1.5">
          <Label htmlFor="prospect-first-name">Owner first name</Label>
          <Input
            id="prospect-first-name"
            placeholder="John"
            value={prospectFirstName}
            onChange={(e) => setProspectFirstName(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="prospect-email">Email</Label>
          <Input
            id="prospect-email"
            type="email"
            placeholder="john@acmeplumbing.com"
            value={prospectEmail}
            onChange={(e) => setProspectEmail(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Phone (optional) */}
        <div className="space-y-1.5">
          <Label htmlFor="prospect-phone">
            Phone <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="prospect-phone"
            type="tel"
            placeholder="+1 (555) 000-0000"
            value={prospectPhone}
            onChange={(e) => setProspectPhone(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>

      {/* ── Scope + Pricing config ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/80 bg-muted/30 p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold">What&apos;s included</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Toggle services to match this prospect&apos;s tier.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {DEFAULT_SERVICES.map((svc) => {
            const checked = enabledServices.has(svc.id);
            return (
              <label
                key={svc.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                  checked
                    ? "border-transparent bg-background shadow-sm"
                    : "border-transparent bg-transparent opacity-50"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-current flex-shrink-0"
                  style={checked ? { accentColor } : undefined}
                  checked={checked}
                  onChange={() => toggleService(svc.id)}
                  disabled={loading}
                />
                <span className="text-sm font-medium leading-tight">{svc.label}</span>
              </label>
            );
          })}
        </div>

        {/* Pricing fields */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="monthly-fee">Monthly fee ($)</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                $
              </span>
              <Input
                id="monthly-fee"
                type="number"
                min="1"
                step="1"
                placeholder="397"
                value={monthlyField}
                onChange={(e) => setMonthlyField(e.target.value)}
                className="pl-6"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="setup-fee">
              Setup fee ($){" "}
              <span className="text-muted-foreground font-normal text-xs">optional</span>
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                $
              </span>
              <Input
                id="setup-fee"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={setupField}
                onChange={(e) => setSetupField(e.target.value)}
                className="pl-6"
                disabled={loading}
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button
        onClick={handleContinue}
        disabled={!isValid || loading || workspaces.length === 0}
        size="lg"
        className="w-full"
        style={isValid && !loading ? { backgroundColor: accentColor, color: "#fff", borderColor: accentColor } : undefined}
      >
        {loading ? "Creating checkout..." : "Continue to payment →"}
      </Button>
    </div>
  );
}
