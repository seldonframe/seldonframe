"use client";
// packages/crm/src/app/start/_components/step1-form.tsx
// Step 1 of the /start live-sell checkout.
// Collects: workspace (dropdown), business name, owner first name, email, phone.
// On "Continue" → calls createLiveSellCheckoutAction → transitions to Step 2
// by calling onCheckoutReady with the returned client_secret + account id.

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLiveSellCheckoutAction, type LiveSellCheckoutResult } from "../actions";

type Workspace = { id: string; name: string; slug: string };

type Step1FormProps = {
  workspaces: Workspace[];
  onCheckoutReady: (result: LiveSellCheckoutResult) => void;
  accentColor: string;
};

export function Step1Form({ workspaces, onCheckoutReady, accentColor }: Step1FormProps) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [prospectName, setProspectName] = useState("");
  const [prospectFirstName, setProspectFirstName] = useState("");
  const [prospectEmail, setProspectEmail] = useState("");
  const [prospectPhone, setProspectPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid =
    workspaceId.trim() !== "" &&
    prospectName.trim() !== "" &&
    prospectFirstName.trim() !== "" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prospectEmail.trim());

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
