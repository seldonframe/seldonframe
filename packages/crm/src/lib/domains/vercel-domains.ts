import { connectCustomDomain, VercelDomainError } from "@/lib/vercel";

const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN?.trim() || process.env.VERCEL_TOKEN?.trim();
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID?.trim();
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID?.trim();

type JsonObject = Record<string, unknown>;
type VercelApiResult = {
  ok: boolean;
  status: number;
  data: JsonObject;
};

export function hasVercelDomainEnv() {
  return Boolean(VERCEL_TOKEN && VERCEL_PROJECT_ID);
}

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

function getVercelGlobalUrl(path: string) {
  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(VERCEL_TEAM_ID)}` : "";
  return `https://api.vercel.com${path}${teamQuery}`;
}

async function requestVercel(url: string, init: RequestInit, logLabel: string): Promise<VercelApiResult> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const data = await parseJsonSafe(res);
  console.log(logLabel, JSON.stringify({ status: res.status, ok: res.ok, data }, null, 2));

  return {
    ok: res.ok,
    status: res.status,
    data,
  };
}

export async function addDomain(domain: string) {
  const normalizedDomain = domain.trim().toLowerCase();

  try {
    const connected = await connectCustomDomain(VERCEL_PROJECT_ID ?? "workspace", normalizedDomain);

    return {
      ok: true,
      status: 200,
      data: {
        name: connected.domain,
        status: connected.status,
        verification: connected.verification,
        message: connected.message,
      },
    } satisfies VercelApiResult;
  } catch (error) {
    if (error instanceof VercelDomainError) {
      return {
        ok: false,
        status: error.status,
        data: error.data,
      } satisfies VercelApiResult;
    }

    return {
      ok: false,
      status: 500,
      data: {
        error: error instanceof Error ? error.message : "Vercel domain error",
      },
    } satisfies VercelApiResult;
  }
}

export async function removeDomain(domain: string) {
  const normalizedDomain = domain.trim().toLowerCase();

  return requestVercel(
    getVercelProjectUrl(`/domains/${encodeURIComponent(normalizedDomain)}`),
    {
      method: "DELETE",
      headers: getVercelAuthHeaders(),
    },
    "Vercel remove domain API response:"
  );
}

export async function checkDomainStatus(domain: string) {
  const normalizedDomain = domain.trim().toLowerCase();

  const [projectStatus, configStatus] = await Promise.all([
    requestVercel(
      getVercelProjectUrl(`/domains/${encodeURIComponent(normalizedDomain)}`),
      {
        headers: getVercelAuthHeaders(),
      },
      "Vercel project domain status API response:"
    ),
    requestVercel(
      getVercelGlobalUrl(`/v6/domains/${encodeURIComponent(normalizedDomain)}/config`),
      {
        headers: getVercelAuthHeaders(),
      },
      "Vercel domain config API response:"
    ),
  ]);

  return {
    ok: projectStatus.ok && configStatus.ok,
    status: Math.max(projectStatus.status, configStatus.status),
    data: {
      ...projectStatus.data,
      config: configStatus.data,
    },
  } satisfies VercelApiResult;
}
