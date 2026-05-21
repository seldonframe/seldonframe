"use client";
// packages/crm/src/app/(dashboard)/proposals/new/proposal-new-form.tsx
// 2026-05-19 — Proposal Builder client form. Paste prospect URL, pick
// pricing tier, click Generate. POSTs to /api/v1/proposals and redirects
// to /proposals/[id] on success. Spec: §"Proposal creation".
// 2026-05-20 — Phase B: accepts agencyContext prop; renders ProposalPreviewPane
// as a sibling so the parent grid handles the two-column layout.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AgencyProposalTemplate } from "@/db/schema/agency-profile";
import { ProposalPreviewPane } from "./proposal-preview-pane";

type Tier = "starter" | "growth" | "pro" | "custom";

const TIERS: Array<{ id: Tier; label: string; price: string }> = [
  { id: "starter", label: "Starter", price: "$297/mo" },
  { id: "growth", label: "Growth", price: "$497/mo" },
  { id: "pro", label: "Pro", price: "$997/mo" },
  { id: "custom", label: "Custom", price: "—" },
];

type AgencyContext = {
  name: string;
  brandColor: string;
  logoUrl: string | null;
  template: AgencyProposalTemplate;
};

export function ProposalNewForm({ agencyContext }: { agencyContext: AgencyContext }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [prospectFirstName, setProspectFirstName] = useState("");
  const [tier, setTier] = useState<Tier>("growth");
  const [customCents, setCustomCents] = useState("");
  const [setupFeeDollars, setSetupFeeDollars] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const setupFeeCents = setupFeeDollars
        ? Math.max(0, Math.min(1_000_000, Math.round(Number(setupFeeDollars) * 100)))
        : 0;
      const res = await fetch("/api/v1/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prospect_url: url,
          prospect_email: email,
          prospect_first_name: prospectFirstName.trim() || undefined,
          pricing_tier: tier,
          custom_cents: tier === "custom" ? Number(customCents) * 100 : undefined,
          setup_fee_cents: setupFeeCents,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `error_${res.status}`);
      router.push(`/proposals/${data.proposal.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "create_failed");
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Left column — form */}
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">New proposal</h1>
          <p className="text-muted-foreground">
            Paste the prospect&apos;s website. We&apos;ll build a working workspace and generate
            the proposal.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="url">Prospect website URL</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="email">Prospect email</Label>
            <Input
              id="email"
              type="email"
              placeholder="owner@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="first-name">
              Prospect first name{" "}
              <span className="text-muted-foreground text-xs">(optional — for personalized greeting)</span>
            </Label>
            <Input
              id="first-name"
              type="text"
              placeholder="John"
              value={prospectFirstName}
              onChange={(e) => setProspectFirstName(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-3">
            <Label>Monthly price</Label>
            <div className="grid grid-cols-4 gap-3">
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTier(t.id)}
                  className={`rounded-xl border p-3 text-left ${
                    tier === t.id ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs text-muted-foreground">{t.price}</div>
                </button>
              ))}
            </div>
            {tier === "custom" && (
              <Input
                type="number"
                placeholder="Custom monthly price (USD)"
                value={customCents}
                onChange={(e) => setCustomCents(e.target.value)}
                min={50}
              />
            )}
          </div>

          <div className="space-y-3">
            <Label htmlFor="setup-fee">
              Setup fee <span className="text-muted-foreground text-xs">(optional, one-time)</span>
            </Label>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">$</span>
              <Input
                id="setup-fee"
                type="number"
                placeholder="0"
                value={setupFeeDollars}
                onChange={(e) => setSetupFeeDollars(e.target.value)}
                min={0}
                max={10000}
                step={50}
              />
              <span className="text-muted-foreground text-sm">one-time</span>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Building workspace + generating proposal…" : "Generate proposal"}
          </Button>
        </form>
      </div>

      {/* Right column — live preview (rendered by the parent grid) */}
      <ProposalPreviewPane
        agencyContext={agencyContext}
        formState={{ url, email, prospectFirstName, tier, customCents, setupFeeDollars }}
      />
    </>
  );
}
