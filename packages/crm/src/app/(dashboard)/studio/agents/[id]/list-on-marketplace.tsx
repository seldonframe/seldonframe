"use client";

// ICP-3 / Phase 3 (seller side) — "List on the marketplace" panel.
//
// Lives in the Studio agent editor header. Lets a builder publish the template
// they're editing as a kind:'agent' marketplace listing in a few clicks:
//   - category (niche) + marketing tagline + tags
//   - price: Free, or a one-time install price in dollars
//   - a LIVE preview using the real marketplace AgentCard, so they see exactly
//     how the listing will look in the storefront
// On submit it calls publishOrUpdateAgentListingAction. A PAID listing needs an
// active Stripe Connect account; if the seller hasn't connected, we surface the
// SAME connect onboarding entry the proposals flow uses (POST
// /api/v1/proposals/connect/start) and keep the draft saved.
//
// NOTE: the 2% marketplace fee is NOT shown here — it appears ONLY on the
// earnings dashboard. This surface is about getting listed; the fee is disclosed
// where the money is shown.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Store, ExternalLink, Eye, Check } from "lucide-react";
import { AgentCard } from "@/components/marketplace/agent-card";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import {
  buildPreviewStorefrontAgent,
  CATEGORY_ORDER,
  CATEGORY_META,
  type CategoryKey,
} from "@/components/marketplace/marketplace-data";
import {
  publishOrUpdateAgentListingAction,
  unpublishAgentListingAction,
  republishAgentListingAction,
  type SellerListingView,
  type SellerConnectStatus,
} from "@/lib/marketplace/seller-actions";

type Props = {
  templateId: string;
  templateName: string;
  agentType: string | null;
  builderName: string;
  initialListing: SellerListingView | null;
  initialConnect: SellerConnectStatus;
};

/** Map a stored niche string back onto a CategoryKey for the select default. */
function nicheToCategoryKey(niche: string | null | undefined): CategoryKey {
  const want = (niche ?? "").trim();
  const hit = CATEGORY_ORDER.find((k) => k.toLowerCase() === want.toLowerCase());
  return hit ?? "Receptionist";
}

const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://app.seldonframe.com";

export function ListOnMarketplace(props: Props) {
  const router = useRouter();
  const existing = props.initialListing;

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CategoryKey>(
    nicheToCategoryKey(existing?.niche),
  );
  const [isPaid, setIsPaid] = useState<boolean>((existing?.priceCents ?? 0) > 0);
  const [priceDollars, setPriceDollars] = useState<string>(
    existing && existing.priceCents > 0 ? String(Math.round(existing.priceCents / 100)) : "",
  );
  const [description, setDescription] = useState<string>(existing?.description ?? "");
  const [tagsInput, setTagsInput] = useState<string>((existing?.tags ?? []).join(", "));

  const [isSaving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(
    existing?.isPublished ? existing.slug : null,
  );
  const [savedDraft, setSavedDraft] = useState(false);

  const priceCents = useMemo(() => {
    if (!isPaid) return 0;
    const n = Number(priceDollars);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  }, [isPaid, priceDollars]);

  const tags = useMemo(
    () => tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
    [tagsInput],
  );

  const preview = useMemo(
    () =>
      buildPreviewStorefrontAgent({
        name: props.templateName,
        priceCents,
        niche: category,
        agentType: props.agentType,
        description,
        builder: props.builderName,
        installCount: existing?.installCount ?? 0,
      }),
    [props.templateName, props.agentType, props.builderName, priceCents, category, description, existing?.installCount],
  );

  const isLive = Boolean(publishedSlug);
  const listingSlug = publishedSlug ?? existing?.slug ?? null;

  const submit = () => {
    setError(null);
    setNeedsConnect(false);
    setSavedDraft(false);
    startSave(async () => {
      const result = await publishOrUpdateAgentListingAction({
        templateId: props.templateId,
        priceCents,
        niche: category,
        description: description.trim() || undefined,
        tags,
      });
      if (result.ok) {
        setPublishedSlug(result.isPublished ? result.slug : null);
        if (!result.isPublished) setSavedDraft(true);
        router.refresh();
        return;
      }
      if (result.error === "needs_connect") {
        // Draft was saved; seller must connect Stripe before it can go live.
        setNeedsConnect(true);
        setSavedDraft(true);
        router.refresh();
        return;
      }
      setError(
        result.error === "template_not_found"
          ? "Template not found."
          : result.error === "unauthorized"
            ? "You don't have access to this template."
            : "Couldn't save the listing. Try again.",
      );
    });
  };

  const unpublish = () => {
    setError(null);
    startSave(async () => {
      const result = await unpublishAgentListingAction({ templateId: props.templateId });
      if (result.ok) {
        setPublishedSlug(null);
        router.refresh();
      } else {
        setError("Couldn't unpublish. Try again.");
      }
    });
  };

  const republish = () => {
    setError(null);
    setNeedsConnect(false);
    startSave(async () => {
      const result = await republishAgentListingAction({ templateId: props.templateId });
      if (result.ok) {
        setPublishedSlug(result.slug);
        router.refresh();
      } else if (result.error === "needs_connect") {
        setNeedsConnect(true);
      } else {
        setError("Couldn't republish. Try again.");
      }
    });
  };

  async function startConnect() {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/proposals/connect/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: "US" }),
      });
      const data: { url?: string; error?: string; message?: string } = await res
        .json()
        .catch(() => ({ error: "non_json" }));
      if (!res.ok || !data.url) {
        throw new Error(data.message ?? data.error ?? "connect_start_failed");
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start Stripe Connect.");
      setConnecting(false);
    }
  }

  // ── Collapsed: a button + the current status chip. ──
  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="crm-button-secondary inline-flex h-9 items-center gap-1.5 px-4 text-sm"
        >
          <Store className="size-4" />
          {existing ? "Marketplace listing" : "List on the marketplace"}
        </button>
        {existing ? (
          <span className="inline-flex items-center gap-1 text-[11px]">
            {isLive ? (
              <Link
                href={`/marketplace/${listingSlug}`}
                target="_blank"
                className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                Live · view listing
                <ExternalLink className="size-3" />
              </Link>
            ) : (
              <span className="text-muted-foreground">Saved as draft — not live</span>
            )}
          </span>
        ) : null}
      </div>
    );
  }

  // ── Expanded: the publish panel. ──
  return (
    <div className="w-full rounded-xl border bg-card p-5">
      <MarketplaceStyles />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          >
            <Store className="size-4" />
          </span>
          <div>
            <h2 className="text-card-title">List on the marketplace</h2>
            <p className="text-xs text-muted-foreground">
              Publish this agent so other builders can install it. You set the
              price; buyers run it on their own workspace.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        {/* ── form ── */}
        <div className="space-y-4">
          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="mkt-category">
              Category
            </label>
            <select
              id="mkt-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryKey)}
              disabled={isSaving}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
            >
              {CATEGORY_ORDER.map((key) => (
                <option key={key} value={key}>
                  {CATEGORY_META[key].label}
                </option>
              ))}
            </select>
          </div>

          {/* Tagline / marketing description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="mkt-tagline">
              Tagline
            </label>
            <textarea
              id="mkt-tagline"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={160}
              disabled={isSaving}
              placeholder="One line that sells it — e.g. Answers every call and books the job, 24/7."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
            />
            <p className="text-[11px] text-muted-foreground">
              Shown on the listing card. Defaults to the agent name if left blank.
            </p>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="mkt-tags">
              Tags <span className="text-muted-foreground">(comma-separated, optional)</span>
            </label>
            <input
              id="mkt-tags"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              disabled={isSaving}
              placeholder="plumbing, emergency, after-hours"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
            />
          </div>

          {/* Price */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-foreground">Price</span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="mkt-price-mode"
                  checked={!isPaid}
                  onChange={() => setIsPaid(false)}
                  disabled={isSaving}
                />
                Free
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="mkt-price-mode"
                  checked={isPaid}
                  onChange={() => setIsPaid(true)}
                  disabled={isSaving}
                />
                One-time price
              </label>
              {isPaid ? (
                <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    value={priceDollars}
                    onChange={(e) => setPriceDollars(e.target.value)}
                    disabled={isSaving}
                    placeholder="49"
                    className="h-9 w-20 bg-transparent text-sm focus:outline-none"
                  />
                  <span className="text-xs text-muted-foreground">per install</span>
                </span>
              ) : null}
            </div>
            {isPaid ? (
              <p className="text-[11px] text-muted-foreground">
                Buyers pay this once to install. Payouts go to your Stripe account.
              </p>
            ) : null}
          </div>

          {/* Connect gate */}
          {needsConnect ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Your listing is saved as a draft. To sell a paid agent, connect a
                Stripe account so buyers can pay you — then publish.
              </p>
              <button
                type="button"
                onClick={startConnect}
                disabled={connecting}
                className="crm-button-primary mt-2 inline-flex h-9 items-center gap-1.5 px-4 text-sm"
              >
                {connecting ? "Opening Stripe…" : "Connect Stripe to publish"}
              </button>
            </div>
          ) : null}

          {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <button
              type="button"
              onClick={submit}
              disabled={isSaving}
              className="crm-button-primary h-10 px-5 text-sm"
            >
              {isSaving
                ? "Saving…"
                : isLive
                  ? "Save changes"
                  : existing
                    ? "Save & publish"
                    : "Publish to marketplace"}
            </button>

            {isLive && listingSlug ? (
              <>
                <Link
                  href={`/marketplace/${listingSlug}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  View live listing <ExternalLink className="size-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={unpublish}
                  disabled={isSaving}
                  className="text-sm text-muted-foreground hover:text-rose-600"
                >
                  Unpublish
                </button>
              </>
            ) : existing ? (
              <button
                type="button"
                onClick={republish}
                disabled={isSaving}
                className="crm-button-secondary h-10 px-4 text-sm"
              >
                Publish now
              </button>
            ) : null}

            {savedDraft && !isLive ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="size-3.5" /> Draft saved
              </span>
            ) : null}
            {isLive ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                <Check className="size-3.5" /> Live
              </span>
            ) : null}
          </div>

          {isLive && listingSlug ? (
            <p className="text-[11px] text-muted-foreground">
              Public link: {APP_ORIGIN}/marketplace/{listingSlug}
            </p>
          ) : null}
        </div>

        {/* ── live preview (the real marketplace card) ── */}
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Eye className="size-3.5" /> Listing preview
          </span>
          {/* Non-interactive: the card is a Link to /marketplace/[slug]; in the
              preview we neutralize navigation so clicking does nothing. The
              storefront uses its own font/background, so we wrap it on paper. */}
          <div
            className="pointer-events-none select-none rounded-2xl p-4"
            style={{ background: "#F6F2EA", fontFamily: "'Hanken Grotesk',system-ui,sans-serif" }}
            aria-hidden
          >
            <AgentCard agent={preview} />
          </div>
        </div>
      </div>
    </div>
  );
}
