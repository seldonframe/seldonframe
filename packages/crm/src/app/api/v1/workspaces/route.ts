import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listManagedOrganizations } from "@/lib/billing/orgs";

function resolveUserIdFromSeldonApiKey(headers: Headers): string | null {
  const providedKey = headers.get("x-seldon-api-key")?.trim();
  if (!providedKey) {
    return null;
  }

  const configuredPairs = (process.env.SELDON_BUILDER_API_KEYS ?? "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf(":");
      if (separator < 1) {
        return null;
      }

      const key = pair.slice(0, separator).trim();
      const userId = pair.slice(separator + 1).trim();
      if (!key || !userId) {
        return null;
      }

      return { key, userId };
    })
    .filter((entry): entry is { key: string; userId: string } => Boolean(entry));

  const match = configuredPairs.find((entry) => entry.key === providedKey);
  return match?.userId ?? null;
}

export async function GET(request: Request) {
  const apiKeyUserId = resolveUserIdFromSeldonApiKey(request.headers);
  const hasApiKeyHeader = Boolean(request.headers.get("x-seldon-api-key")?.trim());

  const session = apiKeyUserId ? null : await auth();
  const userId = apiKeyUserId ?? session?.user?.id ?? null;

  if (hasApiKeyHeader && !apiKeyUserId) {
    return NextResponse.json({ error: "Invalid x-seldon-api-key." }, { status: 401 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await listManagedOrganizations(userId);
  const workspaceBaseDomain = process.env.WORKSPACE_BASE_DOMAIN?.trim() || "seldonframe.app";

  const workspaces = rows.map((row) => {
    const subdomain = `${row.slug}.${workspaceBaseDomain}`;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      subdomain,
      created_at: new Date(row.createdAt).toISOString(),
    };
  });

  return NextResponse.json({
    status: "ok",
    workspaces,
  });
}
