# Multi-Tenant Privacy Strategies v1

SeldonFrame is multi-tenant by design (one Neon DB + one VPS), so privacy is not optional — it is the foundation that makes the product trustworthy and legally safe.
Below are the exact strategies we use. All of them are implemented with minimal code and zero extra cost.

## Strict Workspace Isolation (the #1 rule)

Every row in the events table has a workspace_id (hashed UUID).
Every single query, insert, or update is always filtered with WHERE workspace_id = ?.
Drizzle ORM enforces this at the query builder level — no raw SQL ever bypasses it.
The Brain wiki uses one isolated folder per workspace (/brain/wiki/workspaces/{hashed_id}/). No cross-folder access is possible.

## Anonymization at Write Time (zero PII ever stored)

Applied in the writeEvent() helper before anything touches the DB or filesystem:

Email → SHA-256 hash
Any name or free-text personal identifier → replaced with “CLIENT-[hash]” or stripped
Free-text fields → summarized to ≤140 characters by a tiny local prompt (or dropped if unnecessary)

anonymized: true flag is always set on every event.
Result: even if the DB is somehow breached, no real person can be identified.

## Read-Only + Scoped Access Everywhere

No user (including you) can ever run a query that touches another workspace.
The /api/brain/timeline endpoint and all Layer 1/Layer 2 intelligence calls are strictly workspace-scoped.
The VPS filesystem is owned by a non-root Docker user. The /brain/ directory is only readable by the Brain compiler process.

## Encryption (at rest + in transit)

Neon Postgres: encryption at rest (enabled by default) + TLS for all connections.
VPS filesystem: full-disk encryption (Hetzner default) + /brain/ directory can be further encrypted with LUKS if you want (optional, low priority).
All internal communication (skill → soul compiler → Brain) stays on localhost or private Docker network.

## Data Export & Right-to-Be-Forgotten (user control)

One-click “Export my data” button in the workspace dashboard:

Downloads a zip of their harness-rules.json, all forked blocks, and their private wiki folder.
Also exports a clean JSON of all their anonymized events.

“Delete my workspace” permanently removes the folder and all related events. (We keep a hashed tombstone record for 30 days for audit purposes, then purge.)

## Logging & Auditing (you can sleep at night)

All DB queries and filesystem writes are logged with workspace_id only (no PII).
Daily automated check: scan the last 24h of events and alert you (via Resend) if any event ever contains an unhashed email or name.
This runs on the same daily Haiku job that compiles the wiki.

## Future-Proofing (nice-to-have, not sprint blockers)

When you hit ~5,000 workspaces you can shard the wiki across 2–3 VPS boxes (still one logical Brain).
Row-level security in Postgres can be enabled later as an extra layer (currently unnecessary because of query scoping).
Optional per-workspace encryption key (user-supplied) for the wiki folder — overkill for now, but easy to add in month 3–6.

## Summary — Why this actually works for a solo founder

You keep full operational control (one VPS, one DB).
Users feel 100% ownership (“my memory, my rules, my data”).
Compliance is trivial (GDPR/CCPA friendly because no PII is stored).
Cost and complexity stay extremely low.
This privacy model is the reason we can confidently say “Your business. Your harness. Your memory.” — because technically and legally, it really is theirs, even though the infrastructure is yours.
