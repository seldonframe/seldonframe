# Partner-agency setup guide

End-to-end agency onboarding via Claude Code MCP. Drives the
existing `/api/v1/partner-agencies` ops and the partner-agency
branding system (`branding.ts`) to ship a fully white-labeled
client-ops platform.

This guide is the long-form companion to the 5 MCP tools in
`skills/mcp-server/src/tools.js`. The tool descriptions cover the
canonical happy path; this file covers the gotchas, edge cases,
and the order-of-operations decisions that turn a tooling
exercise into a smooth agency setup.

Reachable from: MCP tool descriptions (`register_partner_agency`,
`register_partner_agency_sender_domain`, etc.) reference this file
when the operator wants depth. Contributors maintaining the
backend ops should keep this guide in sync with the actual
behavior.

---

## What "white-label SaaS reselling" means in practice

A partner-agency is a top-level entity that owns multiple client
workspaces. The operator-facing chrome (brand name, logo, primary
+ accent colors, support URL, support email, custom sender email,
custom agency domain, hide-powered-by-badge) is substituted on
each workspace where `parent_agency_id` is set to the agency.

Concretely, after setup:
- The agency's brand replaces SeldonFrame's in every operator-
  facing surface (top nav, footer, dashboard chrome, email
  signatures, transactional emails).
- The agency can run its own custom domain (`crm.acmedigital.com`
  instead of `app.seldonframe.com`) — agency-level, applies to
  every attached client workspace.
- The agency can ship outbound email from a verified sender on
  its own domain (`welcome@acmedigital.com` instead of
  `welcome@seldonframe.com`).
- The "Powered by SeldonFrame" footer badge can be hidden
  entirely on the Scale tier.

The customer-facing surface (client's own landing page, booking
page, chatbot) is unaffected — clients still see their own
business's brand, not the agency's. The agency substitution is
strictly for the surface the agency operator + the agency's
operators interact with.

---

## Prerequisites

Before running the MCP onboarding flow:

1. **Owner workspace on the Scale tier** (`$99/mo`). The plan-gate
   in `registerPartnerAgency()` checks the caller's workspaces for
   any on Scale. If none, the agency is created in `pending`
   status; chrome substitution does not apply until status flips
   to `active` (which happens automatically when a workspace gets
   upgraded + the gate re-runs).
2. **RESEND_API_KEY configured on the SeldonFrame backend** if
   sender-domain registration is part of the setup. The
   `registerAgencySenderDomain()` op returns
   `error: "resend_not_configured"` otherwise.
3. **The agency's domain registrar credentials** so the operator
   can add the DNS records returned by step 2. Some registrars
   (Cloudflare) propagate DNS within 1-2 minutes; others
   (GoDaddy / older registrars) can take an hour+.

---

## Canonical onboarding sequence

### Step 1 — Register the agency

```
register_partner_agency({
  name: "Acme Digital",
  slug: "acme-digital",                  // optional; auto-derived
  logo_url: "https://...png",            // optional, recommend 256x256+ PNG
  primary_color: "#1FAE85",              // optional, hex
  accent_color: "#0e8364",               // optional, hex
  support_email: "help@acmedigital.com", // optional
  support_url: "https://acmedigital.com/help", // optional
  hide_powered_by_badge: false,          // optional, defaults false
})
```

**Returns:** `{ ok, agency: { id, slug, status, ... }, gated_pending, next_steps }`

**Decisions to surface:**
- If `gated_pending: true`, surface the upgrade path to the
  operator before continuing. The agency exists in the DB but
  chrome substitution won't apply until the plan-gate flips to
  Scale.
- If `slug_already_taken`, ask the operator for an alternative
  slug (they may need to claim a slug that matches their primary
  domain — e.g., `acme-digital` for `acmedigital.com`).

### Step 2 — Register the sender domain (optional but high-leverage)

```
register_partner_agency_sender_domain({
  agency_id: "<from step 1>",
  domain: "acmedigital.com",
  sender_local_part: "hello",  // optional, defaults to "welcome"
})
```

**Returns:** `{ ok, domain, sender_email_address, dns_records, status, next_steps }`

The `dns_records` array typically contains 3-5 records — usually:
- One `MX` record (for the sender's bounce handling)
- One or more `TXT` records (SPF + DKIM + DMARC)

**Critical operator-side work between step 2 and step 3:**

The operator MUST add the returned DNS records at their domain
registrar. Skip this and `verify_partner_agency_sender_domain`
will never flip to verified. Concretely:

1. Log into the domain registrar (Cloudflare / Namecheap / GoDaddy)
2. Navigate to DNS settings for the domain
3. Add each record from the `dns_records` array verbatim
4. Save

DNS propagation timing varies by registrar:
- Cloudflare: 1-5 minutes typical
- Namecheap: 5-15 minutes typical
- GoDaddy: 15-60 minutes typical
- Old/regional registrars: can take hours

### Step 3 — Verify the sender domain

```
verify_partner_agency_sender_domain({ agency_id })
```

**Returns:** `{ ok, verified, status, ... }`

Polls Resend. Idempotent. Safe to call repeatedly while waiting
for DNS propagation. Once `verified: true`:
- `verified_sender_at` on the agency row is set
- `sender_email_address` is populated (`<local>@<domain>`)
- The branding resolver exposes the verified sender to outbound
  email paths automatically — no further action needed

If `verified: false` after a reasonable wait (30+ min), help the
operator check:
- The DNS records were entered exactly as returned (no typos,
  no extra trailing dots, correct record type)
- The DNS is queryable via `dig TXT _resend.<domain>` from
  command-line
- The domain isn't already verified by a different Resend
  account (rare but happens with shared domains)

### Step 4 — Attach each client workspace

For each client workspace the agency manages:

```
attach_workspace_to_partner_agency({
  workspace_id: "<client workspace uuid>",
  agency_id: "<agency uuid from step 1>",
})
```

Chrome substitution applies on next page load in that workspace.

**Authorization model:** the caller must own BOTH the agency AND
the target workspace. Anonymous workspaces (created via
`create_workspace_v2` without a claimed owner) can self-attach
via the polymorphic-ownership path documented in `store.ts`.

---

## Edge cases + gotchas

### Plan-gate timing

The plan-gate runs at registration time AND on attach. If an
operator registers an agency before upgrading to Scale, the
agency persists in `pending` status. They have to either:

1. Upgrade a workspace to Scale, then re-run `register_partner_agency`
   with the same name (the registration logic detects the existing
   `pending` agency and flips status to `active`).
2. Wait for the nightly status-check cron job (if shipped) to
   detect their new Scale-tier workspace and auto-activate.

### DNS verification stuck

If the sender domain stays unverified after an hour, common causes:
- TXT record value got truncated (some registrar UIs cap value
  length). Solution: split into multiple TXT records or contact
  registrar support.
- Old TXT record from a previous Resend setup overrides the new
  one. Solution: delete the old TXT records first.
- Wildcard SPF policy on the domain conflicts. Solution: edit
  the existing SPF record to include Resend's IP block.

### Anonymous-workspace ownership

`create_workspace_v2` produces workspaces with `owner_id = NULL`.
These workspaces can register agencies natively via the
`ownerWorkspaceId` path. Attach + detach also work — the workspace
acts as its own owner (you own a workspace by holding its bearer
key). When the workspace is later claimed by a human (NextAuth
flow), `owner_id` populates and both ownership paths apply.

### A2P 10DLC + agency-level SMS sending

If the agency wants outbound SMS to ship from a number branded as
the agency (not SeldonFrame's default Twilio number), the agency
operator needs to register A2P 10DLC for their Twilio number
separately. SeldonFrame's chrome substitution doesn't extend to
the Twilio Account/Brand identity surfaced in carrier networks.

For the missed-call-text-back archetype specifically (shipped in
`v1.46.0`), the BYOK Twilio integration on each client workspace
handles the A2P registration per workspace. Agency-level
unified-sender for SMS is on the Q4 2026 roadmap.

### Custom agency domain (agency_domain)

The schema supports `agencyDomain` + `agencyDomainVerifiedAt`
(v1.20+). However, the corresponding API ops (`add_agency_domain`,
`verify_agency_domain`) are **not yet exposed** through
`/api/v1/partner-agencies/route.ts` as of v1.47.0. The branding
resolver reads `agencyDomain` from the row when set, but there's
no public path to set it.

This is a known gap. Q3 2026 adds the API ops + corresponding MCP
tools. Until then, agencies who want a custom domain like
`crm.acmedigital.com` need a SeldonFrame engineer to set
`agency_domain` directly on the row + handle DNS verification
out-of-band.

---

## Detach + de-onboarding

Reversing the setup is straightforward:

1. `detach_workspace_from_partner_agency({ workspace_id })` for
   each client workspace — chrome falls back to SeldonFrame defaults
2. Mark the agency status as `archived` (no MCP tool yet; SQL
   `UPDATE partner_agencies SET status = 'archived' WHERE id = ?`)
3. The data is retained for audit; chrome substitution is gated
   on `status === 'active'` so archived agencies stop influencing
   any workspace's render.

Bulk-detach (de-onboarding an entire agency) is an open Q3 task.

---

## What this guide does NOT cover

- **Agency-level SaaS billing.** The Scale tier covers chrome
  substitution; the agency-bills-clients-monthly flow (where the
  agency charges their clients a subscription via Stripe) is a
  separate piece of work. See the marketplace docs for the related
  Stripe Connect integration.
- **Per-client custom domains.** Workspace-level `custom_domain`
  (e.g., `book.acmedental.com`) is shipped separately on Growth +
  Scale tiers via the `/api/v1/domains` endpoint. Agency-level
  custom domain (which applies to all attached workspaces) is the
  v1.20 feature noted above.
- **Branded mobile app.** Q4 2026 roadmap item. The chrome
  substitution is browser-only today.
- **Soul / agent-archetype white-labeling.** Each client workspace
  has its own Soul + archetype configuration. The agency doesn't
  inherit shared agent behavior; the agency customizes per client
  via Claude Code MCP after `attach_workspace_to_partner_agency`.
