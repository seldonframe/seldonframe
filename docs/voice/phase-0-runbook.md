# Voice Agent — Phase 0 Validation Runbook

**Goal:** prove the transport end-to-end — a real phone call connects to
`gpt-realtime-2` over OpenAI's Realtime SIP beta, hears a hard-coded greeting,
has one short spoken exchange, and hangs up. No tools, no database, no
per-workspace logic. This is a derisking experiment, not a product feature.

**Pipe:**

```
You dial the Twilio number
  → Twilio Elastic SIP Trunk routes the call to
    sip:<your-openai-project-id>@sip.api.openai.com;transport=tls
  → OpenAI fires `realtime.call.incoming` (signed) to:
       https://app.seldonframe.com/api/v1/voice/openai/webhook
  → our webhook verifies the signature, POSTs /v1/realtime/calls/{id}/accept
    (model gpt-realtime-2 + voice "alloy" + the receptionist persona),
    responds 200, then holds the realtime control WebSocket in the background
    (Next `after()` on Vercel Fluid Compute) and lets gpt-realtime-2 run the call
  → you hear the greeting and can talk; say "goodbye" to end.
```

You place the validating call — Claude cannot dial a phone or enter your
OpenAI/Twilio credentials. Everything below is the exact sequence.

---

## Prerequisites (you already have these)

- OpenAI **Realtime SIP beta access** on your OpenAI project.
- A **Twilio Elastic SIP Trunk** provisioned, with a phone number routed to it.
- The SeldonFrame app deployed to `main` → `https://app.seldonframe.com`.

---

## Step 1 — Set the environment variables in Vercel

In the Vercel dashboard → SeldonFrame project → **Settings → Environment
Variables**, set these for **Production** (names only — fill the values from your
OpenAI + Twilio dashboards). Then **redeploy** so they take effect.

| Variable | Where the value comes from | Required? |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI dashboard → API keys. The key whose project has Realtime SIP beta access. (May already be set platform-wide.) | **Yes** |
| `OPENAI_WEBHOOK_SECRET` | OpenAI dashboard → **Settings → Webhooks** → the signing secret shown after you create the endpoint in Step 2. Format `whsec_...`. | **Yes** — without it the webhook returns `400 missing_secret` and rejects every call. |
| `OPENAI_REALTIME_PROJECT_SIP` | Your OpenAI project's SIP address: `sip:<your-openai-project-id>@sip.api.openai.com;transport=tls`. Not read by code — recorded so it lives with the other voice vars and you can copy it in Step 3. | Optional (documentation) |

> No new Twilio secret is needed for Phase 0: the voice leg goes
> Twilio Trunk → OpenAI SIP → our webhook, so Twilio never calls our app during
> the call. Your existing Twilio credentials stay in the Twilio dashboard.

There is a chicken-and-egg between Step 1 and Step 2: you create the webhook in
OpenAI (Step 2) to GET the signing secret, then come back and set
`OPENAI_WEBHOOK_SECRET` here and redeploy. That's expected.

---

## Step 2 — Register the webhook URL in OpenAI

1. OpenAI dashboard → **Settings → Webhooks** → **Create webhook** (or
   **Add endpoint**).
2. **URL:** paste exactly:

   ```
   https://app.seldonframe.com/api/v1/voice/openai/webhook
   ```

3. **Events:** subscribe to **`realtime.call.incoming`**.
4. Save. OpenAI shows a **signing secret** (`whsec_...`). Copy it.
5. Go back to **Step 1** and set `OPENAI_WEBHOOK_SECRET` to that value in Vercel,
   then **redeploy** the project.

---

## Step 3 — Point your Twilio Elastic SIP Trunk at OpenAI

In the Twilio Console → **Elastic SIP Trunking → Trunks → [your trunk] →
Origination**:

1. Add (or edit) an **Origination URI** pointing at your OpenAI project SIP
   address:

   ```
   sip:<your-openai-project-id>@sip.api.openai.com;transport=tls
   ```

   (This is the `OPENAI_REALTIME_PROJECT_SIP` value from Step 1. Replace
   `<your-openai-project-id>` with your real OpenAI project id.)

2. Ensure the URI uses **TLS** (`;transport=tls`) — OpenAI requires TLS.
3. Under the trunk's **Numbers**, confirm the phone number you'll dial is
   attached to this trunk so inbound calls route through Origination to OpenAI.

> Twilio terminology note: for an inbound PSTN call to be sent out to OpenAI's
> SIP, the number must be on a trunk whose **Origination** points at the OpenAI
> SIP URI. If you instead use a TwiML `<Dial><Sip>` flow, dial that same SIP URI.

---

## Step 4 — Place the call and listen

1. From any phone, **dial the Twilio number** attached to the trunk.
2. Within a second or two you should hear the agent **speak first** — a warm
   greeting along the lines of:

   > "Hi! Thanks for calling. How can I help you today?"

   (Exact wording varies — `gpt-realtime-2` generates it live from the persona:
   _"You are a friendly receptionist for a test business. Greet the caller
   warmly, ask how you can help, and keep your replies short. If the caller says
   goodbye, thank them and end the call."_)

3. **Say something short**, e.g. _"What are your hours?"_ or _"I'd like to book
   an appointment."_ The agent replies briefly. (It has **no tools** in Phase 0,
   so it will answer conversationally but can't actually look anything up or book
   — that's expected. We're testing audio in/out, not capability.)

4. **Say "goodbye."** The agent should thank you and the call should end.

**A successful exchange = you heard the greeting, the agent responded to your
question, and saying goodbye ended the call cleanly.** That proves the whole
pipe (Twilio → OpenAI SIP → our webhook → accept → realtime WS → audio both
ways → graceful hangup).

---

## Step 5 — If it fails: read the Vercel logs

Every step of the flow emits a single-line structured JSON log
(`console.info`/`warn`/`error` of a JSON object). Export the function logs and
read them to see exactly where it broke.

**How to get the logs:** Vercel dashboard → SeldonFrame project →
**Logs** (or **Observability → Logs**) → filter to the function path
`/api/v1/voice/openai/webhook` → set the time window to when you called → you can
also **Export** to a file. Each line is a JSON object with an `event` field.

**The happy-path sequence you should see, in order:**

| `event` | Meaning | If this is the LAST line you see, the failure is… |
| --- | --- | --- |
| `voice_call_incoming` | Webhook received a request | …nothing after = OpenAI hit the URL but the body/headers were off, or the function crashed immediately. Check the URL in Step 2 is exact. |
| `voice_call_signature_verified` | Signature passed | (good — auth works) |
| `voice_call_accepted` | `POST /accept` returned 2xx | (good — OpenAI accepted the call) |
| `voice_call_ws_opened` | Realtime control WebSocket connected | …WS never opened = network/auth to `wss://api.openai.com` failed. |
| `voice_call_session_updated` | Persona pushed onto the session | |
| `voice_call_first_response_requested` | Asked the agent to greet | …no audio despite this = SIP audio bridge issue (Twilio trunk / codec). |
| `voice_call_response_done` | The agent finished a spoken turn | (repeats per turn) |
| `voice_call_ws_closed` (`reason: ...`) | Call ended | `reason` tells you why: `goodbye`, `max_turns`, `timeout`, `ws_closed`, `ws_error`. |

**Failure log lines and what they mean:**

| `event` (severity) | What went wrong | Fix |
| --- | --- | --- |
| `voice_call_signature_rejected` (`reason: missing_secret`) | `OPENAI_WEBHOOK_SECRET` not set in Vercel | Set it (Step 1) + redeploy. |
| `voice_call_signature_rejected` (`reason: signature_mismatch`) | The secret in Vercel doesn't match the OpenAI endpoint's secret | Re-copy the `whsec_...` from OpenAI → Vercel + redeploy. |
| `voice_call_signature_rejected` (`reason: timestamp_out_of_tolerance`) | Server clock skew > 5 min, or a replayed request | Unlikely on Vercel; retry the call. |
| `voice_call_missing_api_key` (error) | `OPENAI_API_KEY` not set | Set it (Step 1) + redeploy. |
| `voice_call_accept_failed` (error, `accept_status`, `accept_body`) | OpenAI rejected `POST /accept` | Read `accept_status`/`accept_body`: `401` = bad/no API key or no SIP beta access; `404` = `call_id` already gone; `4xx` body usually names the bad field (e.g. model id). |
| `voice_call_ws_error` / `voice_call_ws_closed` (`reason: ws_error`) | Realtime WS failed to connect or dropped | Check `OPENAI_API_KEY` is valid for realtime; check OpenAI status. |
| `voice_call_ignored_event` (`event_type: ...`) | A non-`realtime.call.incoming` event arrived | Normal — we ACK other events 200. Only `realtime.call.incoming` drives a call. |

**No logs at all when you call?** Then OpenAI never reached the webhook — the
problem is upstream of our app: either Twilio Origination isn't pointing at the
OpenAI SIP URI (Step 3), the OpenAI webhook URL is wrong/not subscribed to
`realtime.call.incoming` (Step 2), or the number isn't on the trunk.

---

## Notes & limits (Phase 0)

- **Call length:** sub-5-minute calls only. The function holds the WS up to its
  `maxDuration` (set to `800` in code; Vercel clamps to **300s on Hobby**, allows
  **800s on Pro/Enterprise**). The code also self-closes the WS at **4 minutes**
  (`MAX_CALL_MS`) so a call ends with a clean `voice_call_ws_closed` log rather
  than a platform `504`. If you're on **Hobby**, keep test calls under ~4.5 min.
  For comfortable headroom, run this on **Pro**.
- **Turn cap:** the agent will end the call after ~12 of its own turns
  (`MAX_ASSISTANT_TURNS`) as a safety stop, even if you don't say goodbye.
- **No capability:** the agent can't book, look up, or remember anything — there
  are no tools and no database in Phase 0. It only talks.
- **Single persona:** every call hears the same hard-coded receptionist greeting.
  Per-workspace agents come in a later phase.
- **Cost note:** while the WS is held and waiting on audio, that's I/O wait,
  which Vercel does **not** bill as active CPU — you pay provisioned-memory time
  for the call's duration plus OpenAI's realtime audio usage.
