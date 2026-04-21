import crypto from "node:crypto";

// Twilio signs webhooks with HMAC-SHA1 over `{url}{sorted-params-concat}`
// using the account's auth token as the key, base64-encoded in the
// `X-Twilio-Signature` header.
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
export function verifyTwilioSignature(params: {
  url: string;
  body: URLSearchParams;
  signature: string | null;
  authToken: string;
}) {
  if (!params.signature || !params.authToken) {
    return false;
  }

  const sortedKeys = [...params.body.keys()].sort();
  let signed = params.url;
  for (const key of sortedKeys) {
    signed += key + (params.body.get(key) ?? "");
  }

  const expected = crypto.createHmac("sha1", params.authToken).update(signed).digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(params.signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
