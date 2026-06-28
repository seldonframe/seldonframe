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
// A calm, state-aware SellingClarityBanner sits at the top of the panel and
// explains how selling AGENTS prices + bills (proposals billing was already
// clear; selling agents wasn't). It names the REAL marketplace fee sourced from
// MARKETPLACE_FEE_PERCENT (gmv.ts) — the same percent the earnings dashboard
// shows — so the two surfaces never disagree, and it reacts to the seller's
// Stripe Connect status (✓ active · ⚠ connect-to-enable · silent when free).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Store, ExternalLink, Eye, Check, BadgeCheck, AlertTriangle } from "lucide-react";
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
import {
  OUTCOME_TYPES,
  priceModelLabel,
  sellingBannerState,
  type OutcomeType,
  type PriceModel,
} from "@/lib/marketplace/pricing-model";
import { MARKETPLACE_FEE_PERCENT } from "@/lib/billing/gmv";

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

// ── pricing-model selector (BUILD #2) ──
// The visible selector has 5 modes. "free" and "onetime" both persist as the
// `onetime` schema model (free = $0); the other three map 1:1 to their schema
// model. Audience is guidance, not a gate — all five are always selectable.
type PriceMode = "free" | "onetime" | "monthly" | "per_usage" | "per_outcome";
const PRICE_MODES: PriceMode[] = ["free", "onetime", "monthly", "per_usage", "per_outcome"];
const PRICE_MODE_LABEL: Record<PriceMode, string> = {
  free: "Free",
  onetime: "One-time",
  monthly: "Monthly",
  per_usage: "Per-usage",
  per_outcome: "Per-outcome",
};

/** Derive the initial selector mode from the seller's existing listing. */
function deriveInitialMode(listing: SellerListingView | null): PriceMode {
  if (!listing) return "free";
  switch (listing.priceModel) {
    case "monthly":
      return "monthly";
    case "per_usage":
      return "per_usage";
    case "per_outcome":
      return "per_outcome";
    case "onetime":
    default:
      // onetime with a positive price reads as "One-time"; $0 reads as "Free".
      return (listing.priceCents ?? 0) > 0 ? "onetime" : "free";
  }
}

/** cents → whole-dollar input string ("" when unset/0). */
function centsToDollarStr(cents: number | null | undefined): string {
  const n = Number(cents);
  return Number.isFinite(n) && n > 0 ? String(Math.round(n / 100)) : "";
}

/** whole-dollar input string → integer cents (0 when blank/invalid). */
function dollarsToCents(dollars: string): number {
  const n = Number(dollars);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

/** A "$ [amount] suffix" inline money field. */
function PriceField(props: {
  amount: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  suffix: string;
  help?: string;
}) {
  return (
    <div className="space-y-1.5">
      <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2">
        <span className="text-sm text-muted-foreground">$</span>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          value={props.amount}
          onChange={(e) => props.onChange(e.target.value)}
          disabled={props.disabled}
          placeholder={props.placeholder}
          className="h-9 w-20 bg-transparent text-sm focus:outline-none"
        />
        <span className="text-xs text-muted-foreground">{props.suffix}</span>
      </span>
      {props.help ? <p className="text-[11px] text-muted-foreground">{props.help}</p> : null}
    </div>
  );
}

/**
 * Calm "how selling works" explainer for the listing editor. Always states the
 * model (free = instant; paid = billed through the seller's connected Stripe,
 * payouts minus the marketplace fee; buyers run on their own keys). Then ONE
 * state-aware line driven by `sellingBannerState`:
 *   - active        → ✓ Stripe connected — paid pricing is active.
 *   - needs_connect → ⚠ connect Stripe to turn on paid pricing (lists Free until then) + CTA.
 *   - free          → (no extra line; free is fine).
 * Mobile-friendly + live tokens (bg-primary/5 · border-border · muted text;
 * amber only for the warning). Stateless — the connect CTA reuses the parent's
 * existing startConnect (same POST /api/v1/proposals/connect/start as Proposals).
 */
function SellingClarityBanner(props: {
  connectReady: boolean;
  isPaidSelected: boolean;
  onConnect: () => void;
  connecting: boolean;
}) {
  const state = sellingBannerState({
    connectReady: props.connectReady,
    isPaidSelected: props.isPaidSelected,
  });

  return (
    <div className="rounded-lg border border-border bg-primary/5 p-3 sm:p-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">How selling works:</span>{" "}
        Free agents go live instantly. <span className="font-medium text-foreground">Paid</span>{" "}
        agents (one-time or monthly) bill the buyer through{" "}
        <span className="font-medium text-foreground">your connected Stripe</span> — payouts go
        to you, minus a{" "}
        <span className="font-medium text-foreground">{MARKETPLACE_FEE_PERCENT}% marketplace fee</span>.
        Buyers run the agent on <span className="font-medium text-foreground">their own keys</span>{" "}
        (BYOK).
      </p>

      {state === "active" ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <BadgeCheck className="size-3.5 shrink-0" aria-hidden />
          Stripe connected — paid pricing is active.
        </p>
      ) : null}

      {state === "needs_connect" ? (
        <div className="mt-2.5 flex flex-col gap-1.5 border-t border-amber-500/20 pt-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              Connect Stripe to turn on paid pricing — until then your agent lists as{" "}
              <span className="font-medium">Free to install</span>.
            </span>
          </p>
          <button
            type="button"
            onClick={props.onConnect}
            disabled={props.connecting}
            className="shrink-0 self-start whitespace-nowrap text-xs font-medium text-primary hover:underline disabled:opacity-60"
          >
            {props.connecting ? "Opening Stripe…" : "Connect Stripe →"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ListOnMarketplace(props: Props) {
  const router = useRouter();
  const existing = props.initialListing;

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CategoryKey>(
    nicheToCategoryKey(existing?.niche),
  );

  // ── pricing model (BUILD #2) ──
  // The visible selector has 5 options; "Free" and "One-time" both map to the
  // `onetime` schema model (Free = $0, One-time = $X). Re-hydrate from the
  // existing listing so editing shows the seller's current model.
  const initialMode = deriveInitialMode(existing);
  const [priceMode, setPriceMode] = useState<PriceMode>(initialMode);
  // One dollar field per paid mode, kept independent so switching models doesn't
  // clobber a previously-typed amount.
  const [onetimeDollars, setOnetimeDollars] = useState<string>(
    initialMode === "onetime" ? centsToDollarStr(existing?.priceCents) : "",
  );
  const [monthlyDollars, setMonthlyDollars] = useState<string>(
    centsToDollarStr(existing?.monthlyPriceCents),
  );
  const [perCallDollars, setPerCallDollars] = useState<string>(
    centsToDollarStr(existing?.perCallPriceCents),
  );
  const [perOutcomeDollars, setPerOutcomeDollars] = useState<string>(
    centsToDollarStr(existing?.perOutcomePriceCents),
  );
  const [outcomeType, setOutcomeType] = useState<OutcomeType>(
    existing?.outcomeType ?? "booking",
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

  // Map the 5-way UI mode + the matching dollar field onto the schema's pricing
  // model + cents. Free/One-time both resolve to the `onetime` model.
  const pricing = useMemo(() => {
    const onetimeCents = dollarsToCents(onetimeDollars);
    const monthlyCents = dollarsToCents(monthlyDollars);
    const perCallCents = dollarsToCents(perCallDollars);
    const perOutcomeCents = dollarsToCents(perOutcomeDollars);
    const priceModel: PriceModel = priceMode === "free" ? "onetime" : priceMode;
    return {
      priceModel,
      // priceCents is the one-time price column; 0 for free + non-onetime models.
      priceCents: priceMode === "onetime" ? onetimeCents : 0,
      monthlyPriceCents: monthlyCents,
      perCallPriceCents: perCallCents,
      perOutcomePriceCents: perOutcomeCents,
      outcomeType,
    };
  }, [priceMode, onetimeDollars, monthlyDollars, perCallDollars, perOutcomeDollars, outcomeType]);

  // ── selling clarity banner inputs ──
  // connectReady comes straight from the server prop the editor page wires from
  // readConnectStatus (via getSellerListingContextAction). Fail-soft: the page
  // defaults initialConnect to { ready:false } when the context read fails, so
  // an unknown status reads as not-connected (neutral explainer, never a false
  // "active"). isPaidSelected mirrors the publish gate's `isPaid`: any model
  // with a positive amount under the CURRENT selection.
  const connectReady = props.initialConnect.ready === true;
  const isPaidSelected = useMemo(
    () =>
      pricing.priceCents > 0 ||
      (pricing.monthlyPriceCents ?? 0) > 0 ||
      (pricing.perCallPriceCents ?? 0) > 0 ||
      (pricing.perOutcomePriceCents ?? 0) > 0,
    [pricing],
  );

  // The human price label the live preview card shows ("$29/mo", "$2 per call",
  // "$10 per booking", "Free", "$49 one-time"). Shared pure helper.
  const priceText = useMemo(
    () =>
      priceModelLabel({
        priceModel: pricing.priceModel,
        priceCents: pricing.priceCents,
        monthlyPriceCents: pricing.monthlyPriceCents,
        perCallPriceCents: pricing.perCallPriceCents,
        perOutcomePriceCents: pricing.perOutcomePriceCents,
        outcomeType: pricing.outcomeType,
      }),
    [pricing],
  );

  const tags = useMemo(
    () => tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
    [tagsInput],
  );

  const preview = useMemo(
    () =>
      buildPreviewStorefrontAgent({
        name: props.templateName,
        priceCents: pricing.priceCents,
        // Always pass the model-aware label so the preview reads exactly what
        // the seller chose: "Free", "$49 one-time", "$29/mo", "$2 per call",
        // "$10 per booking".
        priceLabel: priceText,
        niche: category,
        agentType: props.agentType,
        description,
        builder: props.builderName,
        installCount: existing?.installCount ?? 0,
      }),
    [props.templateName, props.agentType, props.builderName, pricing, priceText, category, description, existing?.installCount],
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
        priceCents: pricing.priceCents,
        priceModel: pricing.priceModel,
        monthlyPriceCents: pricing.monthlyPriceCents,
        perCallPriceCents: pricing.perCallPriceCents,
        perOutcomePriceCents: pricing.perOutcomePriceCents,
        outcomeType: pricing.outcomeType,
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
          {/* Calm, state-aware explainer: how selling agents prices + bills. */}
          <SellingClarityBanner
            connectReady={connectReady}
            isPaidSelected={isPaidSelected}
            onConnect={startConnect}
            connecting={connecting}
          />

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

          {/* Pricing model (BUILD #2) */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-foreground">Pricing</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pricing model">
              {PRICE_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={priceMode === mode}
                  onClick={() => setPriceMode(mode)}
                  disabled={isSaving}
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition disabled:opacity-60 ${
                    priceMode === mode
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {PRICE_MODE_LABEL[mode]}
                </button>
              ))}
            </div>

            {/* Audience guidance — NOT a gate. All models are available to anyone. */}
            <p className="text-[11px] text-muted-foreground">
              Selling to businesses? Flat or monthly. Selling to other agents/devs?
              Per-usage or per-outcome — all are available.
            </p>

            {/* Conditional amount field per model */}
            {priceMode === "free" ? (
              <p className="text-[11px] text-muted-foreground">
                Free to install. Anyone can add it to their workspace at no charge.
              </p>
            ) : null}

            {priceMode === "onetime" ? (
              <PriceField
                amount={onetimeDollars}
                onChange={setOnetimeDollars}
                disabled={isSaving}
                placeholder="49"
                suffix="per install"
                help="Buyers pay this once to install. Payouts go to your Stripe account."
              />
            ) : null}

            {priceMode === "monthly" ? (
              <PriceField
                amount={monthlyDollars}
                onChange={setMonthlyDollars}
                disabled={isSaving}
                placeholder="29"
                suffix="/mo"
                help="Buyers are billed monthly. Recurring payouts go to your Stripe account."
              />
            ) : null}

            {priceMode === "per_usage" ? (
              <PriceField
                amount={perCallDollars}
                onChange={setPerCallDollars}
                disabled={isSaving}
                placeholder="2"
                suffix="per call"
                help="Metered per agent call — ideal when other agents/devs rent the skill via MCP."
              />
            ) : null}

            {priceMode === "per_outcome" ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <PriceField
                    amount={perOutcomeDollars}
                    onChange={setPerOutcomeDollars}
                    disabled={isSaving}
                    placeholder="10"
                    suffix="per"
                  />
                  <select
                    aria-label="Billable outcome"
                    value={outcomeType}
                    onChange={(e) => setOutcomeType(e.target.value as OutcomeType)}
                    disabled={isSaving}
                    className="h-9 rounded-md border bg-background px-2 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
                  >
                    {OUTCOME_TYPES.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Pay only for results — you charge per {outcomeType}. 27% of SMBs
                  now prefer outcome pricing.
                </p>
              </div>
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
