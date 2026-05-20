"use client";
// packages/crm/src/app/(dashboard)/proposals/new/proposal-new-form.tsx
// 2026-05-19 — Proposal Builder client form. Paste prospect URL, pick
// pricing tier, click Generate. POSTs to /api/v1/proposals and redirects
// to /proposals/[id] on success. Spec: §"Proposal creation".

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Tier = "starter" | "growth" | "pro" | "custom";

const TIERS: Array<{ id: Tier; label: string; price: string }> = [
  { id: "starter", label: "Starter", price: "$297/mo" },
  { id: "growth", label: "Growth", price: "$497/mo" },
  { id: "pro", label: "Pro", price: "$997/mo" },
  { id: "custom", label: "Custom", price: "—" },
];

export function ProposalNewForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<Tier>("growth");
  const [customCents, setCustomCents] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prospect_url: url,
          prospect_email: email,
          pricing_tier: tier,
          custom_cents: tier === "custom" ? Number(customCents) * 100 : undefined,
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">New proposal</h1>
        <p className="text-muted-foreground">
          Paste the prospect&apos;s website. We&apos;ll build a working workspace and generate the
          proposal.
        </p>
      </header>

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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Building workspace + generating proposal…" : "Generate proposal"}
      </Button>
    </form>
  );
}
