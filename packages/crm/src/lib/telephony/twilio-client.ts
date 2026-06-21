// packages/crm/src/lib/telephony/twilio-client.ts
//
// DI interface + concrete fetch implementation for Twilio phone-number and
// trunking operations required by the provisionVoiceNumber state machine.
//
// Mirrors the Basic-auth + form-encoded fetch pattern from:
//   lib/sms/providers/twilio.ts (lines 77–88)
//
// On non-2xx the client throws an Error whose message includes the raw
// Twilio response body so the state machine can classify and log it.
// The state machine is the seam where unit tests inject a fake — the real
// fetch implementation is NOT unit-tested directly.

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
 * All four methods use fetch + Basic auth + form-encoded bodies,
 * mirroring lib/sms/providers/twilio.ts.
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
  };
}
