type JsonObject = Record<string, unknown>;

const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN?.trim() || process.env.VERCEL_TOKEN?.trim();
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID?.trim();
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID?.trim();

export class VercelDomainError extends Error {
  status: number;
  data: JsonObject;

  constructor(message: string, status = 500, data: JsonObject = {}) {
    super(message);
    this.name = "VercelDomainError";
    this.status = status;
    this.data = data;
  }
}

function getVercelDomainsUrl() {
  const baseUrl = "https://api.vercel.com/v2/domains";
  if (!VERCEL_TEAM_ID) {
    return baseUrl;
  }

  return `${baseUrl}?teamId=${encodeURIComponent(VERCEL_TEAM_ID)}`;
}

async function parseJsonSafe(response: Response): Promise<JsonObject> {
  try {
    return (await response.json()) as JsonObject;
  } catch {
    return {};
  }
}

function getErrorMessage(data: JsonObject) {
  const directError = data.error;
  if (typeof directError === "string" && directError.trim()) {
    return directError;
  }

  if (directError && typeof directError === "object") {
    const nestedMessage = (directError as Record<string, unknown>).message;
    if (typeof nestedMessage === "string" && nestedMessage.trim()) {
      return nestedMessage;
    }
  }

  const dataMessage = data.message;
  if (typeof dataMessage === "string" && dataMessage.trim()) {
    return dataMessage;
  }

  return "Vercel domain error";
}

export async function connectCustomDomain(workspaceId: string, domain: string) {
  const normalizedDomain = domain.trim().toLowerCase();

  if (!normalizedDomain) {
    throw new VercelDomainError("Domain is required.", 400);
  }

  if (!workspaceId.trim()) {
    throw new VercelDomainError("Workspace ID is required.", 400);
  }

  if (!VERCEL_API_TOKEN) {
    throw new VercelDomainError("Missing VERCEL_API_TOKEN.", 500);
  }

  if (!VERCEL_PROJECT_ID) {
    throw new VercelDomainError("Missing VERCEL_PROJECT_ID.", 500);
  }

  const response = await fetch(getVercelDomainsUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VERCEL_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: normalizedDomain,
      projectId: VERCEL_PROJECT_ID,
    }),
    cache: "no-store",
  });

  const data = await parseJsonSafe(response);

  if (!response.ok) {
    throw new VercelDomainError(getErrorMessage(data), response.status, data);
  }

  const status = typeof data.status === "string" ? data.status : "pending_verification";
  const verification = Array.isArray(data.verification) ? data.verification : [];

  return {
    domain: normalizedDomain,
    status,
    verification,
    message: `DNS: Point ${normalizedDomain} to Vercel (CNAME or A record). SSL auto-provisioned.`,
  };
}
