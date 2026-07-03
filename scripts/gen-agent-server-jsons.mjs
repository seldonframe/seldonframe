#!/usr/bin/env node
// Per-agent MCP Registry entry generator — curated flagship publishing.
//
// Every listed SeldonFrame marketplace agent already lives at its own
// MCP-over-HTTP endpoint (the "Rent via MCP" rail:
// packages/crm/src/app/api/v1/agents/[slug]/mcp/route.ts). This script turns a
// hand-picked ALLOWLIST of published agent slugs into individual
// server.json manifests so each one can be submitted to the Official MCP
// Registry as its OWN entry — io.github.seldonframe/<agent-slug> — instead of
// only being reachable through the single io.github.seldonframe/mcp builder
// server. Each entry becomes its own directory-shelf listing (its own search
// hit, its own icon, its own "Add to Claude" button) that points straight at
// that one agent's rental endpoint.
//
// CURATION IS MANDATORY, NOT A FLAG: --slugs is a REQUIRED, explicit allowlist.
// There is no "publish everything" mode by design — see the CURATION RULE in
// skills/mcp-server/DISTRIBUTION.md. Publish a handful of genuinely distinct
// flagship agents; never bulk-flood the registry.
//
// WHAT AN ANONYMOUS CALLER GETS TODAY (read before treating this as a
// self-serve funnel): the generated remote answers `initialize`/`ping` with NO
// auth, but `tools/list` and `tools/call` (i.e. anything that actually DOES
// something) require `Authorization: Bearer <rk_… rental key>` — a signed key
// minted only via an authenticated, logged-in SeldonFrame org
// (lib/marketplace/rental.ts, a "use server" action gated on getOrgId()).
// There is currently NO public/anonymous path to mint that key. A directory
// visitor who adds this server gets a working handshake and then a
// "Missing rental key" JSON-RPC error on every real tool call — this script
// does not change that; it only publishes the discovery entry.
//
// Data sources (both read-only, no local DB access needed):
//   - Listings: GET https://app.seldonframe.com/api/acp/feed (public, no auth;
//     the OpenAI/ACP product feed — reuses the SAME published-listings query
//     the storefront already serves). Response: { products: [{ id (=slug),
//     title, description, price, link, product_category, ... }] }.
//   - Platform version: skills/mcp-server/package.json "version" (pins every
//     generated entry to the same version as the builder server.json).
//
// Usage (PowerShell):
//   node scripts/gen-agent-server-jsons.mjs --slugs 247-phone-receptionist
//   node scripts/gen-agent-server-jsons.mjs --slugs slug-a,slug-b --listings-json .\listings.json
//
// Usage (bash):
//   node scripts/gen-agent-server-jsons.mjs --slugs 247-phone-receptionist
//
// Flags:
//   --slugs <a,b,c>        REQUIRED. Comma-separated allowlist of agent slugs
//                          to generate entries for. No "all" flag exists.
//   --listings-json <path> OPTIONAL. Read listings from a local JSON file
//                          instead of fetching the live feed (same
//                          { products: [...] } shape as /api/acp/feed). Use
//                          this if the feed isn't reachable from where you're
//                          running the script, or to pin against a snapshot.
//   --feed-url <url>       OPTIONAL. Override the feed URL (default
//                          https://app.seldonframe.com/api/acp/feed).
//   --out <dir>            OPTIONAL. Output root (default dist/agent-servers).
//
// Output: dist/agent-servers/<slug>/server.json for each requested slug that
// exists in the fetched/loaded listings. Slugs not found in the listings are
// reported and skipped (not an error — the operator's allowlist may be ahead
// of what's currently published).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_FEED_URL = "https://app.seldonframe.com/api/acp/feed";
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, "dist", "agent-servers");
const REGISTRY_SCHEMA =
  "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
// Official MCP Registry ServerDetail.description maxLength (verified against
// the schema above — see the ground-truth check in the generator's PR).
const REGISTRY_DESCRIPTION_MAX_LENGTH = 100;

function parseArgs(argv) {
  const args = { slugs: null, listingsJsonPath: null, feedUrl: DEFAULT_FEED_URL, outDir: DEFAULT_OUT_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--slugs") {
      args.slugs = argv[++i] ?? null;
    } else if (arg.startsWith("--slugs=")) {
      args.slugs = arg.slice("--slugs=".length);
    } else if (arg === "--listings-json") {
      args.listingsJsonPath = argv[++i] ?? null;
    } else if (arg.startsWith("--listings-json=")) {
      args.listingsJsonPath = arg.slice("--listings-json=".length);
    } else if (arg === "--feed-url") {
      args.feedUrl = argv[++i] ?? DEFAULT_FEED_URL;
    } else if (arg.startsWith("--feed-url=")) {
      args.feedUrl = arg.slice("--feed-url=".length);
    } else if (arg === "--out") {
      args.outDir = path.resolve(argv[++i] ?? DEFAULT_OUT_DIR);
    } else if (arg.startsWith("--out=")) {
      args.outDir = path.resolve(arg.slice("--out=".length));
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function printUsage() {
  console.log(`Per-agent MCP Registry entry generator (curated flagship publishing)

REQUIRED:
  --slugs <a,b,c>          Comma-separated allowlist of agent slugs to publish.
                            There is no "publish all" mode — curation is mandatory.

OPTIONAL:
  --listings-json <path>   Read listings from a local JSON file instead of the
                            live feed (same { products: [...] } shape as
                            GET /api/acp/feed).
  --feed-url <url>         Override the feed URL (default:
                            ${DEFAULT_FEED_URL}).
  --out <dir>              Output root (default: dist/agent-servers).

Example:
  node scripts/gen-agent-server-jsons.mjs --slugs 247-phone-receptionist
`);
}

/** Truncate a description to the registry's maxLength, on a word boundary
 *  where possible, ending with an ellipsis so it reads as intentionally cut. */
function truncateDescription(description, maxLength) {
  const trimmed = (description ?? "").trim();
  if (trimmed.length <= maxLength) return trimmed;
  const ellipsis = "…";
  const budget = maxLength - ellipsis.length;
  const hardCut = trimmed.slice(0, budget);
  const lastSpace = hardCut.lastIndexOf(" ");
  // Only break on a word boundary if it doesn't throw away too much text.
  const cut = lastSpace > budget * 0.6 ? hardCut.slice(0, lastSpace) : hardCut;
  return `${cut.trimEnd()}${ellipsis}`;
}

/** Fetch listings from the live public feed. Throws on network/HTTP failure. */
async function fetchListingsFromFeed(feedUrl) {
  const res = await fetch(feedUrl, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Feed fetch failed: HTTP ${res.status} ${res.statusText} (${feedUrl})`);
  }
  const json = await res.json();
  if (!json || !Array.isArray(json.products)) {
    throw new Error(`Feed response at ${feedUrl} did not have the expected { products: [...] } shape.`);
  }
  return json.products;
}

/** Load listings from a local JSON file (same { products: [...] } shape). */
async function loadListingsFromFile(filePath) {
  const resolved = path.resolve(filePath);
  const raw = await readFile(resolved, "utf8");
  const json = JSON.parse(raw);
  if (!json || !Array.isArray(json.products)) {
    throw new Error(`--listings-json file ${resolved} did not have the expected { products: [...] } shape.`);
  }
  return json.products;
}

/** Read the platform version every generated entry is pinned to. */
async function readPlatformVersion() {
  const pkgPath = path.join(REPO_ROOT, "skills", "mcp-server", "package.json");
  const raw = await readFile(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  if (typeof pkg.version !== "string" || pkg.version.length === 0) {
    throw new Error(`${pkgPath} has no "version" field.`);
  }
  return pkg.version;
}

/** The public rental endpoint URL for one agent slug — matches EXACTLY the
 *  route that serves it (packages/crm/src/app/api/v1/agents/[slug]/mcp). */
function rentalEndpointUrl(slug) {
  return `https://app.seldonframe.com/api/v1/agents/${slug}/mcp`;
}

/** Build one registry server.json entry for a listing row. */
function buildServerJson(product, version) {
  const description = truncateDescription(
    product.description || product.title || product.id,
    REGISTRY_DESCRIPTION_MAX_LENGTH,
  );
  return {
    $schema: REGISTRY_SCHEMA,
    name: `io.github.seldonframe/${product.id}`,
    description,
    version,
    repository: {
      url: "https://github.com/seldonframe/seldonframe",
      source: "github",
    },
    remotes: [{ type: "streamable-http", url: rentalEndpointUrl(product.id) }],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  if (!args.slugs) {
    console.error(
      'ERROR: --slugs is required (e.g. --slugs 247-phone-receptionist,another-agent-slug).\n' +
        "This tool is curation-first by design — there is no flag to publish every listed agent.\n" +
        "See the CURATION RULE in skills/mcp-server/DISTRIBUTION.md.\n",
    );
    printUsage();
    process.exitCode = 1;
    return;
  }

  const requestedSlugs = args.slugs
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (requestedSlugs.length === 0) {
    console.error("ERROR: --slugs resolved to an empty list after parsing.");
    process.exitCode = 1;
    return;
  }

  console.log(
    args.listingsJsonPath
      ? `Loading listings from ${path.resolve(args.listingsJsonPath)} ...`
      : `Fetching published listings from ${args.feedUrl} ...`,
  );

  let products;
  try {
    products = args.listingsJsonPath
      ? await loadListingsFromFile(args.listingsJsonPath)
      : await fetchListingsFromFeed(args.feedUrl);
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Loaded ${products.length} published listing(s).`);

  const version = await readPlatformVersion();
  console.log(`Pinning generated entries to platform version ${version} (skills/mcp-server/package.json).`);

  const bySlug = new Map(products.map((p) => [p.id, p]));
  const generated = [];
  const missing = [];

  for (const slug of requestedSlugs) {
    const product = bySlug.get(slug);
    if (!product) {
      missing.push(slug);
      continue;
    }
    const serverJson = buildServerJson(product, version);
    const outDir = path.join(args.outDir, slug);
    const outFile = path.join(outDir, "server.json");
    await mkdir(outDir, { recursive: true });
    await writeFile(outFile, `${JSON.stringify(serverJson, null, 2)}\n`, "utf8");
    generated.push({ slug, outFile, serverJson });
    console.log(`  ✓ wrote ${path.relative(REPO_ROOT, outFile)}`);
  }

  if (missing.length > 0) {
    console.log(
      `\nSkipped ${missing.length} requested slug(s) not found in the current published listings: ${missing.join(", ")}`,
    );
  }

  if (generated.length === 0) {
    console.error("\nERROR: none of the requested slugs matched a published listing. Nothing was generated.");
    process.exitCode = 1;
    return;
  }

  console.log(`\n${generated.length} entr${generated.length === 1 ? "y" : "ies"} generated under ${path.relative(REPO_ROOT, args.outDir)}/\n`);

  console.log("=".repeat(78));
  console.log("CURATION REMINDER: only publish genuinely distinct flagship agents.");
  console.log("Near-identical entries read as spam and risk the whole");
  console.log("io.github.seldonframe namespace. See skills/mcp-server/DISTRIBUTION.md.");
  console.log("=".repeat(78));

  console.log("\nNext steps — submit each generated entry to the Official MCP Registry:\n");

  console.log("One-time login (once per mcp-publisher session):");
  console.log("  mcp-publisher login github\n");

  console.log("PowerShell — publish each entry:");
  for (const { slug, outFile } of generated) {
    const dir = path.dirname(outFile);
    console.log(`  Push-Location "${dir}"; mcp-publisher publish; Pop-Location`);
  }

  console.log("\nbash — publish each entry:");
  for (const { slug, outFile } of generated) {
    const dir = path.dirname(outFile);
    console.log(`  pushd "${dir}" && mcp-publisher publish && popd`);
  }
  console.log("");
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.stack || err.message : String(err));
  process.exitCode = 1;
});
