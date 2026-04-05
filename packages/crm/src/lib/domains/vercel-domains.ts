const VERCEL_TOKEN = process.env.VERCEL_TOKEN?.trim();
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID?.trim();
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID?.trim();

type JsonObject = Record<string, unknown>;

function getVercelAuthHeaders(includeJson = false) {
  if (!VERCEL_TOKEN) {
    throw new Error("Missing VERCEL_TOKEN");
  }

  return {
    Authorization: `Bearer ${VERCEL_TOKEN}`,
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
  };
}

function getVercelProjectUrl(path: string) {
  if (!VERCEL_PROJECT_ID) {
    throw new Error("Missing VERCEL_PROJECT_ID");
  }

  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(VERCEL_TEAM_ID)}` : "";
  return `https://api.vercel.com/v10/projects/${encodeURIComponent(VERCEL_PROJECT_ID)}${path}${teamQuery}`;
}

async function parseJsonSafe(response: Response): Promise<JsonObject> {
  try {
    const data = (await response.json()) as JsonObject;
    return data;
  } catch {
    return {};
  }
}

export async function addDomain(domain: string) {
  const normalizedDomain = domain.trim().toLowerCase();

  const res = await fetch(getVercelProjectUrl("/domains"), {
    method: "POST",
    headers: getVercelAuthHeaders(true),
    body: JSON.stringify({ name: normalizedDomain }),
    cache: "no-store",
  });

  return parseJsonSafe(res);
}

export async function removeDomain(domain: string) {
  const normalizedDomain = domain.trim().toLowerCase();

  const res = await fetch(getVercelProjectUrl(`/domains/${encodeURIComponent(normalizedDomain)}`), {
    method: "DELETE",
    headers: getVercelAuthHeaders(),
    cache: "no-store",
  });

  return parseJsonSafe(res);
}

export async function checkDomainStatus(domain: string) {
  const normalizedDomain = domain.trim().toLowerCase();

  const res = await fetch(getVercelProjectUrl(`/domains/${encodeURIComponent(normalizedDomain)}`), {
    headers: getVercelAuthHeaders(),
    cache: "no-store",
  });

  return parseJsonSafe(res);
}
