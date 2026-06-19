# Stripe setup — SeldonFrame pricing (Builder / Workspace / Agency)

> **Audience:** Max. Create these products in Stripe, copy each resulting
> **price id** into the matching env var, and the backend picks them up.
> The code never sees your secret key — it only reads these price-id env
> vars. Do **test mode first**, validate end-to-end, then repeat in
> **live mode** and swap the env values.

## What to create

Create **4 prices** across **3 products**. All are **recurring / monthly**,
currency **USD**.

| # | Product name              | Price        | Billing   | Usage type            | Paste price id into env var                    |
|---|---------------------------|--------------|-----------|-----------------------|------------------------------------------------|
| 1 | **Builder**               | **$19/mo**   | Recurring | Flat / licensed (qty 1) | `STRIPE_BUILDER_PRICE_ID`                      |
| 2 | **Workspace**             | **$49/mo**   | Recurring | Flat / licensed (qty 1) | `STRIPE_WORKSPACE_PRICE_ID`                    |
| 3 | **Agency**                | **$297/mo**  | Recurring | Flat / licensed (qty 1) | `STRIPE_AGENCY_BASE_PRICE_ID`                  |
| 4 | **Extra client workspace**| **$10/mo**   | Recurring | **Licensed (quantity)** | `STRIPE_AGENCY_WORKSPACE_OVERAGE_PRICE_ID`     |

### Important details

- **Prices 1–3** are standard flat recurring prices. In the Stripe price
  editor: _Recurring_, _Monthly_, amount as above. "Usage type" =
  **Licensed** (the default — a fixed price charged each period). Leave
  quantity behavior default; checkout sends quantity = 1.
- **Price 4 (Extra client workspace)** MUST be created with
  **Usage type = Licensed (quantity)** — NOT metered/usage-based. This
  is the per-seat overage line: the backend sets its **quantity** to
  `max(0, activeClientWorkspaces − 10)` on an Agency subscription
  (Phase 4). A metered price would not let us set quantity directly, so
  it must be **licensed/quantity**.
  - Put it under its own product ("Extra client workspace") so it reads
    cleanly on the customer's invoice as a line item with a quantity.

## Step-by-step (per mode)

1. Stripe Dashboard → **Products** → **Add product** for each of the 3
   products above. Add the price with the amount + _Recurring · Monthly_.
2. For **Extra client workspace**, when adding the price choose
   **Usage type → Licensed** and confirm it shows as a per-unit
   quantity price (so invoices show "Qty × $10").
3. Open each created **price**, copy its **API ID** (`price_…`).
4. Paste into the env (`.env.local` for local, Vercel project env for
   deployed) using the env var names in the table.
5. Repeat the whole thing in **live mode** and paste the live price ids
   into the production env (replacing the test ids).

## Env block to paste

```dotenv
# SeldonFrame pricing — Stripe price ids (test mode first, then live)
STRIPE_BUILDER_PRICE_ID=price_xxx                    # Builder $19/mo
STRIPE_WORKSPACE_PRICE_ID=price_xxx                  # Workspace $49/mo
STRIPE_AGENCY_BASE_PRICE_ID=price_xxx                # Agency $297/mo base
STRIPE_AGENCY_WORKSPACE_OVERAGE_PRICE_ID=price_xxx   # Extra client workspace $10/mo (licensed/quantity)
```

## Notes

- Until these env vars are set, the code falls back to placeholder ids
  (`price_PLACEHOLDER_*`) so the app still builds and the tier catalog
  renders — but **real checkout will fail** until the live/test ids are
  pasted. The overage var has **no placeholder**: per-workspace overage
  sync is a no-op until you create that price.
- The card never touches our servers — checkout stays Stripe-hosted.
- Legacy Growth/Scale price ids remain wired for webhook back-compat
  during the migration; you do **not** need to recreate them.
