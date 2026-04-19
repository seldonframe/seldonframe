// First-run integration test — full MCP chain against a running SeldonFrame API.
//
// Post-refactor architecture: backend has ZERO server-side LLM calls. Natural-
// language reasoning happens in the user's Claude Code session. This test
// exercises the typed deterministic endpoints directly.
//
// USAGE
//   API_BASE=https://staging.seldonframe.com/api/v1 pnpm test:first-run
//
// ENV
//   API_BASE                (required)  e.g. http://localhost:3000/api/v1
//   TEST_WORKSPACE_NAME     (optional)  override workspace name
//   SKIP_PUBLIC_URL_CHECKS  (optional)  "1" = skip HEAD checks on <slug>.app.seldonframe.com
//
// REQUIRES ON THE SERVER
//   - Migration 0015_workspace_bearer_tokens applied
//   - WORKSPACE_BASE_DOMAIN=app.seldonframe.com (or matching override)
//   - Wildcard DNS *.app.seldonframe.com (unless SKIP_PUBLIC_URL_CHECKS=1)
//   - NO ANTHROPIC_API_KEY required on the backend — the first-run chain is
//     LLM-free server-side.
//
// EXIT CODES
//   0 = all checks passed (or non-fatal-skips)
//   1 = one or more checks failed
//   2 = harness crashed before the report could print

const API_BASE = process.env.API_BASE?.trim() || "http://localhost:3000/api/v1";
const WORKSPACE_NAME =
  process.env.TEST_WORKSPACE_NAME?.trim() || `First-Run Test ${Date.now()}`;
const SKIP_PUBLIC = process.env.SKIP_PUBLIC_URL_CHECKS === "1";

type StepResult = { step: string; ok: boolean; detail: string; skipped?: boolean };
const results: StepResult[] = [];
let workspaceId: string | null = null;
let bearerToken: string | null = null;
let urls: Record<string, string> | null = null;

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: res.status, ok: res.ok, data: data as Record<string, unknown> };
}

async function get(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${API_BASE}${path}`, { headers });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: res.status, ok: res.ok, data: data as Record<string, unknown> };
}

function record(step: string, ok: boolean, detail: string, skipped = false) {
  results.push({ step, ok, detail, skipped });
  const icon = skipped ? "⏭" : ok ? "✅" : "❌";
  console.log(`${icon} ${step} — ${detail}`);
}

function authHeaders(): Record<string, string> {
  if (!bearerToken) throw new Error("bearerToken not set — earlier step failed");
  return { Authorization: `Bearer ${bearerToken}` };
}

async function stepCreateWorkspace() {
  const create = await post("/workspace/create", {
    name: WORKSPACE_NAME,
    source: "mcp-smoke-test",
  });
  const ws = create.data.workspace as { id?: string; slug?: string } | undefined;
  workspaceId = ws?.id ?? null;
  bearerToken = (create.data.bearer_token as string | undefined) ?? null;
  urls = (create.data.urls as Record<string, string> | undefined) ?? null;
  const ok = create.ok && !!workspaceId && !!bearerToken && !!urls?.home;
  record(
    "anonymous create_workspace",
    ok,
    `status=${create.status} id=${workspaceId ?? "?"} slug=${ws?.slug ?? "?"} bearer=${bearerToken ? bearerToken.slice(0, 8) + "…" : "missing"}`
  );
  return ok;
}

async function stepInstallBlocks() {
  const booking = await post(
    "/packs/caldiy-booking/install",
    { config: { theme: "dark" } },
    authHeaders()
  );
  record(
    "install_caldiy_booking",
    booking.ok && !!booking.data.default_template,
    `status=${booking.status} template=${JSON.stringify(booking.data.default_template)}`
  );

  const intake = await post("/packs/formbricks-intake/install", {}, authHeaders());
  record(
    "install_formbricks_intake",
    intake.ok && !!intake.data.default_template,
    `status=${intake.status} template=${JSON.stringify(intake.data.default_template)}`
  );
}

async function stepSubmitSoul() {
  const res = await post(
    "/soul/submit",
    {
      soul: {
        mission: "Help dental clinics in Laval, QC book new patients faster.",
        audience: "Independent dentists in Quebec",
        tone: "warm, professional, bilingual",
        offerings: [
          "New patient bookings",
          "Emergency care intake",
          "Bilingual (EN/FR) customer support",
        ],
      },
    },
    authHeaders()
  );
  record(
    "soul/submit",
    res.ok && typeof res.data.bytes === "number",
    `status=${res.status} bytes=${res.data.bytes}`
  );
}

async function stepLandingUpdate() {
  const res = await post(
    "/landing/update",
    {
      headline: "Dental Care in Laval",
      subhead: "Book your next appointment in under a minute.",
      cta_label: "Book now",
    },
    authHeaders()
  );
  record(
    "landing/update",
    res.ok && !!res.data.applied,
    `status=${res.status} applied=${JSON.stringify(res.data.applied ?? {})}`
  );
}

async function stepIntakeCustomize() {
  const res = await post(
    "/intake/customize",
    {
      fields: [
        { key: "full_name", label: "Full name", type: "text", required: true },
        { key: "email", label: "Email", type: "email", required: true },
        { key: "phone", label: "Phone", type: "tel", required: false },
        {
          key: "service",
          label: "What do you need?",
          type: "select",
          required: true,
          options: ["New patient", "Cleaning", "Emergency"],
        },
      ],
      form_name: "Book an appointment",
    },
    authHeaders()
  );
  record(
    "intake/customize",
    res.ok && !!res.data.applied,
    `status=${res.status} applied=${JSON.stringify(res.data.applied ?? {})}`
  );
}

async function stepBookingConfigure() {
  const res = await post(
    "/booking/configure",
    {
      title: "Initial consultation",
      duration_minutes: 45,
      description: "A 45-minute new-patient consultation.",
    },
    authHeaders()
  );
  record(
    "booking/configure",
    res.ok && !!res.data.applied,
    `status=${res.status} applied=${JSON.stringify(res.data.applied ?? {})}`
  );
}

async function stepThemeUpdate() {
  const res = await post(
    "/theme/update",
    {
      mode: "dark",
      primary_color: "#d97706",
      font_family: "Outfit",
    },
    authHeaders()
  );
  record(
    "theme/update",
    res.ok && !!res.data.applied,
    `status=${res.status} applied=${JSON.stringify(res.data.applied ?? {})}`
  );
}

async function stepWorkspaceSnapshot() {
  const res = await get(
    `/workspace/${encodeURIComponent(workspaceId ?? "")}/snapshot`,
    authHeaders()
  );
  const hasEntities = !!res.data.entities;
  const hasBlocks = !!res.data.blocks;
  const hasUrls = !!res.data.public_urls;
  const soulSubmitted = (res.data.soul as Record<string, unknown> | undefined)?.submitted === true;
  const ok = res.ok && hasEntities && hasBlocks && hasUrls && soulSubmitted;
  record(
    "workspace snapshot",
    ok,
    `status=${res.status} entities=${JSON.stringify(res.data.entities ?? {})} soul.submitted=${soulSubmitted}`
  );
}

async function stepListWorkspaces() {
  const res = await get("/workspaces", authHeaders());
  const list = res.data.workspaces as Array<{ id: string }> | undefined;
  const ok = res.ok && list?.length === 1 && list[0]?.id === workspaceId;
  record(
    "list_workspaces (bearer)",
    ok,
    `status=${res.status} count=${list?.length} id_match=${list?.[0]?.id === workspaceId}`
  );
}

async function stepLinkOwnerDenied() {
  const res = await post(
    `/workspace/${encodeURIComponent(workspaceId ?? "")}/link-owner`,
    {},
    authHeaders()
  );
  record(
    "link-owner without user identity → 401",
    res.status === 401,
    `status=${res.status} error=${res.data.error ?? "?"}`
  );
}

async function stepRevokeBearerUnauthorized() {
  const res = await post(
    `/workspace/${encodeURIComponent(workspaceId ?? "")}/revoke-bearer`,
    { all_except_current: true }
  );
  record(
    "revoke-bearer without auth → 401",
    res.status === 401,
    `status=${res.status} error=${res.data.error ?? "?"}`
  );
}

async function stepRevokeBearerBadTokenId() {
  const res = await post(
    `/workspace/${encodeURIComponent(workspaceId ?? "")}/revoke-bearer`,
    { token_id: "00000000-0000-0000-0000-000000000000" },
    authHeaders()
  );
  record(
    "revoke-bearer with bogus token_id → 404",
    res.status === 404,
    `status=${res.status} error=${res.data.error ?? "?"}`
  );
}

async function stepSwitchWorkspaceUnauth() {
  const baseOrigin = new URL(API_BASE).origin;
  const switchUrl = `${baseOrigin}/switch-workspace?to=${encodeURIComponent(workspaceId ?? "")}&next=/dashboard`;
  try {
    const res = await fetch(switchUrl, { redirect: "manual" });
    const loc = res.headers.get("location") ?? "";
    const redirectsToLogin = res.status >= 300 && res.status < 400 && loc.includes("/login");
    record(
      "switch-workspace without session → /login",
      redirectsToLogin,
      `status=${res.status} location=${loc.slice(0, 120)}`
    );
  } catch (error) {
    record(
      "switch-workspace without session → /login",
      false,
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function stepPublicUrls() {
  if (SKIP_PUBLIC) {
    record("public URL checks", true, "SKIP_PUBLIC_URL_CHECKS=1", true);
    return;
  }
  if (!urls) return;
  const toCheck: Array<[string, string]> = [
    ["home", urls.home],
    ["book", urls.book],
    ["intake", urls.intake],
  ].filter(([, u]) => typeof u === "string") as Array<[string, string]>;

  for (const [key, url] of toCheck) {
    try {
      const res = await fetch(url, { method: "GET", redirect: "manual" });
      const ok = res.status < 400;
      record(
        `public url [${key}]`,
        ok,
        `${url} → ${res.status}${res.headers.get("location") ? " → " + res.headers.get("location") : ""}`
      );
    } catch (error) {
      record(
        `public url [${key}]`,
        false,
        `${url} → ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

async function main() {
  console.log(`→ First-run smoke against ${API_BASE}`);
  console.log(`  skip_public=${SKIP_PUBLIC}`);
  console.log(`  workspace_name="${WORKSPACE_NAME}"\n`);

  const created = await stepCreateWorkspace();
  if (!created) {
    console.log("\n❌ create_workspace failed — bailing. Check API_BASE, migration, and env.");
    report();
    return;
  }

  await stepInstallBlocks();
  await stepSubmitSoul();

  // Typed customization endpoints — replace the old seldon_it LLM call.
  // These are the endpoints that Claude Code will hit on the user's behalf.
  await stepLandingUpdate();
  await stepIntakeCustomize();
  await stepBookingConfigure();
  await stepThemeUpdate();

  // Snapshot read — replaces the old /brain/query LLM path.
  await stepWorkspaceSnapshot();

  await stepListWorkspaces();
  await stepLinkOwnerDenied();
  await stepRevokeBearerUnauthorized();
  await stepRevokeBearerBadTokenId();
  await stepSwitchWorkspaceUnauth();
  await stepPublicUrls();

  console.log(`\n→ Captured workspace_id=${workspaceId} — clean up manually when done.`);
  report();
}

function report() {
  const passed = results.filter((r) => r.ok).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.ok && !r.skipped);
  console.log(`\n—— ${passed}/${results.length} passed (${skipped} skipped) ——`);
  if (failed.length > 0) {
    console.log("\nFAILURES:");
    for (const r of failed) console.log(`  ✗ ${r.step} — ${r.detail}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ harness crashed:", error);
  process.exit(2);
});
