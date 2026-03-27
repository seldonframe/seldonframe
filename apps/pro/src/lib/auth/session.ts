import crypto from "node:crypto";

const PRO_SESSION_COOKIE = "seldon_pro_session";

type ProSessionPayload = {
  email: string;
  role: "superadmin";
  exp: number;
};

function getSecret() {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-pro-secret";
}

export function getProSessionCookieName() {
  return PRO_SESSION_COOKIE;
}

export function signProSession(payload: ProSessionPayload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const signature = crypto.createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyProSession(token: string | null | undefined): ProSessionPayload | null {
  if (!token) {
    return null;
  }

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = crypto.createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  if (signature !== expected) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as ProSessionPayload;

  if (!payload?.email || payload.role !== "superadmin" || typeof payload.exp !== "number") {
    return null;
  }

  if (Date.now() > payload.exp) {
    return null;
  }

  return payload;
}
