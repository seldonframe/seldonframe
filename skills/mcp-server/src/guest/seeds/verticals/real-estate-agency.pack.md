# VerticalPack: Real Estate Agency

**Pack id:** `real-estate-agency`
**Schema version:** 1.0
**Industry:** `real_estate`
**Tagline:** List, tour, negotiate, close — one CRM for the whole pipeline.

## Purpose
A complete vertical CRM for independent agents and boutique agencies. Sits on top of SeldonFrame's built-in `contact` and `deal` primitives and adds three domain objects: `listing`, `showing`, and `offer`.

## Objects

### Listing
A property currently or recently on the market.
Fields: address, mls_number, status (coming_soon | active | pending | sold | withdrawn), list_price, sale_price, bedrooms, bathrooms, square_feet, listed_at, description.

### Showing
A scheduled or completed property tour.
Fields: listing_id → Listing, contact_id → contact, scheduled_at, outcome (scheduled | completed | no_show | canceled), notes.

### Offer
A written offer on a listing.
Fields: listing_id → Listing, contact_id → contact, amount, status (submitted | countered | accepted | rejected | withdrawn), submitted_at, closing_date.

## Relations
- contact → showing (one-to-many): a buyer may attend many showings
- listing → showing (one-to-many): a listing may have many showings
- listing → offer (one-to-many): a listing may receive many offers
- contact → offer (one-to-many): a buyer may submit many offers

## Views
- **Active listings** (listing, table): filter status ∈ { coming_soon, active }, sort listed_at desc
- **This week's showings** (showing, calendar): filter outcome = scheduled, sort scheduled_at asc
- **Open offers** (offer, kanban): filter status ∈ { submitted, countered }, sort submitted_at desc

## Permissions
- `agent`: read/write on listing, showing, offer (delete on showing only)
- `end_client`: read-only on listing, showing, offer

## Workflows
- **Offer accepted notification** — when `offer.status == accepted`: email buyer, email agent, create closing-prep task +3d.
- **Showing reminder** — 24h before `showing.scheduled_at`: SMS + email the attendee.
- **Listing goes stale** — when `listing.listed_at + 30d` and still active: create a price-review task for the agent.

## Included blocks
`pages`, `forms`, `emails`, `bookings`

## How to install
- `POST /api/v1/verticals/install` with `{ "workspaceId": "<id>", "packId": "real-estate-agency" }`, or
- `GET /api/v1/verticals` to see all available packs, then install by id.

## Generating a new pack
- `POST /api/v1/verticals/generate` with `{ "workspaceId": "<id>", "description": "<business description>", "vertical": "<optional kebab-case id>" }`.
- The generator returns a validated VerticalPack JSON. Install it in a separate call with `{ "workspaceId": "<id>", "pack": <json> }`.
