// packages/crm/src/lib/telephony/twilio-client.ts
//
// DI interface + concrete fetch implementation for Twilio phone-number and
// trunking operations required by the provisionVoiceNumber state machine, plus
// (Task 5, voice-deploy metered billing) the Tier-0 subaccount + trunk ops
// consumed by sf-managed.ts.
//
// Mirrors the Basic-auth + form-encoded fetch pattern from:
//   lib/sms/providers/twilio.ts (lines 77–88)
//
// On non-2xx the client throws an Error whose message includes the raw
// Twilio response body so callers can classify and log it. The state
// machine / sf-managed.ts are the seams where unit tests inject a fake — the
// real fetch implementation is NOT unit-tested directly (see
// twilio-client.spec.ts's smoke test for the shape check).

// ─── Interface (DI seam) ──────────────────────────────────────────────────────

export interface TwilioTelephonyClient {
  /**
   * Search available local US voice numbers for the given area code.
   * Returns a list of E.164 candidates (e.g. "+15551234567").
   */
  searchLocalVoiceNumbers(input: {
    areaCode: string;
    limit?: number;
  }): Promise<string[]>;

  /**
   * Purchase a phone number in the builder's Twilio account.
   * Returns the Twilio PN… SID and the purchased E.164 number.
   */
  buyNumber(input: {
    phoneNumber: string;
    friendlyName: string;
  }): Promise<{ sid: string; phoneNumber: string }>;

  /**
   * Attach an already-purchased phone number (by SID) to an Elastic SIP Trunk.
   * The trunk already has a termination URI pointing at the OpenAI Realtime
   * voice gateway, so no VoiceUrl is set on the number itself.
   */
  attachNumberToTrunk(input: {
    trunkSid: string;
    phoneNumberSid: string;
  }): Promise<void>;

  /**
   * Release (delete) a Twilio phone number SID. Called on deployment cancel
   * when numberOrigin === 'provisioned'.
   */
  releaseNumber(input: { phoneNumberSid: string }): Promise<void>;

  /**
   * Point an already-purchased number's INBOUND SMS webhook at SeldonFrame, so
   * the same provisioned number answers BOTH voice (via the SIP trunk) AND SMS
   * (POSTed to smsUrl → /api/webhooks/twilio/sms). Multi-surface number.
   * Idempotent: setting the same SmsUrl twice is a harmless no-op on Twilio.
   *
   * Optional on the interface so existing fakes/clients that predate the
   * multi-surface runtime still satisfy the type; the state machine guards the
   * call with `?.` + only invokes it when an smsUrl is configured.
   */
  configureSmsUrl?(input: {
    phoneNumberSid: string;
    smsUrl: string;
  }): Promise<void>;

  // ── Tier-0 subaccount + trunk ops (voice-deploy metered billing, Task 5) ──
  // Optional so pre-existing fakes/clients (BYO Twilio, area-code search etc.)
  // still satisfy the type. sf-managed.ts is the only caller of these five.

  /**
   * Create a Twilio SUBACCOUNT under the platform's master account. Runs on a
   * client built with MASTER creds (v2010 `POST /Accounts`). Returns the new
   * subaccount's sid + its own authToken (Twilio mints one per subaccount).
   */
  createSubaccount?(input: {
    friendlyName: string;
  }): Promise<{ sid: string; authToken: string }>;

  /**
   * Find an existing subaccount by FriendlyName (v2010 `GET /Accounts` with a
   * FriendlyName filter). Runs on a MASTER-creds client. Returns the first
   * non-closed match, or null if none exists — the authToken IS included in
   * this list response, so no separate fetch is needed.
   */
  findSubaccountByFriendlyName?(input: {
    friendlyName: string;
  }): Promise<{ sid: string; authToken: string } | null>;

  /**
   * Suspend / reactivate / close a subaccount (v2010
   * `POST /Accounts/{sid}.json` with `Status=...`). Runs on a MASTER-creds
   * client — a subaccount cannot change its own status.
   */
  setSubaccountStatus?(input: {
    subaccountSid: string;
    status: "suspended" | "active" | "closed";
  }): Promise<void>;

  /**
   * List Elastic SIP Trunks together with each trunk's Origination URLs
   * (Trunking API `GET /v1/Trunks` + per-trunk `OriginationUrl` sub-resource).
   * MUST run on a client built with the SUBACCOUNT's own creds — the
   * trunking.twilio.com subdomain rejects master creds for a subaccount's
   * trunks. That's the caller's responsibility; this client just uses
   * whatever creds it was constructed with.
   */
  listTrunksWithOrigination?(): Promise<
    Array<{ trunkSid: string; originationUris: string[] }>
  >;

  /**
   * Create a new Elastic SIP Trunk and attach one Origination URL pointing at
   * SF's shared OpenAI SIP endpoint (Trunking API: create the trunk, then
   * POST an OriginationUrl sub-resource with sane weight/priority defaults,
   * Enabled=true). Same subaccount-creds requirement as listTrunksWithOrigination.
   */
  createTrunkWithOrigination?(input: {
    friendlyName: string;
    originationSipUri: string;
  }): Promise<{ trunkSid: string }>;
}

// ─── Concrete implementation ──────────────────────────────────────────────────

/**
 * Build a Basic-auth header from the builder's Twilio credentials.
 * Mirrors the pattern in lib/sms/providers/twilio.ts line ~77.
 */
function buildAuth(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

/**
 * Assert the response is 2xx. On failure throw with the Twilio body included.
 */
async function assertOk(response: Response, context: string): Promise<void> {
  if (response.ok) return;
  let body: string;
  try {
    body = JSON.stringify(await response.json());
  } catch {
    body = await response.text().catch(() => "(empty)");
  }
  throw new Error(
    `Twilio ${context} failed with HTTP ${response.status}: ${body}`,
  );
}

/**
 * Create a concrete TwilioTelephonyClient using the provided credentials.
 * Every method uses fetch + Basic auth + form-encoded bodies, mirroring
 * lib/sms/providers/twilio.ts. Caller decides which creds to construct this
 * with (master vs. subaccount) — see the interface doc comments above.
 */
export function createTwilioTelephonyClient(creds: {
  accountSid: string;
  authToken: string;
}): TwilioTelephonyClient {
  const { accountSid, authToken } = creds;
  const auth = buildAuth(accountSid, authToken);
  const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}`;

  return {
    async searchLocalVoiceNumbers({ areaCode, limit = 5 }) {
      const params = new URLSearchParams({
        AreaCode: areaCode,
        VoiceEnabled: "true",
        PageSize: String(limit),
      });
      const url = `${baseUrl}/AvailablePhoneNumbers/US/Local.json?${params.toString()}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: auth,
          Accept: "application/json",
        },
      });

      await assertOk(response, "AvailablePhoneNumbers/US/Local search");

      const payload = (await response.json()) as {
        available_phone_numbers?: Array<{ phone_number?: string }>;
      };

      return (payload.available_phone_numbers ?? [])
        .map((n) => n.phone_number)
        .filter((p): p is string => typeof p === "string" && p.length > 0);
    },

    async buyNumber({ phoneNumber, friendlyName }) {
      const form = new URLSearchParams();
      form.set("PhoneNumber", phoneNumber);
      form.set("FriendlyName", friendlyName);
      // No VoiceUrl — the SIP trunk handles routing to the OpenAI gateway.

      const response = await fetch(`${baseUrl}/IncomingPhoneNumbers.json`, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: form.toString(),
      });

      await assertOk(response, "IncomingPhoneNumbers buy");

      const payload = (await response.json()) as {
        sid?: string;
        phone_number?: string;
      };

      if (!payload.sid || !payload.phone_number) {
        throw new Error(
          `Twilio buyNumber: response missing sid or phone_number: ${JSON.stringify(payload)}`,
        );
      }

      return { sid: payload.sid, phoneNumber: payload.phone_number };
    },

    async attachNumberToTrunk({ trunkSid, phoneNumberSid }) {
      const form = new URLSearchParams();
      form.set("PhoneNumberSid", phoneNumberSid);

      const url = `https://trunking.twilio.com/v1/Trunks/${encodeURIComponent(trunkSid)}/PhoneNumbers`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: form.toString(),
      });

      await assertOk(response, "Trunks PhoneNumbers attach");
    },

    async releaseNumber({ phoneNumberSid }) {
      const url = `${baseUrl}/IncomingPhoneNumbers/${encodeURIComponent(phoneNumberSid)}.json`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: auth,
          Accept: "application/json",
        },
      });

      // DELETE returns 204 No Content on success — treat any 2xx as ok.
      await assertOk(response, "IncomingPhoneNumbers release");
    },

    async configureSmsUrl({ phoneNumberSid, smsUrl }) {
      // POST to IncomingPhoneNumbers/{sid}.json updates the number in place.
      // Twilio uses POST (not PUT) for resource updates.
      const form = new URLSearchParams();
      form.set("SmsUrl", smsUrl);
      form.set("SmsMethod", "POST");

      const url = `${baseUrl}/IncomingPhoneNumbers/${encodeURIComponent(phoneNumberSid)}.json`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: form.toString(),
      });

      await assertOk(response, "IncomingPhoneNumbers SMS-URL update");
    },

    // ── Tier-0 subaccount + trunk ops ────────────────────────────────────
    // These five hit the root /Accounts collection (NOT the per-accountSid
    // `baseUrl` used above) — Accounts.json addresses the collection itself;
    // /Accounts/{sid}.json addresses one specific account. The caller wires
    // this client with either MASTER creds (subaccount CRUD) or the
    // SUBACCOUNT's own creds (trunking ops) per the interface doc comments.

    async createSubaccount({ friendlyName }) {
      const form = new URLSearchParams();
      form.set("FriendlyName", friendlyName);

      const response = await fetch("https://api.twilio.com/2010-04-01/Accounts.json", {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: form.toString(),
      });

      await assertOk(response, "Accounts create (subaccount)");

      const payload = (await response.json()) as {
        sid?: string;
        auth_token?: string;
      };

      if (!payload.sid || !payload.auth_token) {
        throw new Error(
          `Twilio createSubaccount: response missing sid or auth_token: ${JSON.stringify(payload)}`,
        );
      }

      return { sid: payload.sid, authToken: payload.auth_token };
    },

    async findSubaccountByFriendlyName({ friendlyName }) {
      const params = new URLSearchParams({ FriendlyName: friendlyName });
      const url = `https://api.twilio.com/2010-04-01/Accounts.json?${params.toString()}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: auth,
          Accept: "application/json",
        },
      });

      await assertOk(response, "Accounts list (find subaccount by FriendlyName)");

      const payload = (await response.json()) as {
        accounts?: Array<{ sid?: string; auth_token?: string; status?: string }>;
      };

      const match = (payload.accounts ?? []).find(
        (acct) => acct.status !== "closed" && acct.sid && acct.auth_token,
      );

      if (!match?.sid || !match.auth_token) {
        return null;
      }

      return { sid: match.sid, authToken: match.auth_token };
    },

    async setSubaccountStatus({ subaccountSid, status }) {
      const form = new URLSearchParams();
      form.set("Status", status);

      const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(subaccountSid)}.json`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: form.toString(),
      });

      await assertOk(response, "Accounts status update (suspend/reactivate/close)");
    },

    async listTrunksWithOrigination() {
      const response = await fetch("https://trunking.twilio.com/v1/Trunks", {
        method: "GET",
        headers: {
          Authorization: auth,
          Accept: "application/json",
        },
      });

      await assertOk(response, "Trunks list");

      const payload = (await response.json()) as {
        trunks?: Array<{ sid?: string }>;
      };

      const trunks = (payload.trunks ?? []).filter(
        (t): t is { sid: string } => typeof t.sid === "string" && t.sid.length > 0,
      );

      // Fetch each trunk's OriginationUrls sub-resource. Sequential (not
      // Promise.all) keeps this predictable under Twilio's per-account rate
      // limits — subaccounts have very few trunks (typically 0-1), so the
      // latency cost is negligible.
      const results: Array<{ trunkSid: string; originationUris: string[] }> = [];
      for (const trunk of trunks) {
        const originationResponse = await fetch(
          `https://trunking.twilio.com/v1/Trunks/${encodeURIComponent(trunk.sid)}/OriginationUrls`,
          {
            method: "GET",
            headers: {
              Authorization: auth,
              Accept: "application/json",
            },
          },
        );

        await assertOk(originationResponse, `Trunks OriginationUrls list (${trunk.sid})`);

        const originationPayload = (await originationResponse.json()) as {
          origination_urls?: Array<{ sip_url?: string }>;
        };

        const originationUris = (originationPayload.origination_urls ?? [])
          .map((o) => o.sip_url)
          .filter((u): u is string => typeof u === "string" && u.length > 0);

        results.push({ trunkSid: trunk.sid, originationUris });
      }

      return results;
    },

    async createTrunkWithOrigination({ friendlyName, originationSipUri }) {
      const trunkForm = new URLSearchParams();
      trunkForm.set("FriendlyName", friendlyName);

      const trunkResponse = await fetch("https://trunking.twilio.com/v1/Trunks", {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: trunkForm.toString(),
      });

      await assertOk(trunkResponse, "Trunks create");

      const trunkPayload = (await trunkResponse.json()) as { sid?: string };

      if (!trunkPayload.sid) {
        throw new Error(
          `Twilio createTrunkWithOrigination: response missing sid: ${JSON.stringify(trunkPayload)}`,
        );
      }

      const trunkSid = trunkPayload.sid;

      // Attach the Origination URL sub-resource pointing at SF's shared
      // OpenAI SIP endpoint. Sane defaults: weight/priority both 10 (single
      // target, values are inert with one URL), Enabled=true so it's live
      // immediately.
      const originationForm = new URLSearchParams();
      originationForm.set("SipUrl", originationSipUri);
      originationForm.set("Weight", "10");
      originationForm.set("Priority", "10");
      originationForm.set("Enabled", "true");

      const originationResponse = await fetch(
        `https://trunking.twilio.com/v1/Trunks/${encodeURIComponent(trunkSid)}/OriginationUrls`,
        {
          method: "POST",
          headers: {
            Authorization: auth,
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: originationForm.toString(),
        },
      );

      await assertOk(originationResponse, "Trunks OriginationUrls create");

      return { trunkSid };
    },
  };
}
