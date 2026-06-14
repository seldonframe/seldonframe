import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { sendNewLeadAlert } from "@/lib/notifications/ops-notifications";

// A fetch stub that records the single Resend call.
function makeFetcher(ok = true) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return {
      ok,
      status: ok ? 200 : 500,
      text: async () => (ok ? "" : "boom"),
    } as Response;
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe("sendNewLeadAlert", () => {
  test("posts to Resend with a lead subject + the configured recipient", async () => {
    const { fetcher, calls } = makeFetcher();
    await sendNewLeadAlert(
      {
        businessName: "Maloney Plumbing",
        name: "Dana R.",
        phone: "+12095550144",
        need: "Burst pipe",
        orgSlug: "maloney-plumbing",
      },
      { fetcher, apiKey: "re_test", env: { OPS_NOTIFICATION_EMAIL: "ops@example.com" } },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.deepEqual(calls[0].body.to, ["ops@example.com"]);
    assert.match(String(calls[0].body.subject), /New lead/i);
    assert.match(String(calls[0].body.subject), /Dana R\./);
    // The need + phone ride in the body text.
    assert.match(String(calls[0].body.text), /Burst pipe/);
    assert.match(String(calls[0].body.text), /\+12095550144/);
  });

  test("no-ops (no throw, no fetch) when apiKey is empty", async () => {
    const { fetcher, calls } = makeFetcher();
    await sendNewLeadAlert(
      { businessName: "X", name: "Y", phone: "+1", need: "Z", orgSlug: "x" },
      { fetcher, apiKey: "", env: {} },
    );
    assert.equal(calls.length, 0);
  });

  test("never throws when the fetch rejects", async () => {
    const rejecting = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await assert.doesNotReject(() =>
      sendNewLeadAlert(
        { businessName: "X", name: "Y", phone: "+1", need: "Z", orgSlug: "x" },
        { fetcher: rejecting, apiKey: "re_test", env: {} },
      ),
    );
  });
});
