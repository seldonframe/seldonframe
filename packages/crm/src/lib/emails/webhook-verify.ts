import crypto from "node:crypto";

// Resend uses Svix for webhook signing. Verify by recomputing
// HMAC-SHA256 over `{svix-id}.{svix-timestamp}.{raw-body}` using the
// secret (which is base64-encoded with a `whsec_` prefix) and comparing
// against any of the space-separated signatures in `svix-signature`.
// https://docs.svix.com/receiving/verifying-payloads/how-manual
export function verifyResendWebhook(params: {
  body: string;
  secret: string;
  headers: {
    svixId: string | null;
    svixTimestamp: string | null;
    svixSignature: string | null;
  };
  toleranceSeconds?: number;
}) {
  const { svixId, svixTimestamp, svixSignature } = params.headers;
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false as const, reason: "missing_signature_headers" };
  }

  const timestampSec = Number(svixTimestamp);
  if (!Number.isFinite(timestampSec)) {
    return { ok: false as const, reason: "invalid_timestamp" };
  }

  const tolerance = params.toleranceSeconds ?? 5 * 60;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestampSec) > tolerance) {
    return { ok: false as const, reason: "timestamp_out_of_tolerance" };
  }

  const secretBase64 = params.secret.startsWith("whsec_")
    ? params.secret.slice("whsec_".length)
    : params.secret;
  const secretBytes = Buffer.from(secretBase64, "base64");

  const signedPayload = `${svixId}.${svixTimestamp}.${params.body}`;
  const expected = crypto
    .createHmac("sha256", secretBytes)
    .update(signedPayload)
    .digest("base64");

  // `svix-signature` is a space-separated list of `v1,<signature>` pairs.
  const provided = svixSignature.split(" ");
  const match = provided.some((entry) => {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(signature, "base64"), Buffer.from(expected, "base64"));
    } catch {
      return false;
    }
  });

  return match ? { ok: true as const } : { ok: false as const, reason: "signature_mismatch" };
}
