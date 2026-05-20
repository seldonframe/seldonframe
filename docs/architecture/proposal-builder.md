# Proposal Builder — architecture reference

**Status:** Shipped 2026-05-19
**Spec:** `docs/superpowers/specs/2026-05-19-proposal-builder-design.md`
**Plan:** `docs/superpowers/plans/2026-05-19-proposal-builder.md`

## What it is

An agency operator sends a branded, AI-generated proposal to a prospect with a **live working workspace already built** as part of the pitch. Prospect clicks Accept → Stripe Checkout → recurring subscription on the agency's Stripe account (SeldonFrame takes 0%) → preview workspace flips to active → onboarding email fires.

## Critical files

| Concern | File |
|---|---|
| Data model | `packages/crm/drizzle/0049_proposals.sql` + `packages/crm/src/db/schema/proposals.ts` + `proposal-events.ts` |
| Lifecycle transitions | `packages/crm/src/lib/proposals/status.ts` |
| Signed tokens | `packages/crm/src/lib/proposals/signed-token.ts` |
| Stripe Connect | `packages/crm/src/lib/proposals/stripe-connect.ts` + `/api/v1/proposals/connect/{start,return}` |
| HTML generation | `packages/crm/src/lib/proposals/generate-html.ts` |
| Orchestrator | `packages/crm/src/lib/proposals/create.ts` |
| Checkout | `packages/crm/src/lib/proposals/checkout.ts` + `/p/[token]/accept/route.ts` |
| Webhook | `packages/crm/src/app/api/webhooks/stripe/connect/route.ts` (extended) |
| Activation | `packages/crm/src/lib/proposals/activate-workspace.ts` |
| Per-agency template | `users.agency_profile.proposalTemplate` JSONB |
| TTL expiry | `packages/crm/src/lib/proposals/expire-stale.ts` + `/api/cron/expire-proposals/route.ts` |
| Tier gate | `packages/crm/src/lib/proposals/check-tier-quota.ts` |
| POST route | `packages/crm/src/app/api/v1/proposals/route.ts` |

## Env vars

Most are already set if your platform was billing customers before Proposal Builder shipped:

| Var | Status | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Existing | Used for both platform billing and now Express account creation |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Existing | Same secret the existing SMB-billing Connect webhook uses |
| `CRON_SECRET` | Existing | 9 prior cron routes already depend on it |
| `NEXT_PUBLIC_APP_URL` | Existing | Base URL for Stripe return URLs |
| `WORKSPACE_BASE_DOMAIN` | Existing | Workspace subdomain suffix |
| `ANTHROPIC_API_KEY` | Existing | Fallback when operator has no BYOK key |

**Net new for Proposal Builder: nothing.** The only action required before the first proposal acceptance is making sure your Stripe Connect webhook endpoint listens to `checkout.session.completed` in addition to the existing events.

> **Removed from this doc:** `STRIPE_CONNECT_CLIENT_ID` was over-specified in the initial plan. The code never reads it. Express accounts are created via direct API (`stripe.accounts.create({ type: "express" })`) using `STRIPE_SECRET_KEY`. Client IDs are only required for OAuth flows (Standard accounts), which Proposal Builder does not use.

## Health checks

1. Visit `/proposals/onboarding` — the Connect status pill must show **Ready** (green) for the agency operator.
2. Query `stripe_connections` for the agency's `org_id` row: `is_active=true`.
3. Send a test proposal to your own email alias; open the public link `/p/[token]`; click Accept; check:
   - `proposals.status = accepted`
   - `organizations.preview_mode = false` for the preview workspace
   - Agency notification email and prospect onboarding email arrived.
4. Verify the cron by calling `GET /api/cron/expire-proposals` with `Authorization: Bearer <CRON_SECRET>` — returns `{"expired": 0}` if no stale proposals exist.

## Common ops

### "Agency onboarding stuck on Pending"

The Stripe-hosted Express onboarding sometimes leaves an account in a `payouts_enabled=false, charges_enabled=true` state pending bank verification. Re-issue an onboarding link from a Node REPL:

```ts
const link = await stripe.accountLinks.create({
  account: "acct_xxx",
  type: "account_onboarding",
  return_url: "https://app.seldonframe.com/api/v1/proposals/connect/return?account_id=acct_xxx",
  refresh_url: "https://app.seldonframe.com/proposals/onboarding?retry=1",
});
console.log(link.url); // send to operator
```

### "Preview workspace stuck — webhook never fired"

Check Stripe Dashboard → Developers → Webhooks for the **Connect** endpoint (distinct from the platform endpoint). If `proposals.status` is not `accepted` but the Stripe subscription exists, look for `checkout.session.completed` in the failed-delivery list and re-send.

Manual recovery (last resort):

```sql
UPDATE proposals
SET status='accepted', accepted_at=NOW(),
    stripe_subscription_id='sub_xxx', stripe_customer_id='cus_xxx'
WHERE id='prop_xxx';

UPDATE organizations
SET preview_mode=false
WHERE id='ws_xxx';
```

### "Prospect clicked Accept twice — got two subscriptions"

Idempotency key on Checkout session create is `proposal-{id}`. If Stripe returns a duplicate, check `proposals.stripe_checkout_session_id` — it should be set on the first Accept and unchanged on retry. The webhook handler also checks `proposal.status === 'accepted'` before re-applying activation.

### "Agency hit Growth quota — can't create more proposals"

`evaluateProposalQuota` returns 402 with `reason="monthly_quota_exceeded"` and `capacity=10`. The operator must upgrade to Scale tier (set `users.plan_id = 'scale'` in DB or via the billing flow).

## Failure modes + fallbacks

| Failure | Fallback |
|---|---|
| Soul extraction fails on prospect URL | Operator manually fills prospect_name + services in `/proposals/new`; code falls back to hostname as name |
| LLM HTML generation times out | Returns 502 `html_generation_failed`; operator retries from `/proposals/new` |
| Preview workspace provisioning fails | `proposal` row still creates with `preview_workspace_id=null`; public page hides the iframe section gracefully |
| Email send fails (Resend down) | Proposal status stays `draft`; operator retries from `/proposals/[id]` |
| Stripe webhook arrives out of order | `activateProposalWorkspace` is idempotent — re-runs harmlessly |
| TTL cron: CRON_SECRET mismatch | Returns 401 — check Vercel env var matches the secret in Vercel project settings |

## Feature flag

Set `PROPOSAL_BUILDER_ENABLED=false` to hide all proposal UI surfaces (nav links, `/proposals` routes) for emergency rollback. Backend tables remain intact; existing proposals are unaffected.

## TTL cron schedule

| Cron path | Schedule | Purpose |
|---|---|---|
| `/api/cron/expire-proposals` | `0 3 * * *` | Expire `sent`/`viewed` proposals past `expires_at` (default 30 days) |

## Tier quotas

| Plan (`users.plan_id`) | Monthly proposal cap |
|---|---|
| `free` (default) | 0 — blocked entirely |
| `growth` | 10 |
| `scale` | Unlimited |
