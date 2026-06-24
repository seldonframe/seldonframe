# Pluggable Booking Backend — external-calendar booking for deployed agents

**Status:** Design approved 2026-06-24 (brainstorm). Next step: implementation plan (`writing-plans`).

**Goal:** Let a SeldonFrame agent deployed to a client (voice OR chat/SMS/email) read real availability from, and write appointments into, the **client's own Google/Outlook calendar** — not only SeldonFrame's native calendar. This ships the greyed-out **"Connect via API / MCP"** option at the Studio deploy step's "How should this agent book?" section, backed first by the already-built **Composio** managed-OAuth integration.

**Why now:** the agency operator deploying a voice receptionist expects the agent to book into the client's real calendar (the operator selected "Google Calendar" and hit the COMING SOON wall). The native SeldonFrame calendar works today; this adds the client's *own* calendar as a per-deployment backend.

---

## Decisions locked in the brainstorm

1. **Surface = voice + chat, via a pluggable backend behind the NATIVE booking tools** (not a separate MCP tool exposed to the model). The agent's tool surface (`look_up_availability`, `book_appointment`) is unchanged; only the tool's *server-side implementation* becomes per-deployment. This is what makes voice work: the OpenAI Realtime runtime is native-tools-only, but the tool's *execution* happens server-side, where it can call Composio. ("Voice = native-only" was always about the model-visible tool LIST, never the tool IMPLEMENTATION.)
2. **First adapter = Composio Google/Outlook.** Reuses the merged Composio integration (per-workspace managed OAuth, `@composio/core`, the `ensureSession` + key resolver). Covers ~95% of SMBs (Google + Outlook). Cal.com Platform and a generic MCP-calendar adapter are LATER slices on the same seam.
3. **Connection = a Composio connect link, completable by the AGENCY or the CLIENT.** The deployed client never logs into SeldonFrame, so the deploy step generates a connect link the agency can finish itself or forward to the client.

---

## Architecture — one seam, two adapters

Today the native booking tools resolve availability/booking directly against the workspace's SeldonFrame calendar. We introduce a single indirection:

```
look_up_availability / book_appointment   (UNCHANGED tool defs; voice + chat)
        │  (server-side execution)
        ▼
resolveCalendarBackend(deployment | workspace)  →  CalendarBackend adapter
        ├── "native"   → SeldonFrame availability + booking chain (today's behavior)
        └── "composio" → client's Google/Outlook via Composio (server-side)
```

**`CalendarBackend` interface** (the contract both adapters implement; pure-ish, DI-friendly):

```ts
type CalendarBackend = {
  findAvailability(args: { fromIso: string; toIso: string; durationMinutes: number; timezone: string }):
    Promise<{ slots: { startIso: string; endIso: string }[] }>;
  createEvent(args: { startIso: string; endIso: string; timezone: string; title: string;
    attendee: { name?: string; email?: string; phone?: string }; notes?: string }):
    Promise<{ ok: true; eventRef: string } | { ok: false; error: string }>;
};
```

- **`native` adapter** wraps the existing SeldonFrame availability + `book_appointment` chain. Refactor-only; identical behavior for every workspace that doesn't opt into an external calendar.
- **`composio` adapter** calls the client org's Composio session:
  - `findAvailability` → `GOOGLECALENDAR_FIND_FREE_SLOTS` (Outlook: the equivalent free/busy tool).
  - `createEvent` → `GOOGLECALENDAR_CREATE_EVENT` (Outlook equivalent).
  - Built on the existing `ensureSession(orgId, toolkits)` + tool-execute path in `src/lib/integrations/composio/`.

`resolveCalendarBackend` reads the deployment's `bookingMode` + `calendarRef`; defaults to `native` when no external calendar is bound.

---

## Data model (additive — no new table)

- **`bookingMode`:** add `"composio"` to the `BookingMode` union in `src/lib/deployments/booking-providers.ts`. Keep `api_mcp` / `cal_com` as future entries.
- **`calendarRef`** (existing `deployments` jsonb column) holds the binding:
  ```json
  { "provider": "composio", "toolkit": "googlecalendar" | "outlook",
    "connectionId": "<composio connected-account id>", "calendarId": "primary",
    "timezone": "America/Chicago", "connectedAt": "<iso>" }
  ```
  Null `connectionId` = "pending connection" (mode chosen, calendar not yet authorized).
- No migration if `calendarRef` already exists; otherwise an additive jsonb column.

---

## Connect flow (Studio deploy step)

In `BookingModeChooser` (`deploy-client.tsx`), the `api_mcp` card is **relabeled** "Book into the client's Google/Outlook (Composio)" and flipped to `available` for the Composio provider.

1. Operator picks it + chooses Google or Outlook.
2. A server action generates a **Composio connect link** for the **client org's** calendar toolkit (reuses the `createConnectLink(orgId, toolkit, callbackUrl)` path from `src/app/(dashboard)/integrations/actions.ts`, scoped to the client org rather than the logged-in org).
3. The deploy UI shows the link with two affordances: **"Connect now"** (agency completes the OAuth) and **"Copy link to send to the client."** Either path returns to a callback that persists the resulting `connectionId` onto the deployment's `calendarRef`.
4. The deployment can be saved/activated while the connection is still **pending** — the agent simply falls back (below) until the calendar is connected.

---

## Runtime + error handling (reliability is non-negotiable on a live call)

`resolveCalendarBackend` + the adapter calls are wrapped so the agent **never breaks**:

- **Not connected yet** (`connectionId` null) → **fall back to the `native` SeldonFrame backend**. The booking still happens (into the workspace calendar); the agency reconciles. (Chosen over capture-and-handoff because the workspace already has a working calendar — a real booking beats a deferred one.)
- **Composio call errors/times out mid-call** → same native fallback; log the failure for the operator.
- **Voice latency:** a Composio→Google round-trip adds ~1–2 s per availability/booking call. Acceptable (the agent naturally says "let me check that"). Cache the day's free slots within a single call/turn to avoid repeat round-trips.

All fallbacks are logged as structured events so the operator can see "external calendar unavailable, booked natively."

---

## First shippable slice (v1)

1. **`composio` booking mode** added to the registry + the deploy-step card flipped to available (Google/Outlook).
2. **Connect-link generation** for the client org + persist `connectionId` on `calendarRef` (agency-or-client).
3. **`resolveCalendarBackend` seam + `native` adapter** — refactor the native booking tools to route through it (zero behavior change; covered by existing booking tests).
4. **`composio` adapter** (find-free-slots + create-event) with **native fallback**.
5. **Route both native tools through the seam** so voice + chat both honor the deployment's backend.

Each piece is bounded and testable; the seam + adapters are DI'd over Composio/SeldonFrame deps.

## Later slices (same seam — out of scope for v1)

- **Cal.com Platform** adapter (`cal_com` mode): managed Google/Outlook/Apple sync, buffers/round-robin, per-booking pricing.
- **Generic MCP calendar** adapter (`api_mcp` true form): the backend calls a per-deployment MCP endpoint the client supplies — fits the connector-directory vision.
- Per-deployment timezone / buffer / working-hours overrides.

---

## Testing

- **TDD (pure / DI'd, no network):**
  - `resolveCalendarBackend`: mode + `calendarRef` → correct adapter; defaults to native; pending → native.
  - `composio` adapter arg-mapping: slot query → `FIND_FREE_SLOTS` params; confirmed slot → `CREATE_EVENT` params; error/timeout → typed failure that triggers fallback.
- **Integration (manual, on a Vercel preview):** deploy → connect a real Google account via the link → place a booking through the agent → confirm the event lands in Google and the agency sees the structured "booked externally" event.

---

## Key touchpoints (files)

| Area | File |
|---|---|
| Booking-mode registry | `src/lib/deployments/booking-providers.ts` |
| Deployment schema / patch | `src/db/schema/deployments.ts` (`bookingMode`, `calendarRef`), `src/lib/deployments/store.ts` |
| Deploy-step UI | `src/app/(dashboard)/studio/agents/[id]/deploy/deploy-client.tsx` (`BookingModeChooser`) |
| Native booking tools | `src/lib/agents/tools.ts` (`look_up_availability` / `book_appointment` invokers) + the native availability/booking chain they call |
| Voice tool bridge | `src/lib/agents/voice/openai-realtime.ts` (native tools execute server-side; no change to the tool list) |
| Composio session / execute | `src/lib/integrations/composio/{connector.ts,client.ts,keys.ts}` |
| Connect-link action | `src/app/(dashboard)/integrations/actions.ts` (`connectComposioToolkitAction` → `createConnectLink`) |

## Assumptions to validate during planning

1. **Per-client scoping in Composio:** confirm whether each client org is its own Composio `user_id` (one Google connection per client, cleanest) vs. multiple connected accounts under the agency `user_id`. The deployment stores `connectionId` either way.
2. **Exact tool slugs:** `GOOGLECALENDAR_FIND_FREE_SLOTS` / `GOOGLECALENDAR_CREATE_EVENT` and the Outlook equivalents (validate against the live Composio catalog).
3. **Single shared execution path:** confirm `look_up_availability` / `book_appointment` resolve their calendar through one server-side path shared by voice + chat (so the seam is inserted once).
4. **Gating:** Composio key present (`COMPOSIO_API_KEY` is set in Vercel) — the adapter fails closed to native when absent.

## Out of scope (v1)

- Cal.com Platform and generic-MCP adapters (later slices).
- Apple Calendar / CalDAV (arrives with cal.diy or Cal.com).
- Rescheduling/cancellation into the external calendar (v1 = availability + create; reschedule/cancel can follow on the same adapter interface).
- Two-way sync of externally-created events back into the SeldonFrame CRM (the booking writes to the external calendar; CRM-side mirroring is a follow-up).
