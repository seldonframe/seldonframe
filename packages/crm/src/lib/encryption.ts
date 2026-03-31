import crypto from "node:crypto";

const ENCRYPTION_PREFIX = "v1";

function getEncryptionKey() {
  const raw = process.env.ENCRYPTION_KEY;

  if (!raw) {
    throw new Error("Missing ENCRYPTION_KEY");
  }

  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Fall back to hashing below.
  }

  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptValue(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptValue(payload: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(".");

  if (version !== ENCRYPTION_PREFIX || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted payload");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]);
  return decrypted.toString("utf8");
}

export function redactApiKey(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  if (value.length <= 11) {
    return "••••••••";
  }

  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}
