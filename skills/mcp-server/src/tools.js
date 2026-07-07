import {
  api,
  API_INFO,
  defaultDeviceLabel,
  fetchText,
  forgetWorkspace,
  htmlToText,
  rememberWorkspace,
  setDefaultWorkspace,
  getDefaultWorkspace,
  getWorkspaceBearer,
  getApiKey,
  knownWorkspaceIds,
  hasApiKey,
  isFirstEverCall,
} from "./client.js";
// v1.7.1 — direct import of VERSION. The connect_workspace handler
// references it for the User-Agent header on the anonymous /auth/*
// fetch calls (those bypass api() because they're pre-bearer). Earlier
// drafts assumed VERSION leaked in via client.js's transitive import;
// it doesn't. Direct import = no runtime "VERSION is not defined".
import { FIRST_CALL_BANNER, VERSION } from "./welcome.js";
// v1.55.0 — finalize_workspace summary builder extracted into its own
// module so it can be unit-tested in isolation. See
// packages/crm/tests/unit/finalize-summary-v1-55.spec.ts.
import { buildFinalizeSummary } from "./finalize-summary.js";
// v1.10.1 — upload_workspace_image local_file_path branch reads the file
// directly in the MCP-client process (which runs on the operator's
// machine via the npm package). Reading + base64-encoding here means
// the agent's tool-call body stays small (just a path string), bypassing
// the agent token budget that v1.10.0's image_data_b64 path was bound by.
import { readFileSync } from "node:fs";
import path from "node:path";
// v1.59.2 — security hardening: image-content sniffing (upload_workspace_image)
// and the SSRF guard for machine-side fetches of operator-supplied URLs
// (fetch_source_for_soul). See src/security.js for details + tests.
import { sniffImageKind, assertPublicHttpUrl } from "./security.js";

const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const obj = (properties, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

function withFirstCallBanner(payload) {
  if (!isFirstEverCall()) return payload;
  return { ...payload, _welcome: FIRST_CALL_BANNER };
}

function wsOrDefault(workspace_id) {
  const id = workspace_id ?? getDefaultWorkspace();
  if (!id) {
    throw new Error(
      "No workspace selected. Run create_workspace({ name: '…' }) first, or pass workspace_id.",
    );
  }
  return id;
}

export const TOOLS = [
  // May 2, 2026 (v1.1.2) — `create_workspace` (formerly
  // `_legacy_create_workspace`) DELETED entirely from the tool registry.
  // Deprecation in 1.1.1 didn't stop Claude Code from finding alternative
  // multi-tool paths to compose a workspace. Removing the tool outright
  // is the only structural way to force `create_full_workspace`.
  {
    name: "create_full_workspace",
    description:
      "Atomic workspace creation from pre-extracted business facts. Equivalent to create_workspace_v2 but single-call (no block-by-block iteration). Used as the follow-up after `create_workspace_from_url` for cases where the operator wants the workspace produced in one shot rather than block-iterated. " +
      "Example: create_full_workspace({ business_name: 'Summit Air Comfort', city: 'Phoenix', state: 'AZ', phone: '(480) 555-2100', services: ['AC repair', 'heating installation', 'duct cleaning'], business_description: 'Residential and commercial HVAC in Phoenix', review_count: 950, review_rating: 4.7, trust_signals: ['licensed', 'bonded', 'insured'], emergency_service: true, same_day: true, service_area: ['Scottsdale', 'Tempe', 'Mesa'] }). " +
      "MANDATORY FOLLOW-UP: same as create_workspace_v2 — after this returns `status: 'ready'`, ask 'What email should I use for your account?' and call finalize_workspace({ workspace_id, email }).",
    inputSchema: obj(
      {
        business_name: str("Business display name (e.g. 'Summit Air Comfort')."),
        city: str("Operator's city. Drives timezone inference."),
        state: str("US state code or full name (or Canadian province). Drives timezone inference."),
        phone: str("Business phone, any format. Renders in nav, hero, footer."),
        services: {
          type: "array",
          description:
            "Services / offerings the business provides — each as a plain string. The classifier reads these to pick the right CRM personality (HVAC, legal, dental, coaching, agency, default).",
          items: { type: "string" },
        },
        business_description: str(
          "One paragraph describing the business — drives the hero subhead, about section, and (critically) the personality classifier. Include industry words verbatim ('residential HVAC', 'family-owned plumbing', 'dental practice')."
        ),
        review_count: { type: "number", description: "Optional — number of reviews. Surfaces in trust strip + hero proof metric." },
        review_rating: { type: "number", description: "Optional — average star rating (e.g. 4.7). Surfaces in trust strip." },
        certifications: {
          type: "array",
          description: "Optional — credentials like ['EPA-certified', 'NATE-certified']. Surfaces in trust strip.",
          items: { type: "string" },
        },
        trust_signals: {
          type: "array",
          description: "Optional — short claims like ['licensed', 'bonded', 'insured']. Surfaces in trust strip.",
          items: { type: "string" },
        },
        emergency_service: { type: "boolean", description: "Optional — operator offers 24/7 emergency service. Surfaces in nav + hero." },
        same_day: { type: "boolean", description: "Optional — same-day service available. Surfaces in trust strip." },
        service_area: {
          type: "array",
          description: "Optional — cities or neighborhoods served (e.g. ['Scottsdale', 'Tempe']).",
          items: { type: "string" },
        },
        email: str("Optional contact email surfaced in the landing footer (NOT the operator's account email — that comes via finalize_workspace)."),
        address: str("Optional business address."),
      },
      ["business_name", "city", "state", "phone", "services", "business_description"]
    ),
    handler: async (args) => {
      const firstEver = isFirstEverCall();
      const result = await api("POST", "/workspaces/create-full", {
        body: {
          business_name: args.business_name,
          city: args.city,
          state: args.state,
          phone: args.phone,
          services: args.services,
          business_description: args.business_description,
          review_count: args.review_count ?? null,
          review_rating: args.review_rating ?? null,
          certifications: args.certifications ?? null,
          trust_signals: args.trust_signals ?? null,
          emergency_service: args.emergency_service ?? null,
          same_day: args.same_day ?? null,
          service_area: args.service_area ?? null,
          email: args.email ?? null,
          address: args.address ?? null,
        },
        allow_anonymous: true,
      });

      if (result?.status !== "ready" || !result?.workspace_id) {
        return result;
      }

      // Stash the bearer locally so subsequent MCP calls (finalize_workspace
      // + the customization tools) can authenticate. We strip the bearer
      // from the visible response — only Claude Code's stash uses it.
      if (result._bearer_token) {
        rememberWorkspace({
          workspace_id: result.workspace_id,
          bearer_token: result._bearer_token,
        });
      }

      // Build the operator-facing payload. Notable absence: admin_url.
      // The admin browser URL is created in finalize_workspace, NOT
      // here — that's the structural enforcement of email collection.
      const guardrail = [
        "⚠️ WORKSPACE CREATED — DO NOT END YET ⚠️",
        "",
        `The workspace "${args.business_name}" exists on the backend but the operator-facing flow is NOT complete. You MUST do exactly two things before responding to the user:`,
        "",
        "  1. Ask the user verbatim:",
        "     " + JSON.stringify(result.operator_prompt ?? "What email should I use for your account?"),
        "",
        "  2. Once they reply with an email, call:",
        `     finalize_workspace({ workspace_id: "${result.workspace_id}", email: <their_email>, name: <optional_name> })`,
        "",
        "DO NOT show the operator any URLs from this response yet. The admin dashboard URL does not exist — finalize_workspace creates it. The operator-facing summary (with all URLs + admin link + what's configured) is returned by finalize_workspace.",
      ].join("\n");

      const payload = {
        ok: true,
        DO_NOT_DISPLAY_TO_USER: guardrail,
        workspace: {
          id: result.workspace_id,
          slug: result.slug,
        },
        configured: result.configured,
        next_step: {
          required: true,
          do_not_show_urls_until_email_collected: true,
          ask_user_verbatim: result.operator_prompt,
          tool_to_call: "finalize_workspace",
          tool_args_template: {
            workspace_id: result.workspace_id,
            email: "<operator_email>",
            name: "<optional>",
          },
          why_required:
            "finalize_workspace creates the admin dashboard URL (it does not exist yet), sends the welcome email, captures the operator as a lead, and returns the formatted operator-facing summary. Skipping it leaves the operator with no admin access at all.",
          consequence_of_skipping:
            "The admin dashboard URL is structurally not in this response. Skipping finalize_workspace means the operator can't get into their workspace. This IS a broken flow.",
        },
        // Internal-only — public URLs only. No admin URL anywhere.
        _pending_after_email: {
          website_url: result.public_urls?.home ?? null,
          booking_url: result.public_urls?.book ?? null,
          intake_url: result.public_urls?.intake ?? null,
        },
      };
      return firstEver ? withFirstCallBanner(payload) : payload;
    },
  },
  // v1.37.0 — Google Maps PASTE → workspace (no Places API).
  //
  // Discoverability shim around create_full_workspace. Same backend
  // pipeline (POST /workspaces/create-full), same atomic guarantees,
  // same finalize_workspace follow-up. The value-add: a tool whose
  // DESCRIPTION teaches Claude Code exactly how to extract structured
  // fields from a raw Google Maps paste — name, address, phone,
  // categories→services, rating, review count, weekly hours — and
  // which fields the backend pipes into which artifact (hours →
  // booking template's metadata.availability via the new weekly_hours
  // input, closing the loop with the v1.36.4 read-path fix).
  //
  // Thin harness, fat skill: NO regex parser on the backend, NO LLM
  // call on the backend. Claude Code (the agent) parses the paste
  // and calls this tool with the structured fields. The MCP server
  // is just a typed shim over the existing POST endpoint.
  //
  // Why a sibling tool instead of bolting `weekly_hours` onto
  // create_full_workspace? Discoverability. When the operator says
  // "make a workspace from this Google Maps listing", Claude Code
  // sees a tool literally named `create_workspace_from_google_paste`
  // with a docstring full of paste-extraction examples — no judgment
  // call about whether create_full_workspace is the right tool. The
  // surface area is the documentation.
  {
    name: "create_workspace_from_google_paste",
    description:
      "PREFERRED when the operator pastes a Google Maps business listing. Same atomic pipeline as create_full_workspace; this tool's docs guide the paste-to-fields extraction. Claude Code parses the paste BEFORE calling this tool — never pass the raw paste text. " +
      "EXTRACTION RULES (apply in order): " +
      "1) business_name → the bold business title at the top of the listing. " +
      "2) phone → the digits next to the phone icon. " +
      "3) address → the line next to the location pin. Parse city + state from this address into separate fields (city/state). " +
      "4) services → derive from BOTH the categories chip row (e.g. 'Plumber · Emergency plumbing service') AND any explicit 'Services' section ('Drain cleaning', 'Water heater repair'). Dedupe; keep 5-12 distinct strings. " +
      "5) business_description → synthesize 1-2 sentences from the categories + 'About' / 'From the business' section. Include industry words verbatim (the personality classifier reads this). " +
      "6) review_rating + review_count → the '4.7 ★ (950)' element. " +
      "7) trust_signals → 'Licensed', 'Bonded', 'Insured', 'Family-owned' if mentioned. " +
      "8) emergency_service / same_day → set true if 'open 24 hours', '24/7', 'same-day service' appears. " +
      "9) service_area → cities mentioned in 'Service area' section. " +
      "10) weekly_hours → parse the hours block ('Monday: 9 AM-5 PM, Tuesday: closed, ...') into the canonical shape: {monday:{enabled:true,start:'09:00',end:'17:00'},tuesday:{enabled:false,start:'09:00',end:'17:00'},...}. Keys MUST be FULL DAY NAMES (sunday/monday/.../saturday); times MUST be HH:MM 24-hour. 'Closed' → enabled:false (start/end are placeholders). 'Open 24 hours' → start:'00:00', end:'23:59'. These hours are written DIRECTLY to the booking template's availability — wrong shape = booking page falls back to Mon-Fri 9-5 default. " +
      "11) google_place_url → the Maps URL the operator pasted, if visible. Optional, stored on soul.business.maps_url for audit. " +
      "MANDATORY FOLLOW-UP: same as create_full_workspace — after this returns `status: 'ready'`, ask 'What email should I use for your account?' and call finalize_workspace({ workspace_id, email }).",
    inputSchema: obj(
      {
        business_name: str("Business display name (top of the Maps listing)."),
        city: str("City parsed from the Maps address line."),
        state: str("US state code or full name parsed from the Maps address line."),
        phone: str("Phone number from the Maps phone icon row, any format."),
        services: {
          type: "array",
          description:
            "Services derived from the Maps categories + 'Services' chips, deduped. 5-12 strings.",
          items: { type: "string" },
        },
        business_description: str(
          "1-2 sentence summary synthesized from Maps categories + 'About' / 'From the business' section."
        ),
        review_count: { type: "number", description: "Optional — review count from '★ (N)' display." },
        review_rating: { type: "number", description: "Optional — average star rating (e.g. 4.7)." },
        certifications: {
          type: "array",
          description: "Optional — credentials mentioned in the listing (['EPA-certified', ...]).",
          items: { type: "string" },
        },
        trust_signals: {
          type: "array",
          description: "Optional — 'Licensed', 'Bonded', 'Insured', 'Family-owned' if surfaced.",
          items: { type: "string" },
        },
        emergency_service: { type: "boolean", description: "Optional — listing shows 'open 24 hours' or '24/7'." },
        same_day: { type: "boolean", description: "Optional — listing mentions 'same-day service'." },
        service_area: {
          type: "array",
          description: "Optional — cities/neighborhoods from the 'Service area' section.",
          items: { type: "string" },
        },
        email: str("Optional contact email from the listing (NOT the operator's account email)."),
        address: str("Optional full address line from the listing."),
        weekly_hours: {
          type: "object",
          description:
            "Canonical weekly schedule extracted from the Maps hours block. Keys are FULL DAY NAMES (sunday/monday/tuesday/wednesday/thursday/friday/saturday). Each value is { enabled: boolean, start: 'HH:MM', end: 'HH:MM' } in 24-hour format. Closed days use enabled:false. 'Open 24 hours' → enabled:true, start:'00:00', end:'23:59'. Wrong shape silently falls back to Mon-Fri 9-5 defaults — get the keys right.",
          additionalProperties: false,
          properties: {
            sunday: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: { type: "boolean" },
                start: { type: "string", description: "HH:MM 24-hour" },
                end: { type: "string", description: "HH:MM 24-hour" },
              },
              required: ["enabled", "start", "end"],
            },
            monday: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: { type: "boolean" },
                start: { type: "string" },
                end: { type: "string" },
              },
              required: ["enabled", "start", "end"],
            },
            tuesday: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: { type: "boolean" },
                start: { type: "string" },
                end: { type: "string" },
              },
              required: ["enabled", "start", "end"],
            },
            wednesday: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: { type: "boolean" },
                start: { type: "string" },
                end: { type: "string" },
              },
              required: ["enabled", "start", "end"],
            },
            thursday: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: { type: "boolean" },
                start: { type: "string" },
                end: { type: "string" },
              },
              required: ["enabled", "start", "end"],
            },
            friday: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: { type: "boolean" },
                start: { type: "string" },
                end: { type: "string" },
              },
              required: ["enabled", "start", "end"],
            },
            saturday: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: { type: "boolean" },
                start: { type: "string" },
                end: { type: "string" },
              },
              required: ["enabled", "start", "end"],
            },
          },
        },
        google_place_url: str(
          "Optional — the Google Maps share URL for the listing. Stored on soul.business.maps_url for audit."
        ),
        // v1.38.3 — testimonials extracted from review excerpts in the
        // Maps paste. Pass these through VERBATIM — never rewrite or
        // synthesize. The backend renders them as-is. When the paste
        // has no review excerpts, OMIT this field entirely (do not
        // pass an empty array, do not invent reviews).
        testimonials: {
          type: "array",
          description:
            "OPTIONAL real review excerpts extracted from the Maps paste, VERBATIM (do not rewrite). Each entry: { quote, name?, role?, rating? }. quote = the actual review text the customer wrote (≤800 chars). name = reviewer name as shown on Google. role = customer descriptor like 'Homeowner', 'Property manager' (omit if unknown). rating = 1-5 if visible. Pass 3-6 entries when paste contains genuine reviews; OMIT this entire field when paste has no review text. NEVER fabricate reviews.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              quote: { type: "string", description: "Verbatim review text from the paste." },
              name: { type: "string", description: "Reviewer name from Google. Optional." },
              role: { type: "string", description: "Customer descriptor (e.g. 'Homeowner'). Optional." },
              company: { type: "string", description: "Optional — only relevant for B2B reviews." },
              rating: { type: "number", description: "1-5 star rating if visible." },
            },
            required: ["quote"],
          },
        },
      },
      ["business_name", "city", "state", "phone", "services", "business_description"]
    ),
    handler: async (args) => {
      const firstEver = isFirstEverCall();
      const result = await api("POST", "/workspaces/create-full", {
        body: {
          business_name: args.business_name,
          city: args.city,
          state: args.state,
          phone: args.phone,
          services: args.services,
          business_description: args.business_description,
          review_count: args.review_count ?? null,
          review_rating: args.review_rating ?? null,
          certifications: args.certifications ?? null,
          trust_signals: args.trust_signals ?? null,
          emergency_service: args.emergency_service ?? null,
          same_day: args.same_day ?? null,
          service_area: args.service_area ?? null,
          email: args.email ?? null,
          address: args.address ?? null,
          // v1.37.0 — Google Maps paste fields. Backend silently
          // drops malformed weekly_hours so a paste quirk never
          // blocks workspace creation; defaults take over.
          weekly_hours: args.weekly_hours ?? null,
          google_place_url: args.google_place_url ?? null,
          // v1.38.3 — operator-supplied testimonials. Pass through
          // verbatim; backend drops malformed entries silently.
          testimonials: args.testimonials ?? null,
        },
        allow_anonymous: true,
      });

      if (result?.status !== "ready" || !result?.workspace_id) {
        return result;
      }

      if (result._bearer_token) {
        rememberWorkspace({
          workspace_id: result.workspace_id,
          bearer_token: result._bearer_token,
        });
      }

      const guardrail = [
        "⚠️ WORKSPACE CREATED — DO NOT END YET ⚠️",
        "",
        `The workspace "${args.business_name}" exists on the backend (scaffolded from a Google Maps paste) but the operator-facing flow is NOT complete. You MUST do exactly two things before responding to the user:`,
        "",
        "  1. Ask the user verbatim:",
        "     " + JSON.stringify(result.operator_prompt ?? "What email should I use for your account?"),
        "",
        "  2. Once they reply with an email, call:",
        `     finalize_workspace({ workspace_id: "${result.workspace_id}", email: <their_email>, name: <optional_name> })`,
        "",
        "DO NOT show the operator any URLs from this response yet. The admin dashboard URL does not exist — finalize_workspace creates it. The operator-facing summary (with all URLs + admin link + what's configured) is returned by finalize_workspace.",
      ].join("\n");

      const payload = {
        ok: true,
        DO_NOT_DISPLAY_TO_USER: guardrail,
        workspace: {
          id: result.workspace_id,
          slug: result.slug,
        },
        configured: result.configured,
        // v1.37.0 — confirm to Claude Code that the paste-derived hours
        // landed on the booking template. If weekly_hours was passed
        // and the backend accepted it, the booking page will render
        // the operator's actual business hours on first GET — no
        // separate configure_booking call needed.
        applied_from_google_paste: {
          weekly_hours: args.weekly_hours ? Object.keys(args.weekly_hours).length : 0,
          google_place_url: args.google_place_url ?? null,
        },
        next_step: {
          required: true,
          do_not_show_urls_until_email_collected: true,
          ask_user_verbatim: result.operator_prompt,
          tool_to_call: "finalize_workspace",
          tool_args_template: {
            workspace_id: result.workspace_id,
            email: "<operator_email>",
            name: "<optional>",
          },
          why_required:
            "finalize_workspace creates the admin dashboard URL (it does not exist yet), sends the welcome email, captures the operator as a lead, and returns the formatted operator-facing summary.",
        },
        _pending_after_email: {
          website_url: result.public_urls?.home ?? null,
          booking_url: result.public_urls?.book ?? null,
          intake_url: result.public_urls?.intake ?? null,
        },
      };
      return firstEver ? withFirstCallBanner(payload) : payload;
    },
  },
  // create_workspace_from_url — URL → extraction playbook → atomic build.
  // Returns the server's extraction instructions; Claude WebFetches +
  // extracts, then calls create_full_workspace (v1.58.1: the atomic path —
  // it now builds the production multi-page R1 site server-side, the same
  // engine as the SeldonFrame dashboard's /clients/new, so the old
  // block-iterated v2 follow-up is no longer the best pipeline here).
  {
    name: "create_workspace_from_url",
    description:
      "Entry point for URL-based workspace creation. Returns instructions Claude follows: WebFetch the URL, optionally WebFetch up to 2 priority sub-pages (e.g. /about, /services, /contact, /pricing), extract structured business facts, ask the operator for any required field that can't be determined, then call `create_full_workspace` with the result — ONE atomic call that builds the workspace + the production multi-page website (vertical-aware landing + per-service detail pages, the same engine as the SeldonFrame dashboard) + booking page + intake form + CRM + draft chatbot. " +
      "THIS TOOL DOES NOT CREATE A WORKSPACE — it returns the playbook. The workspace is created by the follow-up `create_full_workspace` call. Do NOT use the block-iterated create_workspace_v2 flow for URL builds. " +
      "When operator provides ANY of: 'http://', 'https://', a domain (.com/.io/.net/.co/.app/.dev/.us etc), or 'create workspace for <URL>' — call this tool. Do NOT manually WebFetch first; the instructions returned by this tool tell you exactly what to fetch and in what order. " +
      "MANDATORY FOLLOW-UP: After create_full_workspace returns, ask the operator 'What email should I use for your account?' and call finalize_workspace({ workspace_id, email }).",
    inputSchema: obj(
      {
        url: str("Business website URL the operator provided, e.g. https://quigleyac.com"),
      },
      ["url"]
    ),
    handler: async (args) =>
      api(
        "GET",
        `/workspace/extract-instructions?url=${encodeURIComponent(args.url)}`,
        { allow_anonymous: true }
      ),
  },
  // v1.47 — explicit opt-in landing-page generator. create_workspace_from_url
  // defaults to NO landing page (the client already has their own site);
  // when the operator DOES want a SeldonFrame-hosted landing page, this
  // tool generates it on demand.
  {
    name: "generate_landing_page",
    description:
      "Generate a SeldonFrame-hosted landing page for an EXISTING workspace. " +
      "USE-WHEN: operator explicitly asks for a landing page after the workspace exists, OR the client has no website of their own and the agency wants SeldonFrame to host the public-facing site. " +
      "If the client already has a website (the common agency case), the chatbot embed snippet returned by create_workspace_from_url is the canonical deliverable; you do NOT need a generated landing page. " +
      "Latency: ~30-60s. Returns the public landing URL. Operator can later customize per-block via update_landing_section / persist_block.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace UUID (from create_workspace_from_url or other creation tool)."),
        style: str(
          "Optional archetype override: 'bold-urgency', 'editorial-warm', 'clinical-trust', 'cinematic-aspirational'. If omitted, the soul's base_framework picks the default style."
        ),
      },
      ["workspace_id"]
    ),
    handler: async (args) =>
      api("POST", "/workspace/generate-landing-page", {
        body: {
          workspace_id: args.workspace_id,
          style: args.style ?? null,
        },
        allow_anonymous: true,
      }),
  },
  {
    name: "list_workspaces",
    description: "List all workspaces known to this device (plus any Pro workspaces if SELDONFRAME_API_KEY is set).",
    inputSchema: obj({}),
    handler: async () => {
      const local = knownWorkspaceIds();
      const data = await api("GET", "/workspaces", { allow_anonymous: true });
      return {
        ok: true,
        default_workspace: getDefaultWorkspace(),
        device_known: local,
        workspaces: data.workspaces ?? data,
      };
    },
  },
  {
    name: "switch_workspace",
    description: "Set the active workspace. Subsequent tool calls act on it by default.",
    inputSchema: obj({ workspace_id: str("Target workspace id.") }, ["workspace_id"]),
    handler: async ({ workspace_id }) => {
      setDefaultWorkspace(workspace_id);
      return { ok: true, default_workspace: workspace_id };
    },
  },
  {
    name: "clone_workspace",
    description:
      "Clone an existing workspace as a template. Example: clone_workspace({ source_workspace_id: 'wsp_x', name: 'Copy' })",
    inputSchema: obj(
      {
        source_workspace_id: str("Workspace to clone from."),
        name: str("Name for the new workspace."),
      },
      ["source_workspace_id", "name"],
    ),
    handler: async (a) => {
      const result = await api(
        "POST",
        `/workspaces/${encodeURIComponent(a.source_workspace_id)}/clone`,
        { body: { name: a.name }, workspace_id: a.source_workspace_id },
      );
      const id = result.workspace?.id ?? result.id;
      if (id && result.bearer_token) {
        rememberWorkspace({ workspace_id: id, bearer_token: result.bearer_token });
      }
      return { ok: true, ...result };
    },
  },
  {
    name: "link_workspace_owner",
    description:
      "Claim an anonymously-created workspace under your real account. After linking, the admin URLs (dashboard, contacts, deals) become usable once you sign in at app.seldonframe.com. Requires SELDONFRAME_API_KEY to be set in the MCP environment. The workspace bearer token continues to work — no rotation needed. Example: link_workspace_owner({}) to claim the active workspace.",
    inputSchema: obj({
      workspace_id: str(
        "Optional workspace id to claim. Defaults to the active workspace from this device."
      ),
    }),
    handler: async (a) => {
      const workspaceId = a.workspace_id ?? getDefaultWorkspace();
      if (!workspaceId) {
        throw new Error(
          "No workspace to link. Run create_workspace first, or pass workspace_id."
        );
      }
      const bearer = getWorkspaceBearer(workspaceId);
      if (!bearer) {
        throw new Error(
          `No local bearer token for workspace ${workspaceId}. This device did not create it. Re-run create_workspace or switch to the device that did.`
        );
      }
      const apiKey = getApiKey();
      if (!apiKey) {
        throw new Error(
          "Linking an owner requires SELDONFRAME_API_KEY. Get one at https://app.seldonframe.com/settings/api, then `export SELDONFRAME_API_KEY=sk-…` and restart the MCP server."
        );
      }
      const result = await api(
        "POST",
        `/workspace/${encodeURIComponent(workspaceId)}/link-owner`,
        {
          body: {},
          workspace_id: workspaceId,
          force_workspace_bearer: true,
          extra_headers: { "x-seldon-api-key": apiKey },
        },
      );
      const magicLink = result?.urls?.claim_magic_link ?? null;
      const baseNote = result.already_linked
        ? "This workspace was already linked to your account."
        : "Workspace linked to your account.";
      const magicNote = magicLink
        ? ` A one-click sign-in link is in urls.claim_magic_link — opens a browser session as the workspace owner, expires in 15 min, single-use.`
        : " No magic link minted (user has no email on file); sign in the normal way at urls.admin_dashboard.";
      return {
        ok: true,
        ...result,
        note: `${baseNote}${magicNote} Your MCP bearer token continues to work — no rotation needed.`,
      };
    },
  },
  {
    name: "send_welcome_email",
    description:
      "Email the active workspace's four key URLs (landing, booking, intake, admin dashboard) to a user. Use this AFTER create_workspace, only when the user has explicitly given their email — never auto-send. The admin URL is bearer-token-scoped and expires in 7 days. " +
      "If the workspace has an AI chatbot (create_full_workspace's response includes chatbot_embed_snippet + chatbot_agent_id), pass chatbot_url + chatbot_embed_snippet + chatbot_status so the welcome email also shows the chatbot card with its embed snippet — operators otherwise never learn the workspace shipped with a chatbot. All three are optional; omit them to send the classic 4-URL email. " +
      "Example: send_welcome_email({ email: 'alice@example.com', name: 'Alice', chatbot_url: 'https://acme.app.seldonframe.com/chat', chatbot_embed_snippet: '<script src=\"...\" async></script>', chatbot_status: 'test' }).",
    inputSchema: obj(
      {
        email: str("Recipient email address."),
        name: str("Optional recipient name (used in the greeting)."),
        workspace_id: str("Optional workspace override. Defaults to active workspace."),
        chatbot_url: str("Optional. Public chatbot URL — include when the workspace has an AI chatbot (see chatbot_embed_snippet + chatbot_agent_id from create_full_workspace's response)."),
        chatbot_embed_snippet: str("Optional. The <script> embed snippet for the chatbot (from create_full_workspace's chatbot_embed_snippet). Required alongside chatbot_url/chatbot_status to render the chatbot card."),
        chatbot_status: str("Optional. \"live\" or \"test\" — reflects the chatbot's current publish status. Defaults the card copy accordingly."),
      },
      ["email"],
    ),
    handler: async (a) => {
      const workspaceId = a.workspace_id ?? getDefaultWorkspace();
      if (!workspaceId) {
        throw new Error(
          "No workspace selected. Run create_workspace({ name: '…' }) first, or pass workspace_id.",
        );
      }
      const bearer = getWorkspaceBearer(workspaceId);
      if (!bearer) {
        throw new Error(
          `No local bearer token for workspace ${workspaceId}. This device did not create it. Re-run create_workspace or switch to the device that did.`,
        );
      }

      const snapshot = await api(
        "GET",
        `/workspace/${encodeURIComponent(workspaceId)}/snapshot`,
        { workspace_id: workspaceId },
      );
      const publicUrls = snapshot?.public_urls ?? {};
      if (!publicUrls.home || !publicUrls.book || !publicUrls.intake) {
        throw new Error(
          "Snapshot did not return public_urls (home/book/intake). Re-check the workspace.",
        );
      }

      // Construct the bearer-scoped admin URL from the API base.
      // API_INFO.base is `<host>/api/v1` — strip that suffix to get the app host.
      const appHost = API_INFO.base.replace(/\/api\/v1\/?$/, "");
      const adminUrl = `${appHost}/admin/${encodeURIComponent(workspaceId)}?token=${encodeURIComponent(bearer)}`;

      // Optional chatbot passthrough — only include the card when the
      // caller supplied enough to render it (url + embed_snippet).
      // Omitted entirely otherwise so this stays backward-compatible.
      const chatbot =
        a.chatbot_url && a.chatbot_embed_snippet
          ? {
              url: a.chatbot_url,
              embed_snippet: a.chatbot_embed_snippet,
              status: a.chatbot_status === "live" ? "live" : "test",
            }
          : undefined;

      await api("POST", "/email/send-welcome", {
        body: {
          email: a.email,
          name: a.name ?? null,
          workspace: {
            landing_url: publicUrls.home,
            booking_url: publicUrls.book,
            intake_url: publicUrls.intake,
            admin_url: adminUrl,
            ...(chatbot ? { chatbot } : {}),
          },
        },
        workspace_id: workspaceId,
      });

      return {
        ok: true,
        message: `Welcome email sent to ${a.email}`,
      };
    },
  },
  {
    name: "collect_operator_email",
    description:
      "MANDATORY post-workspace step. Send the operator's welcome email + record them as a lead in SeldonFrame's CRM. " +
      "EVERY workspace creation flow MUST end with this call — it is the only thing that triggers the welcome email (with the live URLs), creates their account so the admin login keeps working past the 7-day token, captures them in our pipeline so we can follow up, and lets Stripe pre-fill their email on upgrade. Skipping it leaves the operator with a one-shot URL and no way to recover access. " +
      "Flow: after create_workspace returns, ask the user verbatim 'What email should I use for your account? This is where you'll get your login link and any notifications.' Then call this tool with whatever email they give you. " +
      "If you'd rather use the wrapper, call `finalize_workspace({ email })` instead — same effect plus a formatted summary at the end. " +
      "Example: collect_operator_email({ email: 'max@precisionplumbing.com', name: 'Max' })",
    inputSchema: obj(
      {
        email: str("Operator email — used as the welcome email recipient AND as the unique key for the SeldonFrame CRM lead."),
        name: str("Optional operator name (used in the email greeting and on the CRM lead)."),
        workspace_id: str("Optional workspace override. Defaults to the workspace just created."),
      },
      ["email"],
    ),
    handler: async (a) => {
      const workspaceId = a.workspace_id ?? getDefaultWorkspace();
      if (!workspaceId) {
        throw new Error(
          "No workspace selected. Run create_workspace({ name: '…' }) first, or pass workspace_id.",
        );
      }
      const bearer = getWorkspaceBearer(workspaceId);
      if (!bearer) {
        throw new Error(
          `No local bearer token for workspace ${workspaceId}. This device did not create it. Re-run create_workspace or switch to the device that did.`,
        );
      }

      // Step 1: pull the workspace snapshot so we have the public URLs
      // for the welcome email.
      const snapshot = await api(
        "GET",
        `/workspace/${encodeURIComponent(workspaceId)}/snapshot`,
        { workspace_id: workspaceId },
      );
      const publicUrls = snapshot?.public_urls ?? {};
      const slug = snapshot?.workspace?.slug ?? null;
      if (!publicUrls.home || !publicUrls.book || !publicUrls.intake) {
        throw new Error(
          "Snapshot did not return public_urls (home/book/intake). Re-check the workspace.",
        );
      }
      const appHost = API_INFO.base.replace(/\/api\/v1\/?$/, "");
      const adminUrl = `${appHost}/admin/${encodeURIComponent(workspaceId)}?token=${encodeURIComponent(bearer)}`;

      // Step 2: send the welcome email. Failures here are surfaced
      // (operator told us their email, we owe them the email) but
      // don't block the lead-capture step below.
      let emailSent = false;
      let emailError = null;
      try {
        await api("POST", "/email/send-welcome", {
          body: {
            email: a.email,
            name: a.name ?? null,
            workspace: {
              landing_url: publicUrls.home,
              booking_url: publicUrls.book,
              intake_url: publicUrls.intake,
              admin_url: adminUrl,
            },
          },
          workspace_id: workspaceId,
        });
        emailSent = true;
      } catch (err) {
        emailError = err?.message ?? String(err);
      }

      // Step 3: record the operator as a lead in SeldonFrame's own
      // CRM workspace. Anonymous endpoint — no bearer required, ops
      // workspace ID is server-side env only. Soft-failure: if the
      // ops workspace isn't configured we still return ok.
      let leadRecorded = false;
      let leadId = null;
      let leadError = null;
      try {
        const leadResp = await api("POST", "/leads/operator-signup", {
          body: {
            email: a.email,
            name: a.name ?? null,
            source_workspace_id: workspaceId,
            source_workspace_slug: slug,
            source: "mcp-onboarding",
          },
          allow_anonymous: true,
        });
        leadRecorded = Boolean(leadResp?.recorded);
        leadId = leadResp?.lead_id ?? null;
      } catch (err) {
        leadError = err?.message ?? String(err);
      }

      return {
        ok: emailSent || leadRecorded,
        email_sent: emailSent,
        email_error: emailError,
        lead_recorded: leadRecorded,
        lead_id: leadId,
        lead_error: leadError,
        message: emailSent
          ? `Welcome email sent to ${a.email}. Check your inbox — the admin URL is in there too.`
          : `Could not send welcome email${emailError ? `: ${emailError}` : ""}. Lead ${leadRecorded ? "recorded" : "not recorded"}.`,
        next: [
          "configure_booking({ title, duration_minutes, description }) — tune the booking page if you collected business hours",
          "customize_intake_form({ ... }) — match your intake to the workspace's lead-qualification questions",
          "install_vertical_pack({ pack: '<industry>' }) — add domain-specific objects, fields, and views",
        ],
      };
    },
  },
  {
    name: "finalize_workspace",
    description:
      "ONE-CALL CLOSING WRAPPER for the workspace creation flow. Bundles email collection (welcome email + lead capture via collect_operator_email) AND produces the final operator-facing summary (live URLs, what's configured, admin link). " +
      "Call this as the LAST step of every workspace creation. After create_workspace returns, ask the user 'What email should I use for your account? This is where you'll get your login link and any notifications.' Then call this tool with the email they give you. Returns a `summary` string Claude Code should paraphrase verbatim to the operator. " +
      "Use this instead of calling collect_operator_email directly when you want a single tool call to close the loop. Skipping this is the same as skipping email collection — leaves the operator with a one-shot URL and no recovery path. " +
      "Example: finalize_workspace({ email: 'max@precisionplumbing.com', name: 'Max' }). " +
      "The summary is agency-voice: addresses the operator AS an agency delivering for their SMB client, not as the workspace owner. When relaying to the operator, preserve the 'your client' framing throughout — don't rewrite to 'your workspace'.",
    inputSchema: obj(
      {
        email: str("Operator email — used as the welcome email recipient AND as the unique key for the SeldonFrame CRM lead."),
        name: str("Optional operator name (used in the email greeting and on the CRM lead)."),
        workspace_id: str("Optional workspace override. Defaults to the workspace just created."),
      },
      ["email"],
    ),
    handler: async (a) => {
      const workspaceId = a.workspace_id ?? getDefaultWorkspace();
      if (!workspaceId) {
        throw new Error(
          "No workspace selected. Run create_workspace({ name: '…' }) first, or pass workspace_id.",
        );
      }
      const bearer = getWorkspaceBearer(workspaceId);
      if (!bearer) {
        throw new Error(
          `No local bearer token for workspace ${workspaceId}. This device did not create it. Re-run create_workspace or switch to the device that did.`,
        );
      }

      // Snapshot for the URLs + workspace name + personality details
      // we'll surface in the closing summary.
      const snapshot = await api(
        "GET",
        `/workspace/${encodeURIComponent(workspaceId)}/snapshot`,
        { workspace_id: workspaceId },
      );
      const publicUrls = snapshot?.public_urls ?? {};
      const slug = snapshot?.workspace?.slug ?? null;
      const wsName = snapshot?.workspace?.name ?? "Your workspace";
      const chatbot = snapshot?.chatbot ?? null;
      const tier = snapshot?.tier ?? null;
      if (!publicUrls.home || !publicUrls.book || !publicUrls.intake) {
        throw new Error(
          "Snapshot did not return public_urls (home/book/intake). Re-check the workspace.",
        );
      }
      const appHost = API_INFO.base.replace(/\/api\/v1\/?$/, "");
      const adminUrl = `${appHost}/admin/${encodeURIComponent(workspaceId)}?token=${encodeURIComponent(bearer)}`;

      // Step 1: welcome email (Resend).
      let emailSent = false;
      let emailError = null;
      try {
        await api("POST", "/email/send-welcome", {
          body: {
            email: a.email,
            name: a.name ?? null,
            workspace: {
              landing_url: publicUrls.home,
              booking_url: publicUrls.book,
              intake_url: publicUrls.intake,
              admin_url: adminUrl,
            },
          },
          workspace_id: workspaceId,
        });
        emailSent = true;
      } catch (err) {
        emailError = err?.message ?? String(err);
      }

      // Step 2: lead capture in SeldonFrame's ops workspace.
      let leadRecorded = false;
      let leadId = null;
      let leadError = null;
      try {
        const leadResp = await api("POST", "/leads/operator-signup", {
          body: {
            email: a.email,
            name: a.name ?? null,
            source_workspace_id: workspaceId,
            source_workspace_slug: slug,
            source: "mcp-onboarding",
          },
          allow_anonymous: true,
        });
        leadRecorded = Boolean(leadResp?.recorded);
        leadId = leadResp?.lead_id ?? null;
      } catch (err) {
        leadError = err?.message ?? String(err);
      }

      // Step 3: closing summary — formatted exactly the way Claude Code
      // should paraphrase to the operator. Personality + pipeline are
      // surfaced in the response payload (not the summary text).
      const personality =
        snapshot?.workspace?.settings?.crmPersonality ?? null;
      const personalityLabel =
        personality?.vertical
          ? personality.vertical.charAt(0).toUpperCase() + personality.vertical.slice(1)
          : null;
      const pipelineStages = personality?.pipeline?.stages ?? [];

      // v1.55.0 — Ops-stack-only workspace creation. The summary is
      // built by buildFinalizeSummary in ./finalize-summary.js; we
      // pass the snapshot + duration + archetype here.
      const aestheticArchetype = snapshot?.theme?.aestheticArchetype ?? null;
      const summary = buildFinalizeSummary({
        snapshot,
        durationSec: 0, // smoke test reports actual duration via Vercel logs, not the summary text
        aestheticArchetype,
        adminUrl, // token-bearing (same variable the welcome-email body uses below) —
        // without this the summary's Admin line falls back to the snapshot's
        // tokenless ops_stack.admin_url and 404s at /admin/invalid when clicked.
      });

      return {
        ok: emailSent || leadRecorded,
        summary,
        workspace: { id: workspaceId, name: wsName, slug },
        website_url: publicUrls.home,
        booking_url: publicUrls.book,
        intake_url: publicUrls.intake,
        admin_url: adminUrl,
        // NEW (2026-05-15): chatbot + tier surfacing
        chatbot_agent_id: chatbot?.agent_id ?? null,
        chatbot_embed_url: chatbot?.embed_url ?? null,
        chatbot_embed_snippet: chatbot?.embed_snippet ?? null,
        chatbot_status: chatbot?.status ?? null,
        client_portal_url: tier?.client_portal_url ?? null,
        client_portal_status: tier?.client_portal_status ?? null,
        current_tier: tier?.current_tier ?? "free",
        tier_features: tier?.tier_features ?? null,
        // Existing email/lead fields
        email_sent: emailSent,
        email_error: emailError,
        lead_recorded: leadRecorded,
        lead_id: leadId,
        lead_error: leadError,
        personality: personalityLabel,
        pipeline_stages: pipelineStages.map((s) => s?.name).filter(Boolean),
        // v1.55.0 — Ops-stack-first next-step ladder. Surfaces the
        // chatbot-paste workflow + the 7 ready automations + the
        // landing-page nudge so Claude Code can pick from a tight
        // curated list rather than improvise tool calls.
        next_steps_available: [
          {
            id: "deploy_chatbot_embed",
            label: "Paste chatbot embed on client's existing site",
            action: "user_action",
            payload: {
              snippet: chatbot?.embed_snippet ?? null,
              target: snapshot?.workspace?.settings?.source_url ?? null,
            },
          },
          {
            id: "promote_chatbot_to_live",
            label: "Promote chatbot from TEST to LIVE (when ready for production)",
            action: "publish_agent",
            payload: { agent_id: chatbot?.agent_id ?? null },
          },
          {
            id: "activate_automation",
            label: "Activate one of the 7 ready automations",
            action: "open_dashboard",
            payload: { url: snapshot?.ops_stack?.automations_url ?? null },
          },
          {
            id: "configure_integration",
            label: "Configure Twilio / Resend / Stripe for SMS / email / payments",
            action: "claude_assisted",
            payload: { available_providers: ["twilio", "resend", "stripe"] },
          },
          {
            id: "build_landing_page",
            label: "Build a landing page (uses landing-page-creation skill)",
            action: "claude_assisted",
            payload: {
              skill: "landing-page-creation",
              archetype: snapshot?.theme?.aestheticArchetype ?? null,
            },
          },
          {
            id: "customize_chatbot_faq",
            label: "Refine the chatbot's FAQ from source site content",
            action: "claude_assisted",
            payload: { agent_id: chatbot?.agent_id ?? null },
          },
        ],
      };
    },
  },
  {
    name: "revoke_bearer",
    description:
      "Revoke workspace bearer tokens. Useful if a device token has leaked or if a builder wants to rotate. Modes (pick exactly one): `{}` revokes ALL tokens except the current device's (safe default — other devices kicked off, this device keeps working); `{ token_id }` revokes a specific token by its UUID; `{ all: true }` revokes every token including the current one — requires SELDONFRAME_API_KEY because it locks this device out. After revoking the current token the MCP clears the local entry from ~/.seldonframe/device.json.",
    inputSchema: obj({
      workspace_id: str("Optional workspace override. Defaults to active workspace."),
      token_id: str("UUID of a specific token to revoke (from api_keys.id)."),
      all: { type: "boolean", description: "Revoke ALL tokens including caller. Requires SELDONFRAME_API_KEY." },
    }),
    handler: async (a) => {
      const workspaceId = a.workspace_id ?? getDefaultWorkspace();
      if (!workspaceId) {
        throw new Error(
          "No workspace to revoke tokens for. Run create_workspace first, or pass workspace_id."
        );
      }
      const bearer = getWorkspaceBearer(workspaceId);
      const apiKey = getApiKey();
      if (!bearer && !apiKey) {
        throw new Error(
          `No local bearer for workspace ${workspaceId} and no SELDONFRAME_API_KEY. Cannot authenticate.`
        );
      }
      if (a.all === true && !apiKey) {
        throw new Error(
          "Revoking ALL tokens (including this device's) requires SELDONFRAME_API_KEY — bearer identity can't lock itself out. Either omit `all` to use all_except_current, or set SELDONFRAME_API_KEY."
        );
      }

      let body;
      if (a.token_id) {
        body = { token_id: a.token_id };
      } else if (a.all === true) {
        body = { all: true };
      } else {
        body = { all_except_current: true };
      }

      // Prefer workspace bearer when present; fall back to api_key auth otherwise.
      const useBearer = Boolean(bearer);
      const result = await api(
        "POST",
        `/workspace/${encodeURIComponent(workspaceId)}/revoke-bearer`,
        {
          body,
          workspace_id: workspaceId,
          force_workspace_bearer: useBearer,
          extra_headers: apiKey && !useBearer ? { "x-seldon-api-key": apiKey } : {},
        },
      );

      // If the caller's own token got revoked, clear it from device.json so
      // future tool calls don't authenticate with a dead token.
      if (useBearer && result?.caller_still_valid === false) {
        forgetWorkspace(workspaceId);
      }

      return {
        ok: true,
        ...result,
        device_cleared: useBearer && result?.caller_still_valid === false,
      };
    },
  },
  {
    name: "update_landing_content",
    description:
      "Rewrite the workspace's public landing page hero — headline, subhead, and primary CTA label. C3.4 made this blueprint-aware: the operator's edit lands without losing any of the renderer's visual polish (typography, layered-shadow buttons, animations, etc.). Use this for the most common copy edits; for granular per-section / per-item edits use update_landing_section.",
    inputSchema: obj(
      {
        headline: str("Main hero heading. Keep short; 1 line."),
        subhead: str("One-sentence supporting line under the headline."),
        cta_label: str("Primary call-to-action button text, e.g. 'Book a call'."),
        workspace_id: str("Optional workspace override."),
      },
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/landing/update", {
        body: {
          headline: a.headline,
          subhead: a.subhead,
          cta_label: a.cta_label,
          workspace_id: ws,
        },
        workspace_id: ws,
      });
    },
  },
  {
    name: "update_landing_section",
    description:
      "Granular per-field landing edit — change any single slot in any section of the blueprint-rendered landing page. Use when update_landing_content's three fields aren't enough. Section types: emergency-strip, hero, trust-strip, services-grid, about, mid-cta, testimonials, service-area, faq, footer. Field is a dot-segmented path on that section (e.g. 'headline', 'subhead', 'items.0.title', 'items.2.answer', 'showHours'). Value is the new value (string for copy, boolean for flags, etc.).",
    inputSchema: obj(
      {
        section: {
          type: "string",
          enum: [
            "emergency-strip",
            "hero",
            "trust-strip",
            "services-grid",
            "about",
            "mid-cta",
            "testimonials",
            "service-area",
            "faq",
            "footer",
          ],
        },
        field: str(
          "Dot-segmented field path on the section. Examples: 'headline', 'subhead', 'items.0.title', 'items.2.answer', 'showHours'."
        ),
        value: {
          description:
            "New value for the field. String for copy, number for ratings, boolean for flags, object/array for richer slots.",
        },
        workspace_id: str("Optional workspace override."),
      },
      ["section", "field", "value"],
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/landing/section/update", {
        body: {
          section: a.section,
          field: a.field,
          value: a.value,
          workspace_id: ws,
        },
        workspace_id: ws,
      });
    },
  },
  // Note: `customize_intake_form` used to live here pointing at POST
  // /api/v1/intake/customize. Phase 2.d unified it under update_form; the
  // alias that preserves the old name now lives in the Phase 2.d block at
  // the bottom of this file. The POST /intake/customize endpoint still
  // exists server-side for backwards compatibility until Phase 11 cleanup.
  // Note: `configure_booking` used to live here pointing at POST
  // /api/v1/booking/configure. Phase 2.c unified it under
  // update_appointment_type; the alias that preserves the old name now
  // lives at the bottom of this file (end of Phase 2.c block). The POST
  // /booking/configure endpoint still exists server-side for backwards
  // compatibility until Phase 11 cleanup.
  {
    name: "update_theme",
    description:
      "Change workspace theme: mode (dark|light), primary_color (#hex), accent_color (#hex), font_family. Any subset. Available fonts: Inter, DM Sans, Playfair Display, Space Grotesk, Lora, Outfit.",
    inputSchema: obj(
      {
        mode: { type: "string", enum: ["dark", "light"] },
        primary_color: str("Hex color like '#14b8a6'."),
        accent_color: str("Hex color."),
        font_family: {
          type: "string",
          enum: ["Inter", "DM Sans", "Playfair Display", "Space Grotesk", "Lora", "Outfit"],
        },
        workspace_id: str("Optional workspace override."),
      },
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/theme/update", {
        body: {
          mode: a.mode,
          primary_color: a.primary_color,
          accent_color: a.accent_color,
          font_family: a.font_family,
          workspace_id: ws,
        },
        workspace_id: ws,
      });
    },
  },
  // v1.33.1 — Bring-your-own-design-system path #1.
  //
  // Accepts the FULL CONTENT of a DESIGN.md file (the Google Labs
  // format: YAML front matter for tokens + Markdown for rationale).
  // Server parses it, maps tokens to OrgTheme, applies. Tokens that
  // don't have a 1:1 OrgTheme equivalent (spacing scales, custom
  // shadows, etc.) come back in `unmapped` so Claude Code can decide
  // whether to surface them via update_landing_page or just inform
  // the operator.
  //
  // USE-WHEN the operator has a DESIGN.md committed to their workspace
  // or available locally and says "apply this design system" or
  // "use this brand kit" or "match my company's design tokens".
  //
  // Example flow inside Claude Code:
  //   const md = await readFile("./DESIGN.md", "utf8");
  //   apply_design_md({ design_md_content: md });
  //
  // The MCP-client process reads the file (operator's machine has the
  // tokens; we don't need a path-on-server). Server only sees the
  // content string. 256KB cap server-side.
  {
    name: "apply_design_md",
    description:
      "Apply a DESIGN.md file (the Google Labs format: YAML front matter for tokens + Markdown for rationale) to the workspace theme. Maps tokens.colors.primary, tokens.colors.accent, tokens.mode, and tokens.typography.body to OrgTheme fields. Unmapped tokens (spacing, custom shadows, etc.) are returned so Claude Code can decide whether to apply them via update_landing_page or surface to the operator. " +
      "USE-WHEN the operator says: 'apply my DESIGN.md', 'use this brand kit', 'match my company's design tokens', 'import my design system', or 'theme my workspace from this file'. " +
      "Example: apply_design_md({ design_md_content: '<full file content as string>' })",
    inputSchema: obj(
      {
        design_md_content: str(
          "Full content of the DESIGN.md file as a string. The MCP client reads the file in the operator's process (e.g. via fs.readFile in Claude Code) and passes the content here. Server caps at 256KB."
        ),
        workspace_id: str("Optional workspace override."),
      },
      ["design_md_content"]
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/theme/apply-design-md", {
        body: {
          design_md_content: a.design_md_content,
          workspace_id: ws,
        },
        workspace_id: ws,
      });
    },
  },
  // v1.34.0 — Natural-language motion intensity control.
  //
  // Sets the workspace's motion preset. Defaults: every new workspace
  // ships at "balanced" (sections fade up, grids stagger, CTAs lift on
  // hover). Operators with strong opinions tune up or down via a single
  // natural-language prompt: "make my pages feel more premium" → editorial;
  // "respect prefers-reduced-motion across my site" → minimal.
  //
  // PRESETS:
  //   "minimal":   no motion. Accessibility-first.
  //   "subtle":    fade-up reveals only. Quiet, professional.
  //   "balanced":  reveals + stagger + hover-lift. The default.
  //   "editorial": full effects — counters, magnetic CTAs, text-reveal.
  //
  // The preset is stored on OrgTheme.motionPreset. Renderers progressively
  // gate primitives on it; today the "balanced" set is applied universally
  // and the preset is read by Claude Code as a hint when generating new
  // content (e.g. don't add Counter to a workspace that picked "subtle").
  //
  // USE-WHEN the operator says: "make my site feel more premium",
  // "tone down the animation", "make it less flashy", "I want my pages
  // to feel editorial", "respect reduced motion", "no animation please",
  // or directly references one of the preset names.
  {
    name: "apply_motion_preset",
    description:
      "Set the workspace's motion intensity preset. Stored on OrgTheme.motionPreset and read by the renderer + Claude Code as a hint for content generation. Presets: 'minimal' (no motion, accessibility-first), 'subtle' (fade-up reveals only), 'balanced' (reveals + stagger + hover-lift — the default), 'editorial' (full effects: counters, magnetic CTAs, text-reveal). " +
      "USE-WHEN the operator says: 'make my pages feel more premium', 'tone down the animation', 'I want it editorial', 'respect reduced motion', 'no animation please', or directly references a preset name. " +
      "Example: apply_motion_preset({ preset: 'editorial' })",
    inputSchema: obj(
      {
        preset: {
          type: "string",
          enum: ["minimal", "subtle", "balanced", "editorial"],
          description:
            "The motion intensity preset to apply. 'minimal'=no motion (accessibility-first). 'subtle'=fade-up reveals only. 'balanced'=reveals + stagger + hover-lift (default). 'editorial'=full effects (counters, magnetic CTAs, text-reveal).",
        },
        workspace_id: str("Optional workspace override."),
      },
      ["preset"]
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/theme/motion-preset", {
        body: {
          preset: a.preset,
          workspace_id: ws,
        },
        workspace_id: ws,
      });
    },
  },
  // v1.33.1 — Bring-your-own-design-system path #2.
  //
  // Accepts a Claude Design "handoff bundle" — the artifact Anthropic's
  // Claude Design produces when designs are ready for code (HTML or
  // React components + design tokens + asset URLs). Server:
  //   1. Applies the bundle's tokens (if any) to OrgTheme — same
  //      mapping as apply_design_md.
  //   2. Validates each component (name, surface, source size, props
  //      schema) and returns a structured manifest with truncated
  //      source previews + per-component "next_step" instructions.
  //   3. Does NOT auto-execute generated React on live customer pages.
  //      Claude Code reviews each component's source and chooses
  //      whether to wire it via update_landing_page / add_custom_block
  //      based on its eval-readiness. Customer-facing surfaces still
  //      run through the eval gate before publish — Claude Design
  //      output isn't trusted to bypass that.
  //
  // USE-WHEN the operator says "import this Claude Design handoff",
  // "wire up these components", "I just exported a design from Claude
  // Design", or "apply this design bundle to my workspace".
  //
  // Bundle schema (defensive read of the most likely format —
  // Anthropic hasn't published a formal spec yet):
  //   {
  //     meta?: { project_name?, generated_at?, target?: "react"|"html" },
  //     tokens?: { colors?, typography?, mode? },
  //     components: [
  //       { name, surface?, react_source? OR html_source?,
  //         props_schema?, deps? }
  //     ],
  //     assets?: [{ name, url, type }]
  //   }
  //
  // Limits: 1MB total bundle, 64KB per component source, 40 components
  // per import. Larger bundles should be split.
  {
    name: "import_claude_design_handoff",
    description:
      "Validate a Claude Design handoff bundle (the artifact Claude Design produces when designs are ready for code), apply its embedded design tokens to the workspace theme, and return a structured manifest of the components with per-component next-step instructions for wiring them into pages. Does NOT auto-execute generated React on live pages — components route through human/eval review (the same gate that protects published agents) before customer-facing surfaces ship. " +
      "USE-WHEN the operator says: 'import this Claude Design handoff', 'wire up these components', 'I just exported a design from Claude Design', or 'apply this design bundle to my workspace'. " +
      "Example: import_claude_design_handoff({ bundle: { meta: { project_name: 'Acme HVAC' }, tokens: { colors: { primary: '#0e7490' } }, components: [{ name: 'TrustStrip', surface: 'landing', react_source: '<TSX content>' }] } })",
    inputSchema: obj(
      {
        bundle: {
          type: "object",
          description:
            "The handoff bundle as a JSON object. Required fields: bundle.components (array of {name, react_source OR html_source}). Optional: bundle.meta, bundle.tokens (DESIGN.md-shape), bundle.assets. Server caps at 1MB total, 64KB per component, 40 components per import.",
          additionalProperties: true,
        },
        workspace_id: str("Optional workspace override."),
      },
      ["bundle"]
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/handoff/import", {
        body: {
          bundle: a.bundle,
          workspace_id: ws,
        },
        workspace_id: ws,
      });
    },
  },
  {
    name: "list_automations",
    description: "List automations configured in the active (or specified) workspace.",
    inputSchema: obj({ workspace_id: str("Optional workspace override.") }),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("GET", `/automations?workspace_id=${encodeURIComponent(ws)}`, { workspace_id: ws });
    },
  },
  // May 2, 2026 (v1.1.2) — `install_vertical_pack` DELETED entirely.
  // The /packs/install endpoint doesn't exist, so this tool 404'd
  // every time Claude Code reached for it. Industry-specific
  // configuration (terminology, pipeline stages, intake fields,
  // booking duration) is now driven by the CRMPersonality the
  // server picks during create_full_workspace from the operator's
  // services + business_description — no separate install step
  // needed.
  {
    name: "install_caldiy_booking",
    description:
      "Install the booking page (event types, availability, scheduled bookings). Example: install_caldiy_booking({})",
    inputSchema: obj({
      workspace_id: str("Optional workspace override."),
      config: { type: "object", description: "Optional booking-page configuration overrides." },
    }),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/packs/caldiy-booking/install", {
        body: { workspace_id: ws, config: a.config },
        workspace_id: ws,
      });
    },
  },
  {
    name: "install_formbricks_intake",
    description:
      "Install an intake form (questions, conditional logic, automatic CRM sync). Example: install_formbricks_intake({})",
    inputSchema: obj({
      workspace_id: str("Optional workspace override."),
      form_id: str("Optional existing intake-form id to bind."),
    }),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/packs/formbricks-intake/install", {
        body: { workspace_id: ws, form_id: a.form_id },
        workspace_id: ws,
      });
    },
  },
  {
    name: "get_workspace_snapshot",
    description:
      "Return a structured read-only snapshot of workspace state: workspace metadata, Soul (if submitted), theme, enabled blocks with configs, entity counts (contacts/bookings/intake forms/submissions), recent Seldon It events, and public URLs. YOU reason over this snapshot to decide what to do next, then call the appropriate typed tools (update_landing_content, configure_booking, customize_intake_form, update_theme, install_*). Zero server-side LLM cost.",
    inputSchema: obj({
      workspace_id: str("Optional workspace override."),
    }),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("GET", `/workspace/${encodeURIComponent(ws)}/snapshot`, {
        workspace_id: ws,
      });
    },
  },
  {
    name: "fetch_source_for_soul",
    description:
      "Fetch a URL and return normalized text (headings + body, up to 256KB). Use this to gather raw content from the operator's existing website; then extract a structured business profile and save it with submit_soul. Zero LLM cost to SeldonFrame — extraction runs in this session. " +
      "v1.59.2 — only public http(s) URLs are fetched: the MCP server rejects localhost / private-network / link-local targets (and any redirect that lands on one) before making the request. Use this for the operator's real, public-facing website only.",
    inputSchema: obj(
      {
        url: str(
          "Absolute URL to fetch. Must be a public http(s) URL — localhost, LAN, and other private-network addresses are rejected.",
        ),
      },
      ["url"],
    ),
    handler: async ({ url }) => {
      const { html, truncated, status, final_url } = await fetchText(url);
      const text = htmlToText(html);
      return {
        ok: true,
        url,
        final_url,
        status,
        bytes: text.length,
        truncated,
        text,
        next: [
          "Extract a business profile: { mission, audience, tone, offerings[], differentiators[], faqs[] }",
          "submit_soul({ soul: <extracted> })",
        ],
      };
    },
  },
  {
    name: "submit_soul",
    description:
      "Save a business profile to the active workspace. The profile drives the landing page, intake form copy, and AI-agent context. Call this after fetch_source_for_soul or after gathering details from the user. Triggers a re-render of the public landing page so changes are visible immediately.",
    inputSchema: obj(
      {
        soul: {
          type: "object",
          description:
            "Business profile. Expected keys: business_name, tagline, soul_description, phone, email, address, offerings, faqs, testimonials. Additional keys allowed — they're preserved for future use.",
        },
        workspace_id: str("Optional workspace override."),
      },
      ["soul"],
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/soul/submit", {
        body: { workspace_id: ws, soul: a.soul },
        workspace_id: ws,
      });
    },
  },
  {
    name: "connect_custom_domain",
    description:
      "Connect + verify a custom domain. Pro capability — requires SELDONFRAME_API_KEY. Example: connect_custom_domain({ domain: 'app.mysite.com' })",
    inputSchema: obj(
      {
        domain: str("Fully qualified domain, e.g. client.example.com."),
        workspace_id: str("Optional workspace override."),
      },
      ["domain"],
    ),
    handler: async (a) => {
      if (!hasApiKey()) {
        throw new Error(
          "Custom domains are a Pro capability. Get a key at https://app.seldonframe.com/settings/api and `export SELDONFRAME_API_KEY=sk-…`.",
        );
      }
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/domains/connect", {
        body: { domain: a.domain, workspace_id: ws },
        workspace_id: ws,
      });
    },
  },
  {
    name: "export_agent",
    description: "Export the current workspace as a portable .agent/ bundle.",
    inputSchema: obj({ workspace_id: str("Optional workspace override.") }),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/export/agent", { body: { workspace_id: ws }, workspace_id: ws });
    },
  },
  {
    name: "store_secret",
    description:
      "Store a workspace-scoped secret (encrypted at rest). Example: store_secret({ key: 'STRIPE_API_KEY', value: 'sk_…' })",
    inputSchema: obj(
      {
        key: str("Secret name, e.g. 'STRIPE_API_KEY'."),
        value: str("Secret plaintext value."),
        workspace_id: str("Optional workspace override."),
      },
      ["key", "value"],
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/secrets", {
        body: { key: a.key, value: a.value, workspace_id: ws },
        workspace_id: ws,
      });
    },
  },
  {
    name: "list_secrets",
    description: "List secret metadata (names, timestamps) without exposing plaintext.",
    inputSchema: obj({ workspace_id: str("Optional workspace override.") }),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("GET", `/secrets?workspace_id=${encodeURIComponent(ws)}`, { workspace_id: ws });
    },
  },
  {
    name: "rotate_secret",
    description: "Rotate or delete a workspace secret. Omit new_value to delete.",
    inputSchema: obj(
      {
        key: str("Secret name to rotate."),
        new_value: str("New plaintext value. Omit to delete the secret."),
        workspace_id: str("Optional workspace override."),
      },
      ["key"],
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      if (a.new_value === undefined) {
        return api("DELETE", `/secrets/${encodeURIComponent(a.key)}`, {
          body: { workspace_id: ws },
          workspace_id: ws,
        });
      }
      return api("PUT", `/secrets/${encodeURIComponent(a.key)}`, {
        body: { value: a.new_value, workspace_id: ws },
        workspace_id: ws,
      });
    },
  },
  // ════════════════════════════════════════════════════════════════════
  // CRM tools — Phase 2.b per tasks/mcp-gap-audit.md
  // Thin wrappers over v1 endpoints at /api/v1/{contacts,deals,activities}.
  // Naming convention locked in the audit: list_/get_/create_/update_/
  // delete_ for CRUD; verb_noun for state changes (move_deal_stage).
  // ════════════════════════════════════════════════════════════════════

  {
    name: "list_contacts",
    description:
      "List contacts in the active workspace. Returns every contact the caller can read. Example: list_contacts({}).",
    inputSchema: obj({
      workspace_id: str("Optional. Falls back to the active workspace."),
    }),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("GET", "/contacts", { workspace_id: ws });
      return { ok: true, contacts: result.data ?? [], meta: result.meta ?? null };
    },
  },
  {
    name: "get_contact",
    description:
      "Fetch one contact by id. Example: get_contact({ contact_id: 'abc-...' }).",
    inputSchema: obj(
      {
        contact_id: str("UUID of the contact."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["contact_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("GET", `/contacts/${encodeURIComponent(args.contact_id)}`, {
        workspace_id: ws,
      });
      return { ok: true, contact: result.data ?? null };
    },
  },
  {
    name: "create_contact",
    description:
      "Create a new contact. Typical use: 'Add Jane Doe jane@acme.co as a lead'. Example: create_contact({ first_name: 'Jane', last_name: 'Doe', email: 'jane@acme.co', status: 'lead' }).",
    inputSchema: obj(
      {
        first_name: str("Required. Contact's first name."),
        last_name: str("Optional. Last name."),
        email: str("Optional but strongly recommended — unlocks form auto-linking and email sends."),
        status: str("Optional lifecycle stage (e.g., 'lead', 'prospect', 'customer'). Defaults to 'lead'."),
        source: str("Optional source tag (e.g., 'manual', 'intake-form', 'import')."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["first_name"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("POST", "/contacts", {
        body: {
          firstName: args.first_name,
          lastName: args.last_name ?? "",
          email: args.email ?? null,
          status: args.status ?? "lead",
          source: args.source ?? "mcp",
        },
        workspace_id: ws,
      });
      return { ok: true, contact: result.data };
    },
  },
  {
    name: "update_contact",
    description:
      "Update fields on an existing contact. Partial — omit fields you don't want to change. Example: update_contact({ contact_id: '...', status: 'customer' }).",
    inputSchema: obj(
      {
        contact_id: str("UUID of the contact to update."),
        first_name: str("Optional new first name."),
        last_name: str("Optional new last name."),
        email: str("Optional new email."),
        status: str("Optional new lifecycle stage."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["contact_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const patch = {};
      if (args.first_name !== undefined) patch.firstName = args.first_name;
      if (args.last_name !== undefined) patch.lastName = args.last_name;
      if (args.email !== undefined) patch.email = args.email;
      if (args.status !== undefined) patch.status = args.status;
      const result = await api("PATCH", `/contacts/${encodeURIComponent(args.contact_id)}`, {
        body: patch,
        workspace_id: ws,
      });
      return { ok: true, contact: result.data };
    },
  },
  {
    name: "delete_contact",
    description:
      "Delete a contact and all linked deals/activities (cascades via FK). Irreversible. Example: delete_contact({ contact_id: '...' }).",
    inputSchema: obj(
      {
        contact_id: str("UUID of the contact to delete."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["contact_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      await api("DELETE", `/contacts/${encodeURIComponent(args.contact_id)}`, {
        workspace_id: ws,
      });
      return { ok: true, deleted: args.contact_id };
    },
  },
  {
    name: "list_deals",
    description: "List deals in the active workspace. Example: list_deals({}).",
    inputSchema: obj({
      workspace_id: str("Optional. Falls back to the active workspace."),
    }),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("GET", "/deals", { workspace_id: ws });
      return { ok: true, deals: result.data ?? [] };
    },
  },
  {
    name: "get_deal",
    description: "Fetch one deal by id. Example: get_deal({ deal_id: '...' }).",
    inputSchema: obj(
      {
        deal_id: str("UUID of the deal."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["deal_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("GET", `/deals/${encodeURIComponent(args.deal_id)}`, {
        workspace_id: ws,
      });
      return { ok: true, deal: result.data ?? null };
    },
  },
  {
    name: "create_deal",
    description:
      "Create a new deal attached to a contact on the default pipeline. Typical use: 'Create a $5k deal for Jane Doe at the Discovery stage'. Example: create_deal({ contact_id: '...', title: 'Q2 retainer', value: 5000, stage: 'Discovery' }).",
    inputSchema: obj(
      {
        contact_id: str("UUID of the contact this deal belongs to."),
        title: str("Human-readable deal name."),
        value: { type: "number", description: "Optional deal value in workspace's default currency. Defaults to 0." },
        stage: str("Optional stage name (e.g. 'Discovery', 'Proposal'). Defaults to the first stage of the default pipeline."),
        probability: { type: "number", description: "Optional win probability 0-100. Defaults to 0." },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["contact_id", "title"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("POST", "/deals", {
        body: {
          contactId: args.contact_id,
          title: args.title,
          value: args.value ?? 0,
          stage: args.stage ?? "New",
          probability: args.probability ?? 0,
        },
        workspace_id: ws,
      });
      return { ok: true, deal: result.data };
    },
  },
  {
    name: "update_deal",
    description:
      "Update a deal. Partial — omit fields to keep them. For stage-only moves prefer move_deal_stage (clearer intent). Example: update_deal({ deal_id: '...', value: 7500 }).",
    inputSchema: obj(
      {
        deal_id: str("UUID of the deal."),
        title: str("Optional new title."),
        stage: str("Optional new stage."),
        value: { type: "number", description: "Optional new value." },
        probability: { type: "number", description: "Optional new probability (0-100)." },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["deal_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const patch = {};
      if (args.title !== undefined) patch.title = args.title;
      if (args.stage !== undefined) patch.stage = args.stage;
      if (args.value !== undefined) patch.value = args.value;
      if (args.probability !== undefined) patch.probability = args.probability;
      const result = await api("PATCH", `/deals/${encodeURIComponent(args.deal_id)}`, {
        body: patch,
        workspace_id: ws,
      });
      return { ok: true, deal: result.data };
    },
  },
  {
    name: "move_deal_stage",
    description:
      "Move a deal to a new stage. Same effect as dragging the card on the kanban. Example: move_deal_stage({ deal_id: '...', to_stage: 'Proposal' }).",
    inputSchema: obj(
      {
        deal_id: str("UUID of the deal."),
        to_stage: str("Destination stage name."),
        probability: { type: "number", description: "Optional. Stage probability (0-100) if the workspace's pipeline has one defined for this stage." },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["deal_id", "to_stage"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const body = { stage: args.to_stage };
      if (args.probability !== undefined) body.probability = args.probability;
      const result = await api("PATCH", `/deals/${encodeURIComponent(args.deal_id)}`, {
        body,
        workspace_id: ws,
      });
      return { ok: true, deal: result.data };
    },
  },
  {
    name: "delete_deal",
    description: "Delete a deal. Irreversible. Example: delete_deal({ deal_id: '...' }).",
    inputSchema: obj(
      {
        deal_id: str("UUID of the deal."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["deal_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      await api("DELETE", `/deals/${encodeURIComponent(args.deal_id)}`, {
        workspace_id: ws,
      });
      return { ok: true, deleted: args.deal_id };
    },
  },
  {
    name: "list_activities",
    description:
      "List activity log entries (tasks, notes, email sent, booking created, etc.) across the workspace. Example: list_activities({}).",
    inputSchema: obj({
      workspace_id: str("Optional. Falls back to the active workspace."),
    }),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("GET", "/activities", { workspace_id: ws });
      return { ok: true, activities: result.data ?? [] };
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Booking tools — Phase 2.c per tasks/mcp-gap-audit.md
  // CRUD for appointment types (template rows in the bookings table).
  // The v1 endpoints at /api/v1/booking/appointment-types[/<slug>] enforce
  // `status='template'` so tools here cannot accidentally touch real
  // scheduled bookings. Cancel / reschedule / list_bookings are deferred
  // until bookings block has real scheduled data to test against.
  // ════════════════════════════════════════════════════════════════════

  {
    name: "create_activity",
    description:
      "Append an activity-log entry to a contact (and/or deal). Use this instead of stuffing agent reminders into contacts.notes — notes gets overwritten on updates; activities are append-only. Valid types: task, note, email, sms, call, meeting, stage_change, payment, review_request, agent_action. Example: create_activity({ contact_id: 'ctc_...', type: 'agent_action', subject: 'Speed-to-Lead agent booked consult', body: 'Scheduled for 2026-05-01' })",
    inputSchema: obj(
      {
        contact_id: str("Contact to log against. Either contact_id or deal_id is required."),
        deal_id: str("Deal to log against. Either contact_id or deal_id is required."),
        type: str("task | note | email | sms | call | meeting | stage_change | payment | review_request | agent_action"),
        subject: str("One-line title (≤200 chars). Either subject or body is required."),
        body: str("Optional multi-line detail (≤4000 chars)."),
        scheduled_at: str("Optional ISO timestamp if the activity is planned for a future time (e.g., a task)."),
        completed_at: str("Optional ISO timestamp if logging a completed past action."),
        metadata: {
          type: "object",
          description: "Optional JSON metadata — e.g., { agentId: 'agt_...', confidence: 0.87 }",
        },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["type"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      return api("POST", "/activities", {
        body: {
          contact_id: args.contact_id ?? null,
          deal_id: args.deal_id ?? null,
          type: args.type,
          subject: args.subject ?? null,
          body: args.body ?? null,
          scheduled_at: args.scheduled_at ?? null,
          completed_at: args.completed_at ?? null,
          metadata: args.metadata ?? {},
        },
        workspace_id: ws,
      });
    },
  },
  {
    name: "list_bookings",
    description:
      "List scheduled bookings (not appointment-type templates — see list_appointment_types for those). Supports filtering by contact, status, and date range. Default sort: most-recent-first; if `from` is set, switches to earliest-upcoming-first for reminder flows. Example: list_bookings({ from: '2026-04-22T00:00:00Z', limit: 20 })",
    inputSchema: obj(
      {
        contact_id: str("Optional. Filter to a specific contact's bookings."),
        status: str("Optional. Filter by status (scheduled | completed | cancelled | no_show)."),
        from: str("Optional ISO timestamp. Only bookings starting at or after this moment."),
        to: str("Optional ISO timestamp. Only bookings starting at or before this moment."),
        limit: { type: "number", description: "Max rows (default 50, max 200)." },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      [],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const params = new URLSearchParams();
      if (args.contact_id) params.set("contact_id", args.contact_id);
      if (args.status) params.set("status", args.status);
      if (args.from) params.set("from", args.from);
      if (args.to) params.set("to", args.to);
      if (typeof args.limit === "number") params.set("limit", String(Math.min(args.limit, 200)));
      const qs = params.toString();
      return api("GET", `/bookings${qs ? `?${qs}` : ""}`, { workspace_id: ws });
    },
  },
  {
    name: "create_coupon",
    description:
      "Create a Stripe coupon + matching per-contact redeemable promotion code on the workspace's connected Stripe account. Use for Win-Back / retention agents that need UNIQUE codes per recipient (shared codes are vulnerable to abuse + lose attribution signal). Default max_redemptions=1 + auto-generated code string. Requires the workspace to have completed Stripe Connect onboarding. Example: create_coupon({ percent_off: 20, duration: 'once', name: 'Win-Back 20% off' })",
    inputSchema: obj(
      {
        percent_off: { type: "number", description: "Discount percentage (0 < n ≤ 100). Either percent_off or amount_off is required." },
        amount_off: { type: "number", description: "Flat discount in the currency's major unit (e.g., 25.00 for $25 off). Either percent_off or amount_off is required." },
        currency: str("Only used with amount_off. 3-letter ISO code. Defaults to usd."),
        duration: str("'once' (default) | 'forever' | 'repeating'. 'repeating' requires duration_in_months."),
        duration_in_months: { type: "number", description: "Required when duration='repeating'." },
        name: str("Optional display name for the coupon (≤60 chars)."),
        code: str("Optional fixed redeemable code string. If omitted, Stripe auto-generates one."),
        max_redemptions: { type: "number", description: "Max total redemptions. Default 1 — per-contact unique code." },
        expires_at: str("Optional ISO timestamp. Code becomes invalid after this moment. Prefer expires_in_days for agent archetypes."),
        expires_in_days: { type: "number", description: "Relative expiry: code becomes invalid N days after this call fires (1–365). Preferred over expires_at for agent archetypes so the window stays meaningful no matter when the agent was last deployed." },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      [],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const body = {};
      if (typeof args.percent_off === "number") body.percent_off = args.percent_off;
      if (typeof args.amount_off === "number") body.amount_off = args.amount_off;
      if (args.currency) body.currency = args.currency;
      if (args.duration) body.duration = args.duration;
      if (typeof args.duration_in_months === "number") body.duration_in_months = args.duration_in_months;
      if (args.name) body.name = args.name;
      if (args.code) body.code = args.code;
      if (typeof args.max_redemptions === "number") body.max_redemptions = args.max_redemptions;
      if (args.expires_at) body.expires_at = args.expires_at;
      if (typeof args.expires_in_days === "number") body.expires_in_days = args.expires_in_days;
      return api("POST", "/coupons", { body, workspace_id: ws });
    },
  },
  {
    name: "create_booking",
    description:
      "Schedule a real booking against an existing appointment type. Looks up the template by id, creates a scheduled row on the workspace calendar, stamps the contact's name + email, emits booking.created, and — if the appointment type has a price > 0 — returns a Stripe Checkout URL routed to the SMB's connected Stripe account so the builder / agent can text or email the payment link to the contact. Example: create_booking({ contact_id: 'ctc_...', appointment_type_id: 'appt_...', starts_at: '2026-05-01T15:00:00Z' })",
    inputSchema: obj(
      {
        contact_id: str("Required. CRM contact being booked."),
        appointment_type_id: str("Required. Appointment-type template id from list_appointment_types."),
        starts_at: str("Required. ISO 8601 timestamp for the appointment start (e.g. 2026-05-01T15:00:00Z). Duration is read from the appointment type."),
        notes: str("Optional free-form booking notes."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["contact_id", "appointment_type_id", "starts_at"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      return api("POST", "/bookings", {
        body: {
          contact_id: args.contact_id,
          appointment_type_id: args.appointment_type_id,
          starts_at: args.starts_at,
          notes: args.notes ?? null,
        },
        workspace_id: ws,
      });
    },
  },
  {
    name: "get_booking",
    description:
      "Fetch one scheduled booking by id. Returns the full detail (contact, times, status, notes, meeting URL, cancellation timestamp, metadata). Appointment-type templates are NOT returned here — use list_appointment_types for those. 404s if the id is unknown OR belongs to a different workspace. Example: get_booking({ booking_id: 'bkg_...' }).",
    inputSchema: obj(
      {
        booking_id: str("Required. UUID of the booking."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["booking_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("GET", `/bookings/${encodeURIComponent(args.booking_id)}`, {
        workspace_id: ws,
      });
      return { ok: true, booking: result.data ?? null };
    },
  },
  {
    name: "cancel_booking",
    description:
      "Cancel a scheduled booking. Sets status to 'cancelled', stamps cancelledAt, deletes the Google Calendar event, and emits booking.cancelled. Idempotent — re-cancelling an already-cancelled booking is a 200 no-op with alreadyCancelled=true (no duplicate events, no calendar errors). Past-dated bookings CAN be cancelled (legitimate retroactive cleanup). Does NOT touch linked payments — linkedPaymentIds is returned so the agent can compose refund_payment explicitly if the business rule is 'cancel AND refund'. Example: cancel_booking({ booking_id: 'bkg_...' }).",
    inputSchema: obj(
      {
        booking_id: str("Required. UUID of the booking to cancel."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["booking_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("POST", `/bookings/${encodeURIComponent(args.booking_id)}/cancel`, {
        workspace_id: ws,
      });
      return { ok: true, ...result.data };
    },
  },
  {
    name: "reschedule_booking",
    description:
      "Move a scheduled booking to a new starts_at. Preserves the original duration — endsAt tracks the move so a 30-min consult stays 30 mins at the new time. Updates the Google Calendar event in place (event id preserved; attendees see the time change on their existing invite) and emits booking.rescheduled with both previousStartsAt and newStartsAt so follow-up agents can describe the change. Rejects past-dated new starts_at (400) and refuses to reschedule a cancelled booking (422 — reviving a cancellation should be a new create_booking). Does NOT change appointment type; does NOT touch linked payments. Example: reschedule_booking({ booking_id: 'bkg_...', starts_at: '2026-05-02T15:00:00Z' }).",
    inputSchema: obj(
      {
        booking_id: str("Required. UUID of the booking to move."),
        starts_at: str("Required. New ISO 8601 timestamp. Must be in the future. Duration is preserved from the current booking."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["booking_id", "starts_at"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("POST", `/bookings/${encodeURIComponent(args.booking_id)}/reschedule`, {
        body: { starts_at: args.starts_at },
        workspace_id: ws,
      });
      return { ok: true, ...result.data };
    },
  },
  {
    name: "list_appointment_types",
    description:
      "List all appointment types (bookable templates) in the workspace. Example: list_appointment_types({}).",
    inputSchema: obj({
      workspace_id: str("Optional. Falls back to the active workspace."),
    }),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("GET", "/booking/appointment-types", { workspace_id: ws });
      return { ok: true, appointment_types: result.appointment_types ?? [] };
    },
  },
  {
    name: "create_appointment_type",
    description:
      "Create a new appointment type with its own public /book/<slug> URL. Defaults availability to Mon–Fri 9am–5pm (edit on /bookings to change). Example: create_appointment_type({ title: 'Strategy call', duration_minutes: 45, price: 150 }).",
    inputSchema: obj(
      {
        title: str("Required. Human-readable name, e.g., 'Strategy call'."),
        booking_slug: str("Optional. URL-safe slug. Auto-derived from title if omitted."),
        duration_minutes: { type: "number", description: "Optional. 5–240. Defaults to 30." },
        description: str("Optional. Up to 800 chars. Shown on the public booking page."),
        price: { type: "number", description: "Optional. Defaults to 0 (free). Non-zero prices route through Stripe checkout on submit (requires Stripe connected)." },
        buffer_before_minutes: { type: "number", description: "Optional. 0–120. Defaults to 0." },
        buffer_after_minutes: { type: "number", description: "Optional. 0–120. Defaults to 0." },
        max_bookings_per_day: { type: "number", description: "Optional. Hard daily cap (1–100). Omit for unlimited." },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["title"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("POST", "/booking/appointment-types", {
        body: {
          title: args.title,
          booking_slug: args.booking_slug,
          duration_minutes: args.duration_minutes,
          description: args.description,
          price: args.price,
          buffer_before_minutes: args.buffer_before_minutes,
          buffer_after_minutes: args.buffer_after_minutes,
          max_bookings_per_day: args.max_bookings_per_day,
        },
        workspace_id: ws,
      });
      return {
        ok: true,
        appointment_type: result.appointment_type,
        public_url: result.public_url,
      };
    },
  },
  {
    name: "update_appointment_type",
    description:
      "Update an existing appointment type. Partial — omit fields to keep them. Example: update_appointment_type({ booking_slug: 'default', duration_minutes: 60, price: 200 }). Pass booking_slug='default' to edit the auto-seeded 'Book a call' template.",
    inputSchema: obj(
      {
        booking_slug: str("Slug of the appointment type. Use 'default' for the auto-seeded template."),
        title: str("Optional new title."),
        duration_minutes: { type: "number", description: "Optional new duration (5–240)." },
        description: str("Optional new description (≤800 chars). Empty string clears it."),
        price: { type: "number", description: "Optional new price. 0 = free." },
        buffer_before_minutes: { type: "number", description: "Optional. 0–120." },
        buffer_after_minutes: { type: "number", description: "Optional. 0–120." },
        max_bookings_per_day: { type: "number", description: "Optional. 1–100. Pass null to remove cap." },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["booking_slug"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api(
        "PATCH",
        `/booking/appointment-types/${encodeURIComponent(args.booking_slug)}`,
        {
          body: {
            title: args.title,
            duration_minutes: args.duration_minutes,
            description: args.description,
            price: args.price,
            buffer_before_minutes: args.buffer_before_minutes,
            buffer_after_minutes: args.buffer_after_minutes,
            max_bookings_per_day: args.max_bookings_per_day,
          },
          workspace_id: ws,
        },
      );
      return result;
    },
  },
  {
    name: "configure_booking",
    description:
      "DEPRECATED alias for update_appointment_type({ booking_slug: 'default', ... }). Kept so existing Claude Code sessions don't break. Prefer update_appointment_type for new scripts.",
    inputSchema: obj(
      {
        title: str("Optional new title."),
        duration_minutes: { type: "number", description: "Optional new duration in minutes." },
        description: str("Optional description."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      [],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("PATCH", "/booking/appointment-types/default", {
        body: {
          title: args.title,
          duration_minutes: args.duration_minutes,
          description: args.description,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Intake forms tools — Phase 2.d per tasks/mcp-gap-audit.md
  // CRUD on intake_forms + list_submissions read path. Template-backed
  // create_form uses the 6 templates from lib/forms/templates.ts. The old
  // `customize_intake_form` is kept as a deprecated alias for the default
  // 'intake' form; new code should use update_form.
  // ════════════════════════════════════════════════════════════════════

  {
    name: "list_forms",
    description:
      "List intake forms in the workspace. Example: list_forms({}).",
    inputSchema: obj({
      workspace_id: str("Optional. Falls back to the active workspace."),
    }),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("GET", "/forms", { workspace_id: ws });
      return { ok: true, forms: result.forms ?? [] };
    },
  },
  {
    name: "get_form",
    description:
      "Fetch one form by id or slug. Example: get_form({ form: 'contact' }) or get_form({ form: 'uuid…' }).",
    inputSchema: obj(
      {
        form: str("Form id (uuid) or slug (e.g., 'contact', 'intake')."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["form"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("GET", `/forms/${encodeURIComponent(args.form)}`, {
        workspace_id: ws,
      });
      return { ok: true, form: result.form ?? null };
    },
  },
  {
    name: "create_form",
    description:
      "Create a new intake form. Pass template_id to pre-fill fields from a built-in template (contact, lead-qualification, booking-request, nps-feedback, event-registration, blank). Example: create_form({ template_id: 'contact' }) → uses 'Contact us' template. Or pass explicit fields: create_form({ name: 'Intake', fields: [{ key: 'email', label: 'Email', type: 'email', required: true }] }).",
    inputSchema: obj(
      {
        template_id: str("Optional. One of: blank, contact, lead-qualification, booking-request, nps-feedback, event-registration."),
        name: str("Optional. Falls back to template name or 'New intake form'."),
        slug: str("Optional URL-safe slug. Falls back to template defaultSlug or slugified name."),
        fields: {
          type: "array",
          description: "Optional field list. Overrides template fields. Each: { key, label, type ('text'|'email'|'tel'|'textarea'|'select'), required, options? }.",
          items: { type: "object" },
        },
        is_active: { type: "boolean", description: "Optional. Defaults to true." },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      [],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("POST", "/forms", {
        body: {
          template_id: args.template_id,
          name: args.name,
          slug: args.slug,
          fields: args.fields,
          is_active: args.is_active,
        },
        workspace_id: ws,
      });
      return result;
    },
  },
  {
    name: "update_form",
    description:
      "Update a form. Partial — omit fields to keep them. Replacing `fields` replaces the whole array (each field: { key, label, type, required, options? }). Example: update_form({ form: 'intake', fields: [...] }).",
    inputSchema: obj(
      {
        form: str("Form id (uuid) or slug."),
        name: str("Optional new name."),
        slug: str("Optional new slug (URL-safe)."),
        fields: {
          type: "array",
          description: "Optional new field array. Whole replacement.",
          items: { type: "object" },
        },
        is_active: { type: "boolean", description: "Optional. Toggle publish state." },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["form"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("PATCH", `/forms/${encodeURIComponent(args.form)}`, {
        body: {
          name: args.name,
          slug: args.slug,
          fields: args.fields,
          is_active: args.is_active,
        },
        workspace_id: ws,
      });
      return result;
    },
  },
  {
    name: "delete_form",
    description:
      "Delete a form. Irreversible. Submissions are NOT deleted (form_submissions has ON DELETE SET NULL on form_id). Example: delete_form({ form: 'old-survey' }).",
    inputSchema: obj(
      {
        form: str("Form id (uuid) or slug."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["form"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      await api("DELETE", `/forms/${encodeURIComponent(args.form)}`, { workspace_id: ws });
      return { ok: true, deleted: args.form };
    },
  },
  {
    name: "list_submissions",
    description:
      "List submissions for a form. Example: list_submissions({ form_id: 'uuid…' }).",
    inputSchema: obj(
      {
        form_id: str("UUID of the form. Slug lookup not supported on this endpoint — use get_form first if you only have the slug."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["form_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api(
        "GET",
        `/forms/${encodeURIComponent(args.form_id)}/submissions`,
        { workspace_id: ws },
      );
      return { ok: true, submissions: result.data ?? result.submissions ?? [] };
    },
  },
  {
    name: "customize_intake_form",
    description:
      "DEPRECATED alias for update_form({ form: 'intake', fields }). Only edits the auto-seeded default form; prefer update_form for new scripts so you can target any form in the workspace.",
    inputSchema: obj(
      {
        fields: {
          type: "array",
          description: "Replacement field list.",
          items: { type: "object" },
        },
        form_name: str("Optional new display name for the default form."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      [],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("PATCH", "/forms/intake", {
        body: { name: args.form_name, fields: args.fields },
        workspace_id: ws,
      });
      return result;
    },
  },

  // ===== Phase 3 — Email + conversation tools =====

  {
    name: "send_email",
    description:
      "Send a one-off email through the workspace's configured provider (Resend by default). Checks the suppression list before sending and skips with {suppressed: true} if the recipient has opted out. Example: send_email({ to: 'alex@acme.com', subject: 'Welcome', body: 'Thanks for signing up', contact_id: 'ctc_123' })",
    inputSchema: obj(
      {
        to: str("Recipient email address."),
        subject: str("Email subject line."),
        body: str("Plain-text body — rendered into the default HTML shell."),
        contact_id: str("Optional. Links the email to a CRM contact for threading."),
        provider: str("Optional. Force a specific provider (default: resend)."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["to", "subject", "body"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("POST", "/emails", {
        body: {
          to: args.to,
          subject: args.subject,
          body: args.body,
          contactId: args.contact_id ?? null,
          provider: args.provider ?? null,
        },
        workspace_id: ws,
      });
      return result;
    },
  },
  {
    name: "list_emails",
    description:
      "List recent emails sent from the workspace, newest first. Useful for checking delivery status before following up.",
    inputSchema: obj(
      {
        limit: {
          type: "number",
          description: "Max rows to return (default 50, max 200).",
        },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      [],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const qs = typeof args.limit === "number" ? `?limit=${Math.min(args.limit, 200)}` : "";
      const result = await api("GET", `/emails${qs}`, { workspace_id: ws });
      return result;
    },
  },
  {
    name: "get_email",
    description:
      "Fetch a single email with its full provider-event history (sent / delivered / opened / clicked / bounced).",
    inputSchema: obj(
      {
        email_id: str("Email ID returned from send_email or list_emails."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["email_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("GET", `/emails/${encodeURIComponent(args.email_id)}`, {
        workspace_id: ws,
      });
      return result;
    },
  },
  {
    name: "list_suppressions",
    description:
      "List all suppressed email addresses for the workspace — who is opted out and why (manual / unsubscribe / bounce / complaint).",
    inputSchema: obj(
      {
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      [],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("GET", "/emails/suppressions", { workspace_id: ws });
      return result;
    },
  },
  {
    name: "suppress_email",
    description:
      "Add an email address to the workspace suppression list so future sends skip it. Use for manual unsubscribes or policy blocks.",
    inputSchema: obj(
      {
        email: str("Email address to suppress."),
        reason: str(
          "Reason code: 'manual' | 'unsubscribe' | 'bounce' | 'complaint'. Default: 'manual'.",
        ),
        source: str("Optional free-form provenance tag."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["email"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("POST", "/emails/suppressions", {
        body: {
          email: args.email,
          reason: args.reason ?? "manual",
          source: args.source ?? null,
        },
        workspace_id: ws,
      });
      return result;
    },
  },
  {
    name: "unsuppress_email",
    description:
      "Remove an email address from the workspace suppression list so future sends go through again.",
    inputSchema: obj(
      {
        email: str("Email address to un-suppress."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["email"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api(
        "DELETE",
        `/emails/suppressions/${encodeURIComponent(args.email)}`,
        { workspace_id: ws },
      );
      return result;
    },
  },
  // ===== Phase 4 — SMS tools =====

  {
    name: "send_sms",
    description:
      "Send an SMS via the workspace's Twilio integration. Checks the SMS suppression list first (STOP keyword + carrier blocks + manual opt-outs) and skips with {suppressed: true} if the recipient has opted out. Example: send_sms({ to: '+15551234567', body: 'Your appointment is confirmed for Tuesday 2pm', contact_id: 'ctc_123' })",
    inputSchema: obj(
      {
        to: str("Recipient phone number. E.164 or 10-digit US will be normalized."),
        body: str("SMS body. Twilio will segment if over 160 chars; charges per segment."),
        contact_id: str("Optional. Links the message to a CRM contact for threading."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["to", "body"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("POST", "/sms", {
        body: {
          to: args.to,
          body: args.body,
          contactId: args.contact_id ?? null,
        },
        workspace_id: ws,
      });
      return result;
    },
  },
  {
    name: "list_sms",
    description:
      "List recent SMS messages (inbound + outbound) for the workspace, newest first.",
    inputSchema: obj(
      {
        limit: {
          type: "number",
          description: "Max rows to return (default 50, max 200).",
        },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      [],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const qs = typeof args.limit === "number" ? `?limit=${Math.min(args.limit, 200)}` : "";
      const result = await api("GET", `/sms${qs}`, { workspace_id: ws });
      return result;
    },
  },
  {
    name: "get_sms",
    description:
      "Fetch a single SMS with its full provider-event history (queued / sent / delivered / failed / undelivered).",
    inputSchema: obj(
      {
        sms_id: str("SMS ID returned from send_sms or list_sms."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["sms_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("GET", `/sms/${encodeURIComponent(args.sms_id)}`, {
        workspace_id: ws,
      });
      return result;
    },
  },
  {
    name: "list_sms_suppressions",
    description:
      "List all suppressed phone numbers for the workspace — who is opted out and why (manual / stop_keyword / carrier_block / complaint).",
    inputSchema: obj(
      {
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      [],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("GET", "/sms/suppressions", { workspace_id: ws });
      return result;
    },
  },
  {
    name: "suppress_phone",
    description:
      "Add a phone number to the SMS suppression list so future SMS sends skip it. STOP replies + carrier permanent-failure codes auto-suppress via the Twilio webhook; use this for manual opt-outs.",
    inputSchema: obj(
      {
        phone: str("Phone number to suppress. E.164 or 10-digit US will be normalized."),
        reason: str(
          "Reason code: 'manual' | 'stop_keyword' | 'carrier_block' | 'complaint'. Default: 'manual'.",
        ),
        source: str("Optional free-form provenance tag."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["phone"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("POST", "/sms/suppressions", {
        body: {
          phone: args.phone,
          reason: args.reason ?? "manual",
          source: args.source ?? null,
        },
        workspace_id: ws,
      });
      return result;
    },
  },
  {
    name: "unsuppress_phone",
    description:
      "Remove a phone number from the SMS suppression list so future sends go through again.",
    inputSchema: obj(
      {
        phone: str("Phone number to un-suppress."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["phone"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api(
        "DELETE",
        `/sms/suppressions/${encodeURIComponent(args.phone)}`,
        { workspace_id: ws },
      );
      return result;
    },
  },

  // ===== Phase 5 — Payments tools (Stripe Connect Standard) =====

  {
    name: "create_invoice",
    description:
      "Draft a Stripe invoice on the workspace's connected Stripe account. Invoice is created but not sent — call send_invoice separately so agents can review before dispatch. Contact must have an email. Example: create_invoice({ contact_id: 'ctc_123', items: [{ description: '1 hr consulting', quantity: 1, unit_amount: 200 }], due_at: '2026-05-21T00:00:00Z' })",
    inputSchema: obj(
      {
        contact_id: str("CRM contact to bill."),
        items: {
          type: "array",
          description: "Line items. Each: {description, quantity, unit_amount} (unit_amount in the workspace's currency).",
          items: { type: "object" },
        },
        currency: str("3-letter ISO currency code. Defaults to USD."),
        due_at: str("ISO timestamp for invoice due date. Defaults to 30 days out."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["contact_id", "items"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const normalizedItems = (args.items ?? []).map((item) => ({
        description: item.description,
        quantity: item.quantity ?? 1,
        unitAmount: item.unit_amount ?? item.unitAmount,
        currency: item.currency,
      }));
      const result = await api("POST", "/invoices", {
        body: {
          contactId: args.contact_id,
          items: normalizedItems,
          currency: args.currency ?? null,
          dueAt: args.due_at ?? null,
        },
        workspace_id: ws,
      });
      return result;
    },
  },
  {
    name: "list_invoices",
    description:
      "List workspace invoices (draft + sent + paid + past_due + voided), newest first.",
    inputSchema: obj(
      {
        limit: {
          type: "number",
          description: "Max rows (default 50, max 200).",
        },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      [],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const qs = typeof args.limit === "number" ? `?limit=${Math.min(args.limit, 200)}` : "";
      return api("GET", `/invoices${qs}`, { workspace_id: ws });
    },
  },
  {
    name: "get_invoice",
    description:
      "Fetch an invoice + its line items + hosted invoice URL (for payment).",
    inputSchema: obj(
      {
        invoice_id: str("Invoice ID returned from create_invoice or list_invoices."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["invoice_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      return api("GET", `/invoices/${encodeURIComponent(args.invoice_id)}`, { workspace_id: ws });
    },
  },
  {
    name: "send_invoice",
    description:
      "Dispatch a draft invoice to the contact via Stripe (Stripe emails the invoice + provides a hosted pay page).",
    inputSchema: obj(
      {
        invoice_id: str("Invoice to send."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["invoice_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      return api("POST", `/invoices/${encodeURIComponent(args.invoice_id)}/send`, { workspace_id: ws });
    },
  },
  {
    name: "void_invoice",
    description:
      "Void an invoice (undo a billing error). Only valid for draft / open invoices; paid invoices must be refunded instead.",
    inputSchema: obj(
      {
        invoice_id: str("Invoice to void."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["invoice_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      return api("POST", `/invoices/${encodeURIComponent(args.invoice_id)}/void`, { workspace_id: ws });
    },
  },
  {
    name: "create_subscription",
    description:
      "Start a recurring subscription for a contact against a Stripe Price id. The Price must already exist in the workspace's Stripe dashboard — v1 does not create Prices. Example: create_subscription({ contact_id: 'ctc_123', price_id: 'price_1ABCxyz', trial_days: 14 })",
    inputSchema: obj(
      {
        contact_id: str("CRM contact to subscribe."),
        price_id: str("Stripe Price id (e.g., 'price_1ABC...') from the workspace's Stripe dashboard."),
        trial_days: {
          type: "number",
          description: "Optional free trial days before first charge.",
        },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["contact_id", "price_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      return api("POST", "/subscriptions", {
        body: {
          contactId: args.contact_id,
          priceId: args.price_id,
          trialDays: args.trial_days,
        },
        workspace_id: ws,
      });
    },
  },
  {
    name: "list_subscriptions",
    description:
      "List workspace subscriptions (active + trialing + past_due + canceled), newest first.",
    inputSchema: obj(
      {
        limit: {
          type: "number",
          description: "Max rows (default 50, max 200).",
        },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      [],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const qs = typeof args.limit === "number" ? `?limit=${Math.min(args.limit, 200)}` : "";
      return api("GET", `/subscriptions${qs}`, { workspace_id: ws });
    },
  },
  {
    name: "cancel_subscription",
    description:
      "Cancel a subscription. Default: cancel at period end (contact keeps access until renewal date). Pass immediate=true for an instant termination + prorated refund.",
    inputSchema: obj(
      {
        subscription_id: str("Subscription to cancel."),
        immediate: {
          type: "boolean",
          description: "If true, terminate now. Default: cancel at period end.",
        },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["subscription_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      return api("POST", `/subscriptions/${encodeURIComponent(args.subscription_id)}/cancel`, {
        body: { immediate: Boolean(args.immediate) },
        workspace_id: ws,
      });
    },
  },
  {
    name: "list_payments",
    description:
      "List recent payments (completed + failed + refunded + disputed) across the workspace, newest first.",
    inputSchema: obj(
      {
        limit: {
          type: "number",
          description: "Max rows (default 50, max 200).",
        },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      [],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const qs = typeof args.limit === "number" ? `?limit=${Math.min(args.limit, 200)}` : "";
      return api("GET", `/payments${qs}`, { workspace_id: ws });
    },
  },
  {
    name: "get_payment",
    description:
      "Fetch a single payment record with status + refund/dispute state.",
    inputSchema: obj(
      {
        payment_id: str("Payment ID from list_payments."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["payment_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      return api("GET", `/payments/${encodeURIComponent(args.payment_id)}`, { workspace_id: ws });
    },
  },
  {
    name: "refund_payment",
    description:
      "Refund a payment. Omit amount to refund the full payment; pass amount for a partial refund. reason should be 'duplicate' | 'fraudulent' | 'requested_by_customer'.",
    inputSchema: obj(
      {
        payment_id: str("Payment to refund."),
        amount: {
          type: "number",
          description: "Optional partial-refund amount in the payment's currency. Omit to refund in full.",
        },
        reason: str("'duplicate' | 'fraudulent' | 'requested_by_customer'. Default: requested_by_customer."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["payment_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      return api("POST", `/payments/${encodeURIComponent(args.payment_id)}/refund`, {
        body: {
          amount: args.amount,
          reason: args.reason ?? "requested_by_customer",
        },
        workspace_id: ws,
      });
    },
  },

  // ===== Phase 6 — Landing Pages tools =====

  {
    name: "list_landing_pages",
    description:
      "List the workspace's landing pages (draft + published), newest-updated first.",
    inputSchema: obj(
      {
        limit: { type: "number", description: "Max rows (default 50, max 200)." },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      [],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const qs = typeof args.limit === "number" ? `?limit=${Math.min(args.limit, 200)}` : "";
      return api("GET", `/landing${qs}`, { workspace_id: ws });
    },
  },
  {
    name: "get_landing_page",
    description:
      "Fetch a single landing page with its full Puck payload + metadata.",
    inputSchema: obj(
      {
        page_id: str("Landing page ID from list_landing_pages."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["page_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      return api("GET", `/landing/${encodeURIComponent(args.page_id)}`, { workspace_id: ws });
    },
  },
  // May 2, 2026 (v1.1.2) — `create_landing_page` DELETED entirely.
  // Every workspace already has a default landing page seeded by
  // create_full_workspace (via createDefaultLandingPage +
  // seedLandingFromSoul). Calling create_landing_page tried to
  // create a SECOND page, which the Free-tier landingPages limit (=1)
  // rejected with `upgrade_required` — surfacing as a 500 on every
  // demo run. Customization goes through update_landing_page on
  // the existing page; no second page is ever needed.
  {
    name: "update_landing_page",
    description:
      "Update a landing page's title and/or Puck payload. Validates puck_data on the way through. Does not change publish status — use publish_landing_page for that.",
    inputSchema: obj(
      {
        page_id: str("Landing page to update."),
        title: str("Optional new title."),
        puck_data: {
          type: "object",
          description: "Optional new Puck payload. Pass null to clear.",
        },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["page_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const bodyObj = {};
      if (typeof args.title === "string") bodyObj.title = args.title;
      if (args.puck_data !== undefined) bodyObj.puckData = args.puck_data;
      return api("PATCH", `/landing/${encodeURIComponent(args.page_id)}`, {
        body: bodyObj,
        workspace_id: ws,
      });
    },
  },
  {
    name: "publish_landing_page",
    description:
      "Flip a landing page between draft and published. Publishing busts the public-URL cache immediately and emits landing.published. Pass published=false to unpublish.",
    inputSchema: obj(
      {
        page_id: str("Landing page to publish."),
        published: {
          type: "boolean",
          description: "true = publish (default), false = unpublish.",
        },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["page_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      return api("POST", `/landing/${encodeURIComponent(args.page_id)}/publish`, {
        body: { published: args.published !== false },
        workspace_id: ws,
      });
    },
  },
  {
    name: "list_landing_templates",
    description:
      "List the pre-built vertical landing-page templates. Each has a validated Puck payload ready to seed a new page via create_landing_page({puck_data: template.payload}).",
    inputSchema: obj(
      {
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      [],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      return api("GET", "/landing/templates", { workspace_id: ws });
    },
  },
  {
    name: "get_landing_template",
    description:
      "Fetch a single landing-page template including its Puck payload. Pair with create_landing_page to seed a new page from the template.",
    inputSchema: obj(
      {
        template_id: str("Template ID from list_landing_templates."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["template_id"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      return api("GET", `/landing/templates/${encodeURIComponent(args.template_id)}`, { workspace_id: ws });
    },
  },
  {
    name: "generate_landing_page",
    description:
      "Generate a Puck landing-page payload from a natural-language prompt using Claude + the workspace's Soul + theme. Returns the payload (validated against the Puck schema) but does NOT persist — pair with create_landing_page to save the result. Example: generate_landing_page({ prompt: 'A landing for a Laval dental clinic, focus on new-patient consultations' })",
    inputSchema: obj(
      {
        prompt: str("One-sentence page description. The more specific, the better."),
        existing: {
          type: "object",
          description: "Optional existing Puck payload to revise rather than start fresh.",
        },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["prompt"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      return api("POST", "/landing/generate", {
        body: {
          prompt: args.prompt,
          existing: args.existing,
        },
        workspace_id: ws,
      });
    },
  },

  {
    name: "send_conversation_turn",
    description:
      "Route an incoming message through the Conversation Primitive runtime. Loads prior turns for (contact, channel), generates a Soul-aware reply with Claude, writes both inbound + outbound turns, and emits conversation.turn.received / sent events. Use when building an always-on conversational agent (speed-to-lead, qualification chatbot). Example: send_conversation_turn({ contact_id: 'ctc_123', channel: 'sms', message: 'Do you have Saturday appointments?' })",
    inputSchema: obj(
      {
        contact_id: str("CRM contact to converse with."),
        channel: str("Transport channel: 'email' | 'sms'."),
        message: str("Incoming message content to reason about."),
        conversation_id: str(
          "Optional existing conversation id. Omit to let the runtime reuse the most recent active thread or open a new one.",
        ),
        subject: str("Optional subject for email threads."),
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["contact_id", "channel", "message"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      const result = await api("POST", "/conversations/turn", {
        body: {
          contactId: args.contact_id,
          channel: args.channel,
          message: args.message,
          conversationId: args.conversation_id ?? null,
          subject: args.subject ?? null,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  // ─── v1.4.0 — v2 (MCP-native) workspace creation ────────────────────────
  //
  // The v2 flow shifts block GENERATION out of the SF backend and into the
  // IDE agent's LLM context. Operator's IDE agent (Claude Code, Cursor,
  // Windsurf, etc.) reads each block's SKILL.md, generates props with its
  // own LLM, and posts the props back to SF. SF persists + renders.
  //
  // PREFERRED for new workspace creation as of v1.4. The v1
  // create_full_workspace tool above still works (and v1 still owns
  // booking, intake, about, theme, pipeline) — v2 only owns hero, services,
  // and faq for now (the highest-stakes copy surfaces, where the v1 layer-
  // mismatch bug class hurt most).

  {
    name: "create_workspace_v2",
    description:
      "Create a workspace from pre-extracted business facts. Used as the follow-up call after `create_workspace_from_url` returns extraction instructions, OR directly when the operator provides structured info (no URL). " +
      "Flow: 1) call this tool with the business facts; 2) for each block in `v2.recommended_blocks`, call get_block_skill(name) and use your LLM to generate props matching the SKILL.md prompt + schema; 3) call persist_block({ workspace_id, block_name, generation_prompt, props }) for each; 4) call complete_workspace_v2({ workspace_id }). " +
      "MANDATORY FOLLOW-UP: After this returns `status: 'ready'` AND after all blocks land via persist_block + complete_workspace_v2, ask the operator verbatim 'What email should I use for your account?' Then call finalize_workspace({ workspace_id, email }). The admin dashboard URL is created by finalize_workspace, not here.",
    inputSchema: obj(
      {
        business_name: str("Business display name."),
        city: str("Operator's city. Drives timezone inference."),
        state: str("US state code or full name (or Canadian province)."),
        phone: str("Business phone, any format."),
        services: {
          type: "array",
          description: "Services / offerings the business provides — each as a plain string.",
          items: { type: "string" },
        },
        business_description: str(
          "One paragraph describing the business — drives the personality classifier and feeds into block prompts."
        ),
        review_count: { type: "number", description: "Optional — number of reviews." },
        review_rating: { type: "number", description: "Optional — average star rating." },
        certifications: { type: "array", items: { type: "string" } },
        trust_signals: { type: "array", items: { type: "string" } },
        emergency_service: { type: "boolean" },
        same_day: { type: "boolean" },
        service_area: { type: "array", items: { type: "string" } },
        email: str("Optional contact email surfaced in the landing footer (NOT the operator's account email)."),
        address: str("Optional business address."),
      },
      ["business_name", "city", "state", "phone", "services", "business_description"],
    ),
    handler: async (args) => {
      const firstEver = isFirstEverCall();
      const result = await api("POST", "/workspace/v2/create", {
        body: {
          business_name: args.business_name,
          city: args.city,
          state: args.state,
          phone: args.phone,
          services: args.services,
          business_description: args.business_description,
          review_count: args.review_count ?? null,
          review_rating: args.review_rating ?? null,
          certifications: args.certifications ?? null,
          trust_signals: args.trust_signals ?? null,
          emergency_service: args.emergency_service ?? null,
          same_day: args.same_day ?? null,
          service_area: args.service_area ?? null,
          email: args.email ?? null,
          address: args.address ?? null,
        },
        allow_anonymous: true,
      });

      if (result?.status !== "ready" || !result?.workspace_id) {
        return result;
      }

      // Stash the bearer locally so subsequent persist_block + finalize calls
      // can authenticate. Stripped from the visible response.
      if (result._bearer_token) {
        rememberWorkspace({
          workspace_id: result.workspace_id,
          bearer_token: result._bearer_token,
        });
      }

      // Operator-facing payload + structural enforcement that the IDE agent
      // does the block generation step before showing URLs to the user.
      const guardrail = [
        "⚠️ V2 WORKSPACE BOOTSTRAPPED — DO NOT END YET ⚠️",
        "",
        `The workspace "${args.business_name}" exists on the backend with default copy from the v1 personality system. To complete the v2 flow you MUST:`,
        "",
        "  1. For each block in v2.recommended_blocks:",
        "     a. call get_block_skill({ block_name }) to load the SKILL.md prompt + prop schema",
        "     b. use your LLM to generate props matching that schema, using v2.context as the input",
        "     c. call persist_block({ workspace_id, block_name, generation_prompt, props })",
        "  2. call complete_workspace_v2({ workspace_id }) to validate the final state",
        "  3. ask the operator: " + JSON.stringify(result.operator_prompt ?? "What email should I use for your account?"),
        "  4. call finalize_workspace({ workspace_id, email }) to mint the admin URL",
        "",
        "DO NOT show the operator any URLs from this response yet — the page is rendering with v1 default copy until step 1 lands. Step 1 produces the niche-aware copy the operator is going to actually see.",
      ].join("\n");

      const payload = {
        ok: true,
        DO_NOT_DISPLAY_TO_USER: guardrail,
        workspace: { id: result.workspace_id, slug: result.slug },
        configured: result.configured,
        v2: result.v2,
        next_step: {
          required: true,
          do_not_show_urls_until_blocks_persisted_and_email_collected: true,
          tool_to_call_first: "get_block_skill",
          then_for_each_block: "persist_block",
          then: "complete_workspace_v2",
          finally: "finalize_workspace",
          ask_user_verbatim: result.operator_prompt,
        },
        _pending_after_completion: {
          website_url: result.public_urls?.home ?? null,
          booking_url: result.public_urls?.book ?? null,
          intake_url: result.public_urls?.intake ?? null,
        },
      };
      return firstEver ? withFirstCallBanner(payload) : payload;
    },
  },

  {
    name: "list_blocks",
    description:
      "List all v2 page-block primitives available in this SF backend. Returns each block's name, version, section type, one-line description, and the URL where its full SKILL.md (the generation prompt + prop schema) lives. Use this when you need to discover what blocks exist; for actual block content use get_block_skill.",
    inputSchema: obj({}),
    handler: async () => {
      const result = await api("GET", "/public/blocks/list", { allow_anonymous: true });
      return result;
    },
  },

  {
    name: "get_block_skill",
    description:
      "Fetch the SKILL.md (the full generation prompt + prop schema + voice rules + worked examples + validator definitions) for one v2 page block. Returns raw markdown text. Read it carefully BEFORE generating props — the prop schema in the YAML frontmatter is enforced by the persist_block endpoint, and the validators run on every save. Generation that ignores the SKILL.md will fail validation and the operator will see worse output.",
    inputSchema: obj(
      { block_name: str("Block name. Use list_blocks to discover. As of v1.4: hero, services, faq.") },
      ["block_name"],
    ),
    handler: async (args) => {
      const path = `/public/blocks/${encodeURIComponent(args.block_name)}/skill`;
      // Custom fetch — the SKILL.md endpoint returns text/markdown, not JSON.
      const res = await fetch(`${API_INFO.base}${path}`);
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`get_block_skill ${res.status}: ${errBody}`);
      }
      const skill_md = await res.text();
      return {
        block_name: args.block_name,
        skill_md,
        usage:
          "The frontmatter (between the --- markers) defines the prop schema and validators. The body is the generation prompt — read it as if it were addressed to you. Generate JSON matching the prop schema, then call persist_block.",
      };
    },
  },

  {
    name: "persist_block",
    description:
      "Persist a v2 block instance. Call this after you've read the block's SKILL.md and generated props matching its schema. The server validates props (Zod schema + deterministic copy-quality validators), renders the block via the existing renderer, replaces the matching section in the workspace's landing page, and returns the public URL where the change is now visible. " +
      "For initial generation, omit `customization`. For operator-driven edits ('make the hero warmer', 'add a card about kids cuts'), pass `customization: { prompt }` — the operator's prompt is appended to the row's customization history (forever-frozen rule), and the new props replace the previous render. " +
      "Returns `validation_errors` on failure — if you see them, regenerate the props with the rules from SKILL.md applied more carefully and retry. Don't show validation errors to the operator; they're for you.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id from create_workspace_v2."),
        block_name: str("Block name (must match a get_block_skill name): hero, services, or faq."),
        generation_prompt: str(
          "The full prompt your LLM consumed to produce these props. Stored as the source of truth for re-renders. Include the workspace context (business name, services, etc.) — not just the SKILL.md body."
        ),
        props: {
          type: "object",
          description:
            "Block props matching the prop schema in the block's SKILL.md frontmatter. Validated server-side; mismatches return 422 with structured validation_errors.",
          additionalProperties: true,
        },
        customization: {
          type: "object",
          description:
            "Optional operator-customization layer. When set, append-only override of the initial generation. Use this when the operator says 'change X about my hero' rather than 'rewrite my hero'.",
          properties: {
            prompt: str("The operator's natural-language customization request."),
            source: str("Optional source identifier (e.g. 'claude-code/desktop-7af3') for audit logs."),
          },
        },
      },
      ["workspace_id", "block_name", "generation_prompt", "props"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/blocks", {
        body: {
          workspace_id: ws,
          block_name: args.block_name,
          generation_prompt: args.generation_prompt,
          props: args.props,
          customization: args.customization ?? null,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "complete_workspace_v2",
    description:
      "Mark the v2 flow finished for a workspace. Returns which blocks landed vs. were skipped (skipped ones still render via the v1 default pipeline), plus the next steps. Call after every recommended_block has been persisted via persist_block. The operator-facing summary (admin URL, etc.) still requires finalize_workspace afterward.",
    inputSchema: obj(
      { workspace_id: str("Workspace id from create_workspace_v2.") },
      ["workspace_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/complete", {
        body: { workspace_id: ws },
        workspace_id: ws,
      });
      return result;
    },
  },

  // ─── v1.10.0 — block customization (regenerate / reorder / image) ──────
  //
  // These tools let the operator iterate on a workspace AFTER the v2
  // creation flow has shipped: regenerate one block with new
  // instructions ("make the hero punchier"), reorder landing sections
  // ("move FAQ to the bottom"), or upload an image (logo, hero
  // background).
  //
  // Thin harness, fat skill: server-side these tools do NO creative
  // work. regenerate_block just bundles the IDE agent everything it
  // needs (current props, workspace summary, brain patterns); the
  // agent's own LLM does the actual regeneration and calls
  // persist_block to save the result.

  {
    name: "regenerate_block",
    description:
      "Get the bundle needed to regenerate ONE v2 page block with new operator instructions. Use this when the operator asks for a targeted change to an existing block ('make the hero punchier', 'add a card about kids cuts', 'rewrite the FAQ to be less salesy'). " +
      "Returns: current_props (so your LLM can iterate rather than start fresh), workspace_summary (business name, industry, services, voice from the workspace's soul), brain_patterns (anonymized cross-workspace patterns for this vertical), customization_history (previous edits — useful for understanding what NOT to revert), and the operator's new_instructions (echoed back so they're visible in your context). " +
      "The next move is YOURS: fetch the block's SKILL.md via get_block_skill, generate new props that satisfy the prop schema while applying new_instructions, then call persist_block with `customization: { prompt: <new_instructions> }` to record the change. " +
      "If the block has never been persisted (status=first_generation), this is a normal first-time generation path — same downstream flow, just no current_props to iterate from. " +
      "Antifragile design note: this tool only ASSEMBLES context. Your LLM does the creative work. As models improve, regeneration quality improves with zero MCP changes.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id from create_workspace_v2."),
        block_name: str(
          "Block name to regenerate. Must match a v2 block: hero, services, about, faq, cta, booking, intake.",
        ),
        new_instructions: str(
          "Optional: the operator's natural-language regeneration request ('make it more urgent', 'shorter copy', 'less salesy'). When provided, surfaced in the response and used in the customization field of the subsequent persist_block call. Omit when the operator just wants a fresh roll without specific guidance.",
        ),
      },
      ["workspace_id", "block_name"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const blockName = encodeURIComponent(args.block_name);
      const qs = args.new_instructions
        ? `?new_instructions=${encodeURIComponent(args.new_instructions)}`
        : "";
      const result = await api(
        "GET",
        `/workspace/v2/blocks/${blockName}/regenerate${qs}`,
        { workspace_id: ws },
      );
      return result;
    },
  },

  {
    name: "get_landing_structure",
    description:
      "Read the workspace's landing-page section list with INDEX as the addressing primitive. Returns each section's index (0..N-1, top-to-bottom on the rendered page), type ('hero', 'services-grid', 'about', 'faq', 'mid-cta', 'trust-strip', 'footer', etc.), and a 1-line preview ('Vancouver's Trusted HVAC Family — Same-Day Service' for hero, '3 services (grid-3)' vs 'stats — 4 numbers' for services-grid duplicates). " +
      "Use this BEFORE move_section / delete_section so you know which index to target. The preview disambiguates duplicate types (e.g. when a workspace has TWO services-grid sections — one with services, one with stats). " +
      "v1.11+ replaces the v1.10 workflow where the agent had to fetch landing_pages.blueprintJson manually and parse it client-side. Cheap server-side (one DB read).",
    inputSchema: obj(
      { workspace_id: str("Workspace id.") },
      ["workspace_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("GET", "/workspace/v2/landing/structure", {
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "move_section",
    description:
      "Move ONE landing-page section atomically. Identifies sections by INDEX (run get_landing_structure first to find which index to move). Splice semantics: the section at from_index is removed, then inserted at to_index in the resulting array — so to_index is the section's NEW position in the result. " +
      "Examples: 'put hero below FAQ' → from_index=<hero index>, to_index=<faq's current index>. 'Move services to the top' → from_index=<services index>, to_index=0. " +
      "Handles duplicate types correctly (the case reorder_landing_sections refused) — index identity is unambiguous even when two services-grid or two mid-cta sections exist. " +
      "Use reorder_landing_sections instead when you want to express the entire new order at once AND types are unique. Use move_section for single-step moves OR when types repeat.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        from_index: {
          type: "integer",
          description:
            "0-based index of the section to move (from the get_landing_structure response).",
          minimum: 0,
        },
        to_index: {
          type: "integer",
          description:
            "0-based index where the section should END UP in the result. Splice semantics — equivalent to: remove from from_index, then insert at to_index.",
          minimum: 0,
        },
      },
      ["workspace_id", "from_index", "to_index"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/landing/move-section", {
        body: {
          workspace_id: ws,
          from_index: args.from_index,
          to_index: args.to_index,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "delete_section",
    description:
      "Remove ONE landing-page section atomically. Identifies the section by INDEX (run get_landing_structure first). Refuses to leave 0 sections — minimum is 1 — so you can't accidentally wipe the page. " +
      "Use when the workspace has a duplicate section type (e.g. two services-grid sections, one of which was an unintended generation artifact) and the operator wants the duplicate gone. Disambiguate WHICH duplicate via the preview text from get_landing_structure (e.g. 'stats — 4 numbers' vs '3 services (grid-3)'). " +
      "For content edits, use update_landing_section. For replacing a section's content, use persist_block. delete_section is structural — it removes the section from the page entirely.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        index: {
          type: "integer",
          description:
            "0-based index of the section to delete (from get_landing_structure response).",
          minimum: 0,
        },
      },
      ["workspace_id", "index"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/landing/delete-section", {
        body: { workspace_id: ws, index: args.index },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "add_composite_section",
    description:
      "Add a CUSTOM landing-page section by composing low-level primitives (heading / text / image / list / button / card / row / col / stat / embed / divider / spacer) into a tree. Use this when the operator asks for a section type that doesn't fit hero/services/about/faq/mid-cta — e.g. 'a 2-column comparison of us vs DIY', 'a pricing tier section', 'a how-it-works in 4 steps', 'a stats row with 4 numbers', 'a side-by-side image + bullet-list'. " +
      "The agent's job: read operator intent + the workspace soul (voice, services, brand) and emit a `tree` JSON object. Server validates (Zod schema, depth ≤ 4, children-per-container caps, heading-level descent), voice-scans against soul.voice.avoidWords (warnings, not errors), then renders + persists. " +
      "Tree root MUST be kind=section. Leaves can include kind=embed with ref ∈ {services, faq, testimonials, hours, phone} to pull workspace-data into the section without re-typing it. Phone embed renders as a tel: link. " +
      "Pattern library (typical compositions): COMPARISON = section { row{cols:2, [card{heading,list-check}, card{variant:muted, heading,list-x}]}}. STATS = section { row{cols:4, [stat,stat,stat,stat]}}. HOW-IT-WORKS = section { row{cols:4, [card{heading,text}, card{heading,text}, card{heading,text}, card{heading,text}]}}. SIDE-BY-SIDE = section { row{cols:2, [col{image}, col{heading,text,button}]}}. " +
      "Returns the new section's index, the full sections list with previews, validation_warnings (voice violations the agent should fix on retry), and the public_url. Use position to insert at a specific index (default: append).",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        tree: {
          type: "object",
          description:
            "Composite tree root. MUST be kind=section with optional eyebrow/headline/subhead and a children array. See the COMPOSITE_BLOCK_SKILL.md (fetch via get_block_skill('composite')) for the full primitive vocabulary, validation rules, and worked patterns.",
          additionalProperties: true,
        },
        position: {
          type: "integer",
          description:
            "Optional 0-based insert position. Default: appended at the end. Use get_landing_structure to find the right slot first.",
          minimum: 0,
        },
      },
      ["workspace_id", "tree"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/landing/composite", {
        body: {
          workspace_id: ws,
          op: "add",
          tree: args.tree,
          position: args.position,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "update_composite_section",
    description:
      "Replace the tree of an EXISTING composite section. Use when the operator asks to refine a custom section you previously created ('shorten the comparison', 'add another stat', 'make the cards muted'). Index must point at a section of type=composite — for typed sections (hero, services, faq, etc.) use update_landing_section, regenerate_block, or persist_block. " +
      "First call get_landing_structure to find the right index — composite sections show preview text starting with 'composite — <headline>'. Then generate the new tree (typically by reading current_props equivalent — for composite sections this means fetching the existing tree, mutating, and submitting; today the simplest path is to regenerate from scratch using operator instructions + soul). " +
      "Same validation + voice-scan as add_composite_section. Returns the same payload with index unchanged.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        index: {
          type: "integer",
          description:
            "0-based index of the composite section to update (from get_landing_structure).",
          minimum: 0,
        },
        tree: {
          type: "object",
          description:
            "Replacement tree. Same shape as add_composite_section — kind=section root with children.",
          additionalProperties: true,
        },
      },
      ["workspace_id", "index", "tree"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/landing/composite", {
        body: {
          workspace_id: ws,
          op: "update",
          tree: args.tree,
          index: args.index,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  // ─── v1.13.0 — intake-form structural primitives ────────────────────────
  //
  // Five atomic primitives for the intake-form surface, mirroring the
  // landing-structure pattern: read / add / move / delete / update.
  // Index-based addressing; ID uniqueness enforced on add/update.
  // Linear (no nesting), so simpler than composite trees.

  {
    name: "get_intake_structure",
    description:
      "Read the workspace's intake form: title, description, and the indexed list of fields with type + label + required + 1-line preview. Use this BEFORE add_intake_field / move_intake_field / delete_intake_field / update_intake_field to find the right index. Cheap one-DB-read.",
    inputSchema: obj(
      { workspace_id: str("Workspace id.") },
      ["workspace_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("GET", "/workspace/v2/intake/structure", {
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "add_intake_field",
    description:
      "Add ONE field to the intake form. Field shape: { id, type, label, required?, helper?, options?, validation?, ratingScale? }. Types: text, textarea, email, phone, number, select, multi-select, rating, date. " +
      "ID must be unique within the form (server rejects duplicates — IDs are the bind key for answers). For select/multi-select pass an `options` array. " +
      "Use when the operator wants a new question on the intake form ('add a phone field', 'ask about budget', 'add a checkbox for newsletter signup'). For content edits to existing fields use update_intake_field. " +
      "Position is optional — defaults to appending at the end. Use get_intake_structure first if you want to insert between specific fields.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        field: {
          type: "object",
          description:
            "The new IntakeQuestion object: { id (kebab-case, unique), type, label, required?, helper?, options?, ratingScale?, validation? }.",
          additionalProperties: true,
        },
        position: {
          type: "integer",
          description:
            "Optional 0-based insert index. Default: append. Use get_intake_structure to find the right slot.",
          minimum: 0,
        },
      },
      ["workspace_id", "field"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/intake/fields", {
        body: {
          workspace_id: ws,
          op: "add",
          field: args.field,
          position: args.position,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "move_intake_field",
    description:
      "Move ONE intake field to a new position. Splice semantics — field at from_index is removed, then inserted at to_index in the result. Use when the operator says 'put email at the top' or 'move phone above address'. " +
      "Run get_intake_structure first to find the indices.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        from_index: { type: "integer", description: "0-based source index.", minimum: 0 },
        to_index: { type: "integer", description: "0-based target index in the result.", minimum: 0 },
      },
      ["workspace_id", "from_index", "to_index"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/intake/fields", {
        body: {
          workspace_id: ws,
          op: "move",
          from_index: args.from_index,
          to_index: args.to_index,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "delete_intake_field",
    description:
      "Remove ONE intake field. Refuses to leave 0 fields (the public submit becomes meaningless without any inputs — minimum is 1). Use when the operator wants to remove a question from the form ('drop the property type field', 'remove the rating question'). For content edits use update_intake_field. Run get_intake_structure first to find the right index.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        index: { type: "integer", description: "0-based index of the field to delete.", minimum: 0 },
      },
      ["workspace_id", "index"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/intake/fields", {
        body: { workspace_id: ws, op: "delete", index: args.index },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "update_intake_field",
    description:
      "Patch ONE intake field by index. Patch can include any subset of: id, type, label, helper, required, options, ratingScale, validation, showIf. Only the fields you pass are changed; everything else stays. " +
      "Use for content edits ('rename phone to mobile', 'make email optional', 'add a fourth option to property type', 'change the helper text'). " +
      "ID changes must not collide with another field's id (server rejects). For structural changes (add/remove fields) use the dedicated tools.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        index: { type: "integer", description: "0-based index of the field to patch.", minimum: 0 },
        patch: {
          type: "object",
          description:
            "Subset of IntakeQuestion fields to overwrite. Empty patch is rejected. ID changes are allowed but must not collide with another field.",
          additionalProperties: true,
        },
      },
      ["workspace_id", "index", "patch"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/intake/fields", {
        body: {
          workspace_id: ws,
          op: "update",
          index: args.index,
          patch: args.patch,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  // ─── v1.14.0 — booking-form structural primitives ───────────────────────
  //
  // Mirrors v1.13's intake-structure pattern but for the booking form,
  // PLUS a standard-field contract: fullName + email at indices 0/1
  // are server-owned (the renderer + public POST handler require
  // them). Destructive ops on indices 0/1 are rejected.

  {
    name: "get_booking_structure",
    description:
      "Read the workspace's booking event-type + fields (indexed list with type + label + required + 1-line preview). Standard fields (fullName at index 0, email at index 1) are flagged is_standard:true — they're server-owned and cannot be moved/deleted/renamed. Use BEFORE add_booking_field / move_booking_field / delete_booking_field / update_booking_field to find the right index.",
    inputSchema: obj(
      { workspace_id: str("Workspace id.") },
      ["workspace_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("GET", "/workspace/v2/booking/structure", {
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "add_booking_field",
    description:
      "Add ONE field to the booking form (after the standard fullName + email). Field shape: { id, type, label, required?, placeholder?, options? }. Types: text, textarea, email, phone, select. " +
      "Use when the operator wants to capture extra info from bookers — service address, equipment type, preferred technician, party size, etc. ID must be unique within the form (cannot be 'fullName' or 'email' — those are reserved). " +
      "Position defaults to appending at the end. Insert positions must be >= 2 (slots 0/1 are reserved for the standards).",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        field: {
          type: "object",
          description:
            "BookingFormField object: { id (kebab-case, unique, NOT 'fullName'/'email'), type, label, required?, placeholder?, options? for select fields }.",
          additionalProperties: true,
        },
        position: {
          type: "integer",
          description:
            "Optional 0-based insert position. Default: append. Must be >= 2 (0/1 are reserved for standards).",
          minimum: 2,
        },
      },
      ["workspace_id", "field"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/booking/fields", {
        body: {
          workspace_id: ws,
          op: "add",
          field: args.field,
          position: args.position,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "move_booking_field",
    description:
      "Move ONE booking field (extra) to a new position. Splice semantics. Standards (fullName, email at indices 0/1) cannot be moved AND cannot be displaced — both from_index and to_index must be >= 2.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        from_index: { type: "integer", description: "0-based source index. Must be >= 2 (standards locked).", minimum: 2 },
        to_index: { type: "integer", description: "0-based target index in the result. Must be >= 2.", minimum: 2 },
      },
      ["workspace_id", "from_index", "to_index"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/booking/fields", {
        body: {
          workspace_id: ws,
          op: "move",
          from_index: args.from_index,
          to_index: args.to_index,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "delete_booking_field",
    description:
      "Remove ONE booking field (extra). Standards (fullName, email at indices 0/1) cannot be deleted — index must be >= 2. Floor is 'just the 2 standards' (different from intake's 'minimum 1' rule because booking forms always have 2 standards).",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        index: { type: "integer", description: "0-based index. Must be >= 2 (standards locked).", minimum: 2 },
      },
      ["workspace_id", "index"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/booking/fields", {
        body: { workspace_id: ws, op: "delete", index: args.index },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "update_booking_field",
    description:
      "Patch ONE booking field (extra) by index. Patch can include any subset of: id, type, label, required, placeholder, options. Standards (fullName, email) cannot be patched — index must be >= 2. ID changes blocked from colliding with another field OR with reserved standard ids.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        index: { type: "integer", description: "0-based index of the field to patch. Must be >= 2.", minimum: 2 },
        patch: {
          type: "object",
          description:
            "Subset of BookingFormField fields to overwrite. Empty patch is rejected. ID changes blocked from colliding (with another field or with reserved 'fullName'/'email').",
          additionalProperties: true,
        },
      },
      ["workspace_id", "index", "patch"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/booking/fields", {
        body: {
          workspace_id: ws,
          op: "update",
          index: args.index,
          patch: args.patch,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  // ─── v1.15.0 — portal-template structural primitives ────────────────────
  //
  // Composite trees on the customer portal surface, with per-customer
  // embed refs (customer.next_appointment, customer.documents,
  // customer.deals, customer.contact_info, customer.recent_appointments).
  // Same primitive vocabulary as landing — just rendered against a per-
  // customer CustomerRenderContext at request time. Template is stored
  // once on the workspace; every customer sees their own data through it.
  //
  // Operators define the template once via add/update/move/delete.
  // The customer-facing portal route renders the template against
  // each customer's context. preview_portal renders it server-side
  // for visual inspection against any contact.

  {
    name: "get_portal_structure",
    description:
      "Read the workspace's portal template — indexed list of composite-tree sections with previews. Use BEFORE add_portal_section / update_portal_section / move_portal_section / delete_portal_section to find the right index. Empty templates are valid (the portal just shows built-in tabs without a Custom tab).",
    inputSchema: obj(
      { workspace_id: str("Workspace id.") },
      ["workspace_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("GET", "/workspace/v2/portal/structure", {
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "add_portal_section",
    description:
      "Add a composite-tree section to the workspace's portal template. The template renders on every customer's portal — same composite primitive vocabulary as landing (12 node kinds), PLUS 5 customer.* embed refs that pull per-customer data: " +
      "customer.contact_info (name + email + phone), customer.next_appointment (upcoming booking card), customer.recent_appointments (history list), customer.documents (download links), customer.deals (active jobs/deals). " +
      "Read get_block_skill('composite') for the primitive vocabulary + voice rules. Tree root MUST be kind=section. Validation runs (Zod + structural rules + voice scan) same as add_composite_section. " +
      "Typical patterns: WELCOME = section { headline: 'Welcome back', children: [text + customer.contact_info] }. NEXT-APPOINTMENT = section { headline: 'Your next visit', children: [embed: customer.next_appointment, button: book] }. DOCS = section { headline: 'Your documents', children: [embed: customer.documents] }. " +
      "Position is optional — defaults to appending. Use get_portal_structure first if you want to insert between specific sections.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        tree: {
          type: "object",
          description:
            "Composite tree root (kind=section with optional eyebrow/headline/subhead and children). See get_block_skill('composite') for the primitive vocabulary. Customer.* embed refs are valid here.",
          additionalProperties: true,
        },
        position: {
          type: "integer",
          description:
            "Optional 0-based insert position. Default: append at the end.",
          minimum: 0,
        },
      },
      ["workspace_id", "tree"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/portal/section", {
        body: {
          workspace_id: ws,
          op: "add",
          tree: args.tree,
          position: args.position,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "update_portal_section",
    description:
      "Replace the tree of an existing portal-template section. Use to refine ('shorten the welcome', 'add a CTA to the documents section'). Index must exist. Validation runs same as add_portal_section.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        index: { type: "integer", description: "0-based index of the portal section to replace.", minimum: 0 },
        tree: {
          type: "object",
          description: "Replacement tree. Same shape as add_portal_section.",
          additionalProperties: true,
        },
      },
      ["workspace_id", "index", "tree"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/portal/section", {
        body: {
          workspace_id: ws,
          op: "update",
          tree: args.tree,
          index: args.index,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "move_portal_section",
    description:
      "Move ONE portal-template section atomically. Splice semantics: section at from_index removed, then inserted at to_index in the result.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        from_index: { type: "integer", description: "0-based source index.", minimum: 0 },
        to_index: { type: "integer", description: "0-based target index in the result.", minimum: 0 },
      },
      ["workspace_id", "from_index", "to_index"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/portal/section", {
        body: {
          workspace_id: ws,
          op: "move",
          from_index: args.from_index,
          to_index: args.to_index,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "delete_portal_section",
    description:
      "Remove ONE portal-template section. UNLIKE landing's delete_section, leaving 0 portal sections is valid — the portal just shows built-in tabs (Documents, Bookings) without a Custom tab.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        index: { type: "integer", description: "0-based index to delete.", minimum: 0 },
      },
      ["workspace_id", "index"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/portal/section", {
        body: { workspace_id: ws, op: "delete", index: args.index },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "preview_portal",
    description:
      "Render the workspace's portal template against a SPECIFIC contact's data. Returns HTML + CSS so you can visually verify the template before customers see it. Pass contact_id of any contact in the workspace; if the id doesn't belong to this workspace, you get a 404. Use after add_portal_section / update_portal_section to confirm the per-customer embeds resolve correctly with real data.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        contact_id: str("Contact id of an existing customer in this workspace. Use list_contacts to discover ids."),
      },
      ["workspace_id", "contact_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const path = `/workspace/v2/portal/preview?contact_id=${encodeURIComponent(args.contact_id)}`;
      const result = await api("GET", path, { workspace_id: ws });
      return result;
    },
  },

  // ─── v1.17.0 — partner-agency tools (white-label CRM resellers) ─────────
  //
  // Layer-1 in the SF/Agency/Workspace/Customer hierarchy. An agency
  // is a SeldonFrame-paying entity that resells Business OS to SMBs;
  // each SMB gets its own workspace, but the chrome (logo, colors,
  // sender, support pointers) shows the AGENCY's brand instead of
  // SeldonFrame's. Plan-gated: Scale tier ($99) or higher.
  //
  // v1.17 ships the foundational primitives (register agency + attach
  // / detach workspaces). v1.18 adds verified-sender email branding.
  // v1.19 adds management tools (list_my_agencies, update_agency).
  // v1.20 adds the agency's own custom domain.

  {
    name: "register_partner_agency",
    description:
      "Register a partner agency. Used by Scale-tier customers who resell SeldonFrame's Business OS to SMBs (HVAC contractors, dentists, lawyers, realtors) under their OWN brand. Once registered, the agency can attach client workspaces via attach_workspace_to_agency; those workspaces will show the agency's logo / colors / support links instead of SeldonFrame's. " +
      "Plan gate: at least one workspace owned by the caller must be on Scale tier; otherwise the agency is created in 'pending' status and chrome substitution doesn't activate until the upgrade lands. " +
      "Provide name (required) + slug (auto-derived from name if omitted). Optional: logo_url (uploaded image URL), primary_color / accent_color (hex like #5b21b6), support_email + support_url (where the agency's clients go for help — these REPLACE SeldonFrame's docs/Discord pointers in client chrome), hide_powered_by_badge (true to suppress the 'Powered by SeldonFrame' footer on clients' public pages — Scale-tier perk).",
    inputSchema: obj(
      {
        workspace_id: str(
          "Workspace id (any workspace owned by the caller — used to resolve the owning user for the new agency).",
        ),
        name: str("Agency display name (e.g. 'Acme AI'). 2+ chars."),
        slug: str(
          "Optional URL-safe slug. Default: derived from name. Must be unique among non-archived agencies.",
        ),
        logo_url: str("Optional logo URL (https://...). Use upload_workspace_image to host one if needed."),
        primary_color: str("Optional hex color like #5b21b6."),
        accent_color: str("Optional hex color like #a78bfa."),
        support_email: str("Optional. Where the agency's clients email for help."),
        support_url: str("Optional. Where the agency's clients click for docs/help."),
        hide_powered_by_badge: {
          type: "boolean",
          description:
            "Hide the 'Powered by SeldonFrame' footer on the agency's clients' public landing pages. Scale-tier feature.",
        },
      },
      ["workspace_id", "name"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/partner-agencies", {
        body: {
          op: "register",
          name: args.name,
          slug: args.slug,
          logo_url: args.logo_url,
          primary_color: args.primary_color,
          accent_color: args.accent_color,
          support_email: args.support_email,
          support_url: args.support_url,
          hide_powered_by_badge: args.hide_powered_by_badge,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "attach_workspace_to_agency",
    description:
      "Attach a workspace to a partner agency. The workspace's chrome (admin dashboard logo, public landing footer, customer portal branding) flips to the agency's brand. Caller must own BOTH the agency and the workspace. Agency must be in 'active' status (not pending — register first, upgrade if needed).",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (the bearer's workspace; also the workspace to attach)."),
        target_workspace_id: str(
          "Workspace id of the workspace you want to attach to the agency. Often this is the SAME as workspace_id (the workspace running the MCP); for an agency operator with multiple client workspaces, this is the specific client's workspace_id.",
        ),
        agency_id: str("Agency id from register_partner_agency."),
      },
      ["workspace_id", "target_workspace_id", "agency_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/partner-agencies", {
        body: {
          op: "attach",
          workspace_id: args.target_workspace_id,
          agency_id: args.agency_id,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "detach_workspace_from_agency",
    description:
      "Detach a workspace from its current agency. Chrome falls back to SeldonFrame defaults on next render. Either the workspace owner OR the agency owner can detach.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (the bearer's workspace)."),
        target_workspace_id: str("Workspace id to detach (often the same as workspace_id)."),
      },
      ["workspace_id", "target_workspace_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/partner-agencies", {
        body: { op: "detach", workspace_id: args.target_workspace_id },
        workspace_id: ws,
      });
      return result;
    },
  },

  // ─── v1.18.0 — partner-agency sender domain (Resend) ────────────────────

  {
    name: "register_partner_agency_sender_domain",
    description:
      "Register a sender domain for a partner agency so the agency can send transactional emails (welcome, magic-link, portal-access-code) FROM their own domain instead of welcome@seldonframe.com. " +
      "The SeldonFrame backend creates the domain in Resend (under our SF Resend account), and returns the DNS records (SPF, DKIM, MX) the agency must add at THEIR registrar. The agency does NOT need their own Resend account. " +
      "The default sender_local_part is 'welcome' — final sender becomes welcome@<domain>. Override with sender_local_part='hello' to get hello@<domain>. " +
      "After this call: the agency adds the DNS records, waits 5-60 min for propagation, then calls verify_partner_agency_sender_domain. Once Resend confirms verification, the agency's clients' transactional emails switch to the agency's sender automatically.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (the bearer's workspace; used to resolve owning user)."),
        agency_id: str("Agency id from register_partner_agency."),
        domain: str("Domain to send from (e.g. 'acmeai.com'). Without scheme. The agency must control DNS for this domain."),
        sender_local_part: str(
          "Optional local-part of the sender address (default: 'welcome'). Final sender becomes <local>@<domain>.",
        ),
      },
      ["workspace_id", "agency_id", "domain"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/partner-agencies", {
        body: {
          op: "register_sender_domain",
          agency_id: args.agency_id,
          domain: args.domain,
          sender_local_part: args.sender_local_part,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "verify_partner_agency_sender_domain",
    description:
      "Trigger Resend's DNS verification for a partner agency's sender domain. Call this AFTER the agency has added the SPF/DKIM/MX records at their registrar. Returns the current verification status. When status flips to 'verified', the agency's verified_sender_at timestamp is set and chrome substitution kicks in for outbound emails on attached workspaces. Idempotent — safe to call repeatedly while DNS is propagating.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (the bearer's workspace)."),
        agency_id: str("Agency id from register_partner_agency."),
      },
      ["workspace_id", "agency_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/partner-agencies", {
        body: {
          op: "verify_sender_domain",
          agency_id: args.agency_id,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "reorder_landing_sections",
    description:
      "Reorder the sections of a workspace's landing page WITHOUT changing their content. Use when the operator says 'move FAQ to the bottom', 'put services after the about section', 'rearrange so the CTA is below testimonials'. " +
      "Pass `new_order` as the full ordered array of section types as they should appear top-to-bottom. The multiset of types in new_order MUST equal the current landing's section types — no add/remove. Section types include: hero, services-grid, about, mid-cta, faq, testimonials, trust-strip, emergency-strip, service-area, partners, footer (the actual set depends on what's currently on the page). " +
      "Returns the new sections_order on success or validation_errors on failure (missing/extra types, duplicates). For content edits use update_landing_section. To regenerate a block's content use regenerate_block. To get the current order, fetch the workspace's landing or call regenerate_block (which exposes block names) — most landing pages start as: hero → services → about → faq → mid-cta.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        new_order: {
          type: "array",
          description:
            "Ordered array of section type strings. Must contain EVERY section type currently on the landing page, exactly once each. Example: [\"hero\", \"services-grid\", \"about\", \"mid-cta\", \"faq\"].",
          items: { type: "string" },
        },
      },
      ["workspace_id", "new_order"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/workspace/v2/landing/reorder", {
        body: { workspace_id: ws, new_order: args.new_order },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "upload_workspace_image",
    description:
      "Upload an image to a workspace and apply it to one of two slots: 'logo' (replaces organizations.theme.logoUrl, surfaces in header / footer / og-image / favicon) or 'hero_background' (replaces the hero section's background image and re-renders the landing page). " +
      "Use when the operator says 'use this as my logo', 'replace the hero image with this photo', 'change the header logo'. " +
      "PICK ONE source — the others are mutually exclusive: " +
      "(a) `image_url` (PREFERRED, v1.10.1+) — public HTTPS URL to the image. The SF backend fetches it directly. Best path for Cloudinary, Unsplash, S3, or any image already on the web. file_name + content_type are auto-derived from the URL — you don't need to pass them. " +
      "(b) `local_file_path` (v1.10.1+) — absolute path on the operator's machine. The MCP server (running locally) reads the file and forwards bytes to the backend. Best path for files on the operator's desktop. file_name + content_type derived from the path. " +
      "(c) `image_data_b64` (legacy v1.10.0) — image bytes base64-encoded. Use only when you've generated bytes yourself (e.g. dynamic image gen) and there's no URL or path. Be aware: the encoded string consumes your tool-call token budget; for files >~12 KB raw, prefer (a) or (b). " +
      "Max 5 MB across all paths. Allowed types: image/png, image/jpeg, image/webp, image/svg+xml, image/gif. " +
      "v1.59.2 — for local_file_path and image_data_b64, the MCP server sniffs the actual bytes (magic numbers / SVG root tag) before uploading anything; a file that isn't a recognized image format is rejected locally and never reaches the network. This tool cannot be used to exfiltrate arbitrary local files under an image_url. " +
      "Returns the public Blob URL on success; that URL is now live on the workspace's public surface within seconds. " +
      "Antifragile design: server only validates file shape + applies URL to the right column. Your LLM picks which slot ('they said logo, that maps to slot=logo'). As you get better at intent-mapping, the harness doesn't change.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        slot: str(
          "Image slot: 'logo' (workspace logo, used in header/footer/og-image) or 'hero_background' (hero section background image). Other slots may be added in future versions.",
        ),
        image_url: str(
          "Public HTTPS URL to the image. PREFERRED source. SF backend fetches directly (no base64 round-trip). file_name + content_type auto-derived. https:// only; loopback / private / link-local IPs rejected.",
        ),
        local_file_path: str(
          "Absolute path to a file on the operator's machine (the MCP server runs there). MCP reads the file and forwards bytes to the backend. file_name + content_type auto-derived from the path. Use when the operator gives you a local file rather than a URL.",
        ),
        image_data_b64: str(
          "Image bytes, base64-encoded. LEGACY path — prefer image_url or local_file_path because base64 consumes your tool-call token budget. Max 5 MB after decoding.",
        ),
        file_name: str(
          "Optional filename (auto-derived from image_url or local_file_path). REQUIRED with image_data_b64.",
        ),
        content_type: str(
          "Optional MIME type (auto-derived from image_url or local_file_path extension). REQUIRED with image_data_b64. Must be one of: image/png, image/jpeg, image/webp, image/svg+xml, image/gif.",
        ),
      },
      ["workspace_id", "slot"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;

      // Resolve to ONE source. Reject ambiguous + missing input early so
      // the agent gets a clean error rather than a server-side 400.
      const sourceCount =
        (args.image_url ? 1 : 0) +
        (args.local_file_path ? 1 : 0) +
        (args.image_data_b64 ? 1 : 0);
      if (sourceCount === 0) {
        throw new Error(
          "upload_workspace_image: provide ONE of image_url, local_file_path, or image_data_b64.",
        );
      }
      if (sourceCount > 1) {
        throw new Error(
          "upload_workspace_image: provide ONE of image_url, local_file_path, or image_data_b64 — not multiple.",
        );
      }

      const body = {
        workspace_id: ws,
        slot: args.slot,
      };

      if (args.image_url) {
        body.image_url = args.image_url;
        if (args.file_name) body.file_name = args.file_name;
        if (args.content_type) body.content_type = args.content_type;
      } else if (args.local_file_path) {
        // Read the file in the MCP-client process. Path is absolute (per
        // the schema). Reject obvious dir-traversal — readFileSync would
        // succeed on any readable file but operators expect file paths,
        // not directories.
        const filePath = args.local_file_path;
        if (!path.isAbsolute(filePath)) {
          throw new Error(
            `upload_workspace_image: local_file_path must be absolute. Got: ${filePath}`,
          );
        }
        let buf;
        try {
          buf = readFileSync(filePath);
        } catch (err) {
          throw new Error(
            `upload_workspace_image: failed to read local_file_path "${filePath}" — ${err?.message ?? err}`,
          );
        }
        // v1.59.2 — this is the local-file-read path (the MCP server reads
        // whatever absolute path it's given). Enforce the size cap and
        // sniff the actual bytes BEFORE they're base64'd and sent anywhere,
        // so this tool can only ever upload real images — not an
        // agent-mediated read of an arbitrary local file.
        if (buf.length > 5 * 1024 * 1024) {
          return {
            ok: false,
            error: "file_too_large",
            message: `upload_workspace_image: "${filePath}" is ${buf.length} bytes, over the 5MB max.`,
          };
        }
        if (sniffImageKind(buf) === null) {
          return {
            ok: false,
            error: "not_an_image",
            message:
              "Not a recognized image file (png, jpeg, gif, webp, svg). This tool only uploads images.",
          };
        }
        // Derive file_name + content_type from the path extension, mirroring
        // the server-side image_url logic so the two paths feel identical
        // to the operator.
        const baseName = path.basename(filePath);
        const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
        const extToContentType = {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
          svg: "image/svg+xml",
        };
        const derivedContentType = extToContentType[ext] ?? null;
        body.image_data_b64 = buf.toString("base64");
        body.file_name = args.file_name || baseName;
        body.content_type = args.content_type || derivedContentType || "";
        if (!body.content_type) {
          throw new Error(
            `upload_workspace_image: could not infer content_type from extension "${ext}" — pass content_type explicitly. Allowed: image/png, image/jpeg, image/webp, image/svg+xml, image/gif.`,
          );
        }
      } else {
        // image_data_b64 — caller supplied bytes directly.
        if (!args.file_name || !args.content_type) {
          throw new Error(
            "upload_workspace_image: file_name and content_type are required with image_data_b64. (image_url and local_file_path auto-derive them.)",
          );
        }
        // v1.59.2 — same bytes-in, sniff-before-send discipline as the
        // local_file_path branch above (this tool only uploads images,
        // regardless of which of the three sources supplied the bytes).
        let decoded;
        try {
          decoded = Buffer.from(args.image_data_b64, "base64");
        } catch (err) {
          return {
            ok: false,
            error: "invalid_base64",
            message: `upload_workspace_image: image_data_b64 could not be decoded — ${err?.message ?? err}`,
          };
        }
        if (decoded.length > 5 * 1024 * 1024) {
          return {
            ok: false,
            error: "file_too_large",
            message: `upload_workspace_image: decoded image_data_b64 is ${decoded.length} bytes, over the 5MB max.`,
          };
        }
        if (sniffImageKind(decoded) === null) {
          return {
            ok: false,
            error: "not_an_image",
            message:
              "Not a recognized image file (png, jpeg, gif, webp, svg). This tool only uploads images.",
          };
        }
        body.image_data_b64 = args.image_data_b64;
        body.file_name = args.file_name;
        body.content_type = args.content_type;
      }

      const result = await api("POST", "/workspace/v2/images", {
        body,
        workspace_id: ws,
      });
      return result;
    },
  },

  // ─── v1.6.0 — brain layer (Karpathy LLM-Wiki) ───────────────────────────
  //
  // Two-layer brain stored as a file-tree of markdown notes:
  //   - Layer 1 (workspace): notes about THIS workspace's customers, voice,
  //     pipeline patterns, learnings. Reads cost 0 LLM tokens server-side
  //     (the IDE agent's LLM consumes them as context).
  //   - Layer 2 (global): cross-workspace patterns, anonymized. The weekly
  //     cron promotes high-confidence workspace notes that appear in 3+
  //     workspaces.
  //
  // Use these tools BEFORE generating a block to give the IDE agent's
  // LLM workspace-specific + vertical-specific context. Use them AFTER
  // a successful interaction to write back what worked.

  {
    name: "read_brain_path",
    description:
      "Read a single brain note from the workspace's layer-1 brain. Returns the body (markdown), confidence (0-1), uses (times read), wins (times the consuming interaction was successful), and metadata. Reading a note increments its `uses` counter — that's how the feedback loop knows the note has been consumed. Use BEFORE generating blocks: check for relevant entries (voice/copy-that-works.md, customers/recurring.md, learnings.md) so your generation reflects what's been observed about this workspace.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        path: str(
          "Note path. Examples: voice/copy-that-works.md, customers/recurring.md, pipeline/closed-won-patterns.md, learnings.md.",
        ),
      },
      ["workspace_id", "path"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/brain", {
        body: { op: "read", path: args.path },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "list_brain_dir",
    description:
      "List brain notes in the workspace's layer-1 brain. Returns metadata + a 120-char body preview per note (full body requires read_brain_path). Use to discover what the brain knows about this workspace before generating blocks. Pass `prefix` to filter by directory (e.g. 'voice/' returns voice-related notes only). Notes are returned sorted by confidence descending.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        prefix: str(
          "Optional path prefix to filter (e.g. 'voice/', 'customers/'). Omit for all notes.",
        ),
      },
      ["workspace_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/brain", {
        body: { op: "list", prefix: args.prefix ?? undefined },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "write_brain_note",
    description:
      "Write a brain note to the workspace's layer-1 brain. Use to capture insights the operator volunteers ('walk-ins on Saturday convert 3× better', 'don't ever say synergy in the copy', 'most leads come in via Instagram'). The note is REPLACED on subsequent writes to the same path; for append-style writes use `append: true`. Source field is recorded so the cron can attribute promotions correctly.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        path: str(
          "Note path. Convention: <category>/<topic>.md. Examples: customers/recurring.md, voice/copy-that-works.md, learnings.md, ops/saturday-rush.md.",
        ),
        body: str(
          "Markdown body of the note. Concrete, specific, observation-based. Avoid generalities.",
        ),
        append: {
          type: "boolean",
          description:
            "When true, prepend the body as a new dated paragraph to the existing note (preserves history). When false (default), replaces the existing body.",
        },
        type: str(
          "Optional note type for filtering: 'pattern' | 'fact' | 'preference' | 'warning' | 'playbook' | 'anti-pattern'.",
        ),
        tags: {
          type: "array",
          description: "Optional tags for filtering.",
          items: { type: "string" },
        },
      },
      ["workspace_id", "path", "body"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const op = args.append ? "append" : "write";
      const payload = {
        op,
        path: args.path,
        metadata: {
          source: "operator:claude-code",
          type: args.type ?? undefined,
          tags: args.tags ?? undefined,
        },
      };
      if (op === "append") payload.paragraph = args.body;
      else payload.body = args.body;
      const result = await api("POST", "/brain", {
        body: payload,
        workspace_id: ws,
      });
      return result;
    },
  },

  // ─── v1.7.0 — magic-link device-flow auth ──────────────────────────────
  //
  // Use connect_workspace when the operator wants to ADMIN AN EXISTING
  // workspace from a NEW device/IDE. The flow:
  //   1. operator: "connect me to my iron-oak-barbershop workspace,
  //      my email is marc@ironoak.ca"
  //   2. tool calls /api/v1/auth/initiate, gets atok + emails operator
  //   3. operator opens email, clicks the magic link
  //   4. browser approval page renders (workspace + device label),
  //      operator clicks "Yes, authorize"
  //   5. tool's internal poll resolves, gets a fresh workspace bearer,
  //      stores it locally + sets as default workspace
  //
  // For NEW workspaces (no existing slug), use create_workspace_v2
  // which mints a bearer at creation time and doesn't need a magic link.

  {
    name: "connect_workspace",
    description:
      "Connect this device/IDE to an EXISTING SeldonFrame workspace via magic-link email. Use when the operator already has a workspace (e.g. created from another device) and wants to admin it from this Claude Code / Cursor / Windsurf session. Sends a confirmation email with a one-click approval link; the tool polls until approval (5-min timeout) then stores the workspace bearer locally. For brand-new workspaces, use create_workspace_v2 instead.",
    inputSchema: obj(
      {
        workspace_slug: str(
          "Workspace slug (the subdomain prefix). Example: 'iron-oak-barbershop' for iron-oak-barbershop.app.seldonframe.com.",
        ),
        email: str(
          "Operator's email — must match an email associated with the workspace owner. Magic link is sent here.",
        ),
        device_label: str(
          "Optional human-readable label shown to the operator on the approval page so they can verify they're authorizing the right device. Defaults to a hostname-based label.",
        ),
      },
      ["workspace_slug", "email"],
    ),
    handler: async (args) => {
      const deviceLabel = args.device_label?.trim() || defaultDeviceLabel();

      // Step 1: initiate. Anonymous endpoint; no bearer required.
      const initiateRes = await fetch(`${API_INFO.base}/auth/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": `seldonframe-mcp/${VERSION}`,
        },
        body: JSON.stringify({
          workspace_slug: args.workspace_slug,
          email: args.email,
          device_label: deviceLabel,
        }),
      });
      const initiateBody = await initiateRes.json().catch(() => ({}));
      if (!initiateRes.ok || !initiateBody.ok) {
        throw new Error(
          `connect_workspace: initiate failed (${initiateRes.status}): ${initiateBody.error ?? initiateRes.statusText}`,
        );
      }

      const { atok, approval_url, expires_at, workspace } = initiateBody;

      // Step 2: poll until approved or expired. 2-second cadence,
      // 5-minute total budget (the atok TTL on the server).
      const POLL_INTERVAL_MS = 2000;
      const POLL_BUDGET_MS = 5 * 60 * 1000;
      const start = Date.now();
      let token = null;
      let workspaceId = null;
      let lastStatus = "pending";
      while (Date.now() - start < POLL_BUDGET_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const checkRes = await fetch(
          `${API_INFO.base}/auth/check?atok=${encodeURIComponent(atok)}`,
          {
            headers: { "User-Agent": `seldonframe-mcp/${VERSION}` },
          },
        );
        const checkBody = await checkRes.json().catch(() => ({}));
        lastStatus = checkBody.status ?? "pending";
        if (lastStatus === "pending") continue;
        if (lastStatus === "approved" && checkBody.token) {
          token = checkBody.token;
          workspaceId = checkBody.workspace_id;
          break;
        }
        // Terminal failure.
        return {
          ok: false,
          status: lastStatus,
          error:
            lastStatus === "rejected"
              ? `You (or someone with access to ${args.email}) clicked "No, this wasn't me" on the approval page. The connection was not authorized.`
              : lastStatus === "expired"
                ? `The approval link expired before being clicked. Run connect_workspace again to get a fresh link.`
                : lastStatus === "already_claimed"
                  ? `This authorization was already claimed by another session — the bearer can only be issued once.`
                  : `Authorization failed with status: ${lastStatus}`,
          approval_url,
        };
      }

      if (!token) {
        return {
          ok: false,
          status: lastStatus,
          error: `Authorization timed out after 5 minutes. The link is still valid — open the email and click "Authorize", or run connect_workspace again to get a fresh one.`,
          approval_url,
          expires_at,
        };
      }

      // Step 3: store the bearer locally + set as default workspace.
      rememberWorkspace({
        workspace_id: workspaceId,
        bearer_token: token,
      });

      return {
        ok: true,
        connected: {
          workspace_id: workspaceId,
          slug: workspace.slug,
          name: workspace.name,
          device_label: deviceLabel,
          public_url: `https://${workspace.slug}.app.seldonframe.com/`,
        },
        message: `Connected ${deviceLabel} to ${workspace.name}. You can now run any workspace tool (list_contacts, persist_block, customize_block, etc.) and it will act on this workspace by default.`,
      };
    },
  },

  // ─── v1.8.0 — custom domains (paying tiers) ─────────────────────────────
  //
  // Operators on Growth ($29) or Scale ($99) can route their own
  // hostnames (joescuts.com, ironandoak.ca, etc.) to their workspace.
  // Free-tier workspaces stay on <slug>.app.seldonframe.com.
  //
  // Flow:
  //   1. add_custom_domain → registers with Vercel, returns DNS record
  //      to add at the operator's registrar.
  //   2. operator adds the CNAME / A record at Cloudflare / Namecheap /
  //      etc.
  //   3. verify_domain → polls Vercel, returns verified once DNS resolves.
  //      Vercel auto-provisions SSL via Let's Encrypt.
  //   4. Subsequent traffic routes to the workspace automatically (proxy
  //      checks workspace_domains FIRST before subdomain extraction).

  {
    name: "add_custom_domain",
    description:
      "Add a custom hostname (e.g. 'joescuts.com', 'www.joescuts.com', 'bookings.joescuts.com') to the workspace. PAID FEATURE — requires Growth ($29/mo) or Scale ($99/mo); returns 402 upgrade_required on free tier. Returns DNS instructions the operator needs to add at their registrar (Cloudflare, Namecheap, GoDaddy, etc.). Once DNS propagates (typically 5min - 24h), call verify_domain to mark verified + enable routing. Vercel auto-provisions SSL once DNS resolves.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        hostname: str(
          "Hostname to register, lowercased and without scheme. Examples: 'joescuts.com', 'www.joescuts.com', 'shop.joescuts.com'.",
        ),
      },
      ["workspace_id", "hostname"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/domains", {
        body: { op: "add", hostname: args.hostname },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "verify_domain",
    description:
      "Re-check DNS for a previously-added custom domain. Returns { verified: true } once Vercel sees the correct DNS record AND issues SSL — usually 5 minutes after the operator adds the CNAME / A record at their registrar, sometimes up to 24 hours depending on TTL. Returns { verified: false, recommended_records } when DNS still hasn't propagated; surface those recommendations to the operator so they can fix their registrar config.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        hostname: str("The hostname to re-verify (must already be added)."),
      },
      ["workspace_id", "hostname"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/domains", {
        body: { op: "verify", hostname: args.hostname },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "list_workspace_domains",
    description:
      "List all custom domains registered to the workspace. Returns hostname, status (pending / verified / failed), DNS verification record, and primary flag for each. Allowed on all tiers — free workspaces will see an empty list since custom domains require a paid tier.",
    inputSchema: obj({ workspace_id: str("Workspace id.") }, ["workspace_id"]),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/domains", {
        body: { op: "list" },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "remove_workspace_domain",
    description:
      "Remove a custom domain from the workspace. Routes immediately stop responding for the removed hostname; SSL cert is preserved on Vercel for 30 days in case the operator wants to re-add it. Idempotent — no error if the domain was already removed.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id."),
        hostname: str("Hostname to remove."),
      },
      ["workspace_id", "hostname"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/domains", {
        body: { op: "remove", hostname: args.hostname },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "list_brain_patterns",
    description:
      "List layer-2 cross-workspace patterns. These are anonymized insights the cron has promoted from workspaces that all observed the same thing (3+ workspaces, confidence >= 0.7). Use BEFORE generating blocks for a vertical-specific business — patterns/by-vertical/<vertical>.md gives you observations across every other workspace in that vertical. Compounding moat: each new workspace's interactions feed back into these patterns over time.",
    inputSchema: obj(
      {
        workspace_id: str(
          "Workspace id (used for auth; the patterns themselves are global).",
        ),
        vertical: str(
          "Optional vertical filter: 'barbershop' | 'hvac' | 'legal' | 'restaurant' | etc. Returns patterns/by-vertical/<vertical>/* notes only.",
        ),
        block_type: str(
          "Optional block-type filter: 'hero' | 'services' | 'faq' | etc. Returns patterns/by-block-type/<type>/* notes only.",
        ),
      },
      ["workspace_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/brain", {
        body: {
          op: "list_patterns",
          vertical: args.vertical ?? undefined,
          block_type: args.block_type ?? undefined,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  // ── v1.26 — agent foundation ────────────────────────────────────────────
  // Build agents (web chat / voice / SMS / email) on top of Soul + Brain.
  // BYOK: operators bring their own LLM key (Anthropic / OpenAI) — they
  // pay LLM bills directly to the provider. SF makes money per agent
  // turn (separate billing). configure_llm_provider sets the key;
  // create_agent registers a new agent draft; list_agents shows the
  // workspace's agents.

  {
    name: "configure_llm_provider",
    description:
      "USE WHEN USER SAYS: 'set up Anthropic key for my agents', 'add my OpenAI key', 'configure BYOK for agents', 'why is my chatbot saying it's not configured?' " +
      "FIRST-RUN setup BEFORE create_agent. Sets the LLM API key for this workspace's agents (BYOK — Bring Your Own Key). " +
      "The OPERATOR pays the LLM provider directly (Anthropic / OpenAI / etc.); SF charges separately for agent platform usage. " +
      "Stored encrypted at rest using the deployment's ENCRYPTION_KEY. " +
      "Operators get keys from console.anthropic.com (recommended for v1.26.x — best tool-use support) or platform.openai.com. " +
      "v1.28+ AUTO-DETECT: pass api_key='env' (or omit api_key entirely) to read process.env.ANTHROPIC_API_KEY / OPENAI_API_KEY from the MCP server's own environment. " +
      "v1.59.2 — CONSENT REQUIRED before storing an env-detected key: ask the user first ('I found an Anthropic key in your environment — OK to store it in your SeldonFrame workspace?'), then re-call with confirm_store_env_key: true. Without that flag, this tool reports the env var it found and stops — it does NOT transmit the value. A key passed explicitly via api_key is consent by definition and is never gated. Returns { ok: false, error: 'no_env_key' } if the env var isn't set; in that case the user must paste the key explicitly. " +
      "Skip if the workspace already has a key — agents fail-graceful with 'I'm not set up yet' if no key configured, so a 'not configured' chatbot response means CALL THIS TOOL.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        provider: {
          type: "string",
          enum: ["anthropic", "openai"],
          description:
            "LLM provider. v1.26 ships full Anthropic support (tool use, streaming-ready). OpenAI support for chat is partial — recommend Anthropic for production agents.",
        },
        api_key: str(
          "API key. Anthropic keys start with 'sk-ant-...'. Stored encrypted; never echoed back. v1.28+ AUTO-DETECT: pass 'env' (literal string) or omit entirely to read process.env.{ANTHROPIC,OPENAI}_API_KEY from the MCP server's local environment (subject to the confirm_store_env_key consent gate below). Passing the key explicitly here IS consent — it's never gated.",
        ),
        confirm_store_env_key: {
          type: "boolean",
          description:
            "Set true ONLY after the user has explicitly confirmed storing the API key found in this machine's environment variables in their SeldonFrame workspace.",
        },
      },
      ["workspace_id", "provider"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      let apiKey = args.api_key;

      // v1.28 — auto-detect from MCP server's local environment.
      // Triggered by: omitted api_key, empty string, or literal 'env'.
      const wantsEnv = !apiKey || apiKey === "env" || apiKey === "$ENV";
      if (wantsEnv) {
        const envName =
          args.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
        apiKey = process.env[envName];
        if (!apiKey) {
          return {
            ok: false,
            error: "no_env_key",
            hint:
              `${envName} not set in the MCP server's environment. ` +
              `Either: (a) set ${envName} in your shell before launching Claude Code (most Claude Code users already have this), ` +
              `or (b) pass api_key='sk-ant-...' explicitly. ` +
              `For platform-deployment scenarios where keys differ per workspace (e.g. agency managing multiple HVAC clients with separate Anthropic billing), always pass api_key explicitly — env auto-detect is for solo-operator convenience.`,
            envName,
          };
        }
        // v1.59.2 — CONSENT GATE. Finding a key in the environment is not
        // the same as the operator agreeing to store it server-side.
        // Without explicit confirm_store_env_key: true, stop here and
        // tell the agent to go get consent — never transmit the value.
        if (args.confirm_store_env_key !== true) {
          return {
            ok: true,
            needs_consent: true,
            env_var_found: envName,
            message:
              `Found ${envName} in the environment. SeldonFrame can store this key in the workspace (server-side, used only to power the hosted chatbot/agent). ` +
              `Ask the user for permission first, then re-call this tool with confirm_store_env_key: true.`,
          };
        }
      }

      const result = await api("POST", "/agents", {
        body: {
          op: "set_llm_key",
          provider: args.provider,
          api_key: apiKey,
        },
        workspace_id: ws,
      });
      // v1.28 — annotate the response so the LLM knows whether env was used
      // (so it can tell the user 'I auto-detected your key from your shell env'
      // vs 'I saved the key you provided').
      if (result && typeof result === "object" && result.ok) {
        return { ...result, source: wantsEnv ? "env_inherited" : "explicit" };
      }
      return result;
    },
  },

  {
    name: "create_agent",
    description:
      "USE WHEN USER SAYS: 'add a chatbot to my website', 'add an AI assistant to my landing page', 'put a chat widget on my site', 'create a website chatbot', 'add an AI agent that answers customer questions', 'I want chat on my homepage', 'build me a chatbot for [business]'. " +
      "DON'T confuse with: list_blocks (chat widgets are NOT a block type — agents are a separate primitive); send_conversation_turn (that's for inbound SMS/email auto-reply, NOT a website widget); generate_agent (for an agent that ACTS on bookings/leads/a schedule — review requester, speed-to-lead, follow-up — use generate_agent instead; THIS tool only builds a website chat widget with no trigger). If the operator wants chat on their website, THIS is the tool. " +
      "Creates a new agent for this workspace. Agents are conversational interfaces (web chat, voice, SMS) that answer FAQs, book appointments, and escalate to humans — composed from typed primitives + the workspace's Soul (industry, voice, services). " +
      "WHAT GETS COMPOSED AUTOMATICALLY: persona derived from soul.industry + soul.voice; FAQ knowledge from your `faq` array; pricing facts from `pricing_facts` (validators block any $-amount the agent invents that's not in this list); typed tools (look_up_availability, book_appointment, find_my_existing_appointment, escalate_to_human, provide_faq_answer). " +
      "WHAT YOU PROVIDE: name, archetype (website-chatbot for v1.26.x+; voice-receptionist + sms-followup-bot queued), channel (web_chat / voice / sms / email), inline FAQ pairs, allowed pricing facts, optional greeting. " +
      "STATUS LIFECYCLE: created in 'draft' (not callable). Flip to 'test' to chat with it in sandbox. Flip to 'live' once you're confident — v1.26.2+ eval-gates 'live' until 8-scenario suite passes ≥87.5%. " +
      "SAFETY: response validators run on every turn — quotes_only_from_soul_pricing (critical, blocks hallucinated $X), no_prompt_injection_echo (critical), no_pii_leak (critical), no_avoid_words (warning), response_length_under_cap (warning). Critical fail = agent says 'let me check + escalate' instead of sending the bad response. " +
      "OUTPUT: the agent's embed URL (one-line <script> for the operator's website) and turn URL (POST endpoint for direct API integration). Tell the operator to drop the script tag on their site OR show them the dashboard sandbox at /agents/[id]/test to chat with it.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        name: str(
          "Agent display name (e.g. 'Cypress HVAC Assistant'). Surfaces in the chat header.",
        ),
        archetype: {
          type: "string",
          enum: ["website-chatbot", "voice-receptionist", "sms-followup-bot"],
          description:
            "Agent shape. v1.26.x ships website-chatbot with full feature support; voice-receptionist + sms-followup-bot are queued for v1.27/v1.28.",
        },
        channel: {
          type: "string",
          enum: ["web_chat", "voice", "sms", "email"],
          description:
            "Delivery channel. v1.26.x ships web_chat only (embed.js bubble). Other channels queued.",
        },
        faq: {
          type: "array",
          description:
            "Operator-curated FAQ pairs. Each item is { q: string, a: string }. The agent has these in its system prompt; visitors get answers without an LLM round-trip when the question is a clear match. v1.27 adds vector RAG over uploaded docs.",
          items: obj(
            {
              q: str("Question as a visitor would phrase it."),
              a: str("Operator's exact answer (1-3 sentences)."),
            },
            ["q", "a"],
          ),
        },
        pricing_facts: {
          type: "array",
          description:
            "ONLY prices the agent may quote. Validators block any $-amount in the agent's response that's not in this list (or doesn't match exactly). If you want the agent to refuse all price questions, omit this. Each item: { label: string, amount: number, currency: 'USD' | etc. }",
          items: obj(
            {
              label: str("Service name (e.g. 'Furnace tune-up')."),
              amount: { type: "number" },
              currency: str("3-letter currency code, e.g. USD."),
            },
            ["label", "amount", "currency"],
          ),
        },
        greeting: str(
          "Optional first message shown when the chat opens (default: 'Hi! How can I help you today?').",
        ),
        capabilities: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional explicit subset of typed tools the agent may call. Default: all five (look_up_availability, book_appointment, find_my_existing_appointment, escalate_to_human, provide_faq_answer). Restrict if you want a read-only agent (omit book_appointment) or a no-escalation agent (omit escalate_to_human).",
        },
      },
      ["workspace_id", "name", "archetype", "channel"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/agents", {
        body: {
          op: "create",
          name: args.name,
          archetype: args.archetype,
          channel: args.channel,
          faq: args.faq ?? undefined,
          pricing_facts: args.pricing_facts ?? undefined,
          greeting: args.greeting ?? undefined,
          capabilities: args.capabilities ?? undefined,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "list_agents",
    description:
      "USE WHEN USER SAYS: 'show me my agents', 'which chatbots do I have', 'list agents in this workspace', 'is the HVAC chatbot live yet?'. " +
      "Lists all agents in the workspace with status (draft/test/live/paused), version, daily token usage vs budget, and metadata. Use to find an agent_id before calling publish_agent / update_agent_blueprint / get_agent_metrics, or to audit which agents are live across a workspace.",
    inputSchema: obj(
      { workspace_id: str("Workspace id (bearer workspace).") },
      ["workspace_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/agents", {
        body: { op: "list" },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "publish_agent",
    description:
      "USE WHEN USER SAYS: 'put my chatbot live', 'enable the agent', 'switch agent to test mode', 'pause the chatbot', 'go live with the assistant', 'turn off the chatbot temporarily'. " +
      "Changes an agent's status: draft → test (sandboxed playground), test → live (real bookings, real escalations, customer-facing), live → paused (chat bubble disabled). " +
      "EVAL GATE (v1.26.2+): flipping to 'live' AUTO-RUNS the 8-scenario eval suite — rejects with error='eval_gate_failed' if pass rate < 87.5%. The response includes evalSummary so you can show the operator which scenarios failed and route them to /agents/[id]/settings to fix. Use { force: true } to bypass (logged; SF emergencies only).",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        agent_id: str("Agent id from create_agent."),
        status: {
          type: "string",
          enum: ["draft", "test", "live", "paused"],
          description: "Target status.",
        },
      },
      ["workspace_id", "agent_id", "status"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/agents", {
        body: { op: "publish", agent_id: args.agent_id, status: args.status },
        workspace_id: ws,
      });
      return result;
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // v1.57.0 — DEPLOY-TO-SELL. The self-serve deployment verb: take a
  // builder-owned template (or a purchased marketplace listing) and turn
  // it into a REAL, answering agent — one call, idempotent, resumable
  // across the human-only connect steps (calendar OAuth / phone number).
  // This is the money moment: a builder goes from "I built an agent" to
  // "I'm earning from it" without leaving the IDE except for the one-time
  // OAuth/Twilio connect screen the wizardUrl points at.
  // ───────────────────────────────────────────────────────────────────────

  {
    name: "deploy_agent",
    description:
      "USE WHEN USER SAYS: 'deploy this agent', 'go live with my template', 'sell this agent — get it answering', 'launch the receptionist I built', 'turn my template into a real number', 'ship this to a client'. " +
      "Deploys a self-built template (source.template_id) or an installed marketplace listing (source.listing_slug) into a REAL, answering agent for THIS workspace — the deploy-to-sell / earn moment, not just a build step. Idempotent: calling it again for the same source resumes the same deployment instead of creating a duplicate. " +
      "RESUMABLE TWO-STEP FLOW — read the `status` field: " +
      "• status='needs_connect' → NOT live yet. `requirements`/`missing` list what's unmet (calendar OAuth, another connector, a phone number, business info) and `wizardUrl` is a ONE-TIME human-only link (calendar OAuth + Twilio number can't be done by an agent). Relay it verbatim: 'Open this once to connect your calendar / phone number: <wizardUrl>' — then, once the human confirms they've done it, call deploy_agent again with the SAME source (and `phone` if the agent needs a number) to proceed. " +
      "• status='live' → deployed and answering right now. Tell the operator the number (if any) is live and taking real calls/bookings — this is revenue-generating, not a sandbox. " +
      "• status='disabled' → the deploy verb isn't enabled for this environment yet. " +
      "PHONE: only required when the template needs a number and none is attached yet — pass phone={mode:'forward', number:'+1...'} to forward an existing line, or phone={mode:'provision', area_code:'512'} to buy a new Twilio number (requires the workspace's own Twilio creds — surfaced as a `telephony` requirement if missing). " +
      "Exactly one of source.template_id / source.listing_slug is required — template_id for something you built with create_agent-style tools in THIS workspace, listing_slug for a marketplace agent you're installing to run for a client.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        source: {
          type: "object",
          description:
            "Exactly one of template_id (a template this workspace built) or listing_slug (a published marketplace listing to install-and-deploy).",
          properties: {
            template_id: str("Id of an agent_templates row owned by this workspace."),
            listing_slug: str("Slug of a published marketplace listing (kind='agent') to clone in and deploy."),
          },
        },
        phone: {
          type: "object",
          description:
            "Only needed when deploy_agent (or an earlier call) reported a 'telephony' requirement and no number is attached yet. Pass ONE mode.",
          properties: {
            mode: {
              type: "string",
              enum: ["forward", "provision"],
              description: "'forward' = point an existing number at the agent; 'provision' = buy a new Twilio number.",
            },
            number: str("E.164 phone number to forward, e.g. '+15125550148'. Required when mode='forward'."),
            area_code: str("3-digit US/NANP area code to provision a new number in, e.g. '512'. Required when mode='provision'."),
          },
        },
      },
      ["workspace_id", "source"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const source = args.source ?? {};
      const body = {
        source: {
          ...(source.template_id ? { templateId: source.template_id } : {}),
          ...(source.listing_slug ? { listingSlug: source.listing_slug } : {}),
        },
      };
      if (args.phone?.mode === "forward") {
        body.phone = { mode: "forward", number: args.phone.number };
      } else if (args.phone?.mode === "provision") {
        body.phone = { mode: "provision", areaCode: args.phone.area_code };
      }
      const result = await api("POST", "/build/deploy", {
        body,
        workspace_id: ws,
      });
      return result;
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // v1.60.0 — GENERATE. Build an agent from ONE plain-English sentence. This
  // is the front door for anything that DOES something on an event/schedule
  // (review requester, speed-to-lead, after-hours receptionist) — a real,
  // event-firing agent (trigger + skill + guardrails), not a website widget.
  // Wires POST /api/v1/agents/generate → the same deterministic generator
  // (parseAgentIntent → assembleAgentBundle, LLM-classify optional and
  // fail-soft) the Studio dashboard uses. Returns a template_id; the next
  // step is ALWAYS deploy_agent to make it live and firing.
  // ───────────────────────────────────────────────────────────────────────

  {
    name: "generate_agent",
    description:
      "USE WHEN USER SAYS: 'create a google review requester for my dentist office', 'text new leads instantly', 'build a speed-to-lead texter', 'set up an after-hours receptionist', 'make an agent that follows up after every booking'. " +
      "Build a working AI agent from a plain-English description. It classifies the intent and assembles a deployable agent — trigger (e.g. fires on booking.completed or lead.created, or answers inbound calls/chats) + skill (the playbook it follows) + guardrails (quiet hours, rate caps, safety rubric) — all wired automatically, no manual configuration. " +
      "Returns a template_id — then call deploy_agent with { source: { template_id } } to make it live and firing on its trigger (e.g. after every booking, or the instant a new lead arrives). " +
      "USE THIS (not create_agent) for ANY agent that DOES something on an event or a schedule — a review request after a job, an instant reply to a new lead, a scheduled recap. create_agent is ONLY for a website chat widget with no trigger. " +
      "Delivery note: a freshly generated event-outbound agent (review-requester / speed-to-lead) defaults to EMAIL so it can send a real message today without the workspace connecting a phone number first (see `warnings` in the response); mention texting/SMS explicitly in your description if you want it to try SMS instead — full delivery still needs the workspace's own Twilio connected, surfaced by deploy_agent as a 'telephony' requirement.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        description: str(
          "One plain-English sentence describing the agent to build, e.g. 'a Google review requester for a dentist' or 'a speed-to-lead texter for new website leads'.",
        ),
        review_url: str(
          "Optional: the business's Google review link. Wins over any URL found in the description. Only relevant for a review-requester agent; omit otherwise.",
        ),
      },
      ["workspace_id", "description"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/agents/generate", {
        body: {
          description: args.description,
          review_url: args.review_url ?? undefined,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // v1.59.0 — IMPROVE. The 5th verb of the builder ladder: build → test →
  // deploy → sell → improve. `improve_agent` replays an agent's own recent
  // REAL conversations as graded evals against the current blueprint AND a
  // proposed patch (a shadow candidate), clusters the failure modes, and
  // hands back a paired before/after score diff — a marketplace-legible
  // trust signal, not just a debugging tool. `apply_improvement` is the
  // ONLY way a proposal's patch ever reaches the live blueprint: the pair
  // together IS the propose-only contract — improve_agent can never apply
  // anything on its own, by construction (see packages/crm/src/lib/agents/
  // improve/improve-run.ts — nothing in that module imports
  // updateAgentBlueprint).
  // ───────────────────────────────────────────────────────────────────────

  {
    name: "improve_agent",
    description:
      "USE WHEN USER SAYS: 'improve the agent', 'make the chatbot better', 'why does the agent keep messing up', 'learn from real conversations', 'find what's going wrong and fix it', 'run the improve loop'. " +
      "Replays the agent's recent REAL conversations as graded evals, clusters the failure modes, and PROPOSES a blueprint patch with before/after scores (paired per-scenario flips + an honest verdict — 'inconclusive' means the sample is too small to call). NEVER applies anything — review the proposal, then call apply_improvement. Takes 1-3 minutes (two replay passes). " +
      "Needs the workspace's OWN Anthropic key (BYOK) — unbounded build/test-tier LLM cost, same gate as run_agent_evals; returns ok:false reason='no_llm_key' (402) if unset, point the operator at configure_llm_provider. " +
      "Also returns ok:false (422) with a reason string when there's nothing to replay yet: 'no_conversations' (agent hasn't talked to anyone real), 'no_scenarios' (none of the sampled conversations converted cleanly), or 'agent_not_found'. " +
      "On success (ok:true): `proposalId` is null when the baseline was already perfect ('nothing to improve') or no patch was proposed/it failed guardrails (note explains why) — in those cases there's nothing to apply. Otherwise pass `proposalId` straight to apply_improvement if the operator approves. " +
      "`verdict` is 'better' ONLY when paired.improved - paired.regressed >= 3 AND no critical scenario regressed; 'worse' on a clear net regression; otherwise 'inconclusive' — AT THAT SAMPLE SIZE ONLY LARGE EFFECTS ARE REAL, so relay verdict='inconclusive' to the operator as: 'Small sample — apply on judgment, not on the score.' Never round an inconclusive verdict up to sounding like a pass.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        agent_id: str("Agent id from list_agents / create_agent / deploy_agent."),
      },
      ["workspace_id", "agent_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/build/improve", {
        body: { agent_id: args.agent_id },
        workspace_id: ws,
      });
      if (result?.ok && result.verdict === "inconclusive") {
        return {
          ...result,
          guidance:
            "Small sample — apply on judgment, not on the score. The paired flip counts and cluster evidence are real; the verdict just isn't confident enough to call 'better' at this sample size. Read the clusters yourself before deciding whether to apply_improvement.",
        };
      }
      return result;
    },
  },

  {
    name: "apply_improvement",
    description:
      "USE WHEN USER SAYS: 'apply that improvement', 'go with the proposed fix', 'apply the patch', 'yes, use the better version', 'accept the improve_agent proposal'. " +
      "Applies a previously PROPOSED patch (from improve_agent's `proposalId`) after human review — this is the ONLY tool that can move an improve proposal's patch onto the live blueprint. Re-validates the patch against the agent's CURRENT blueprint before writing (it may have moved since the proposal was created) and creates a new agent_versions snapshot, exactly like update_agent_blueprint. " +
      "Version drift doesn't block the apply — if the blueprint changed since the proposal was made, the result just carries a `note: 'applied over vN'` so you know it landed on a newer base than it was proposed against. " +
      "Rejects (ok:false, 422) with a reason when the proposal can't be applied: 'not_found' (wrong id/org, or already resolved), 'not_proposed' (already applied or dismissed — improve proposals are one-shot), 'revalidation_failed' (the patch no longer passes the guardrail against the current blueprint). None of these ever touch the blueprint. " +
      "After applying, the agent is on a new version — suggest re-running run_agent_evals or publish_agent({status:'live'}) (which auto-evals) to confirm the new version still passes the safety gate before the operator relies on it.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        proposal_id: str("Proposal id from improve_agent's `proposalId` field."),
      },
      ["workspace_id", "proposal_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/build/improve/apply", {
        body: { proposal_id: args.proposal_id },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "update_agent_blueprint",
    description:
      "USE WHEN USER SAYS: 'add this FAQ to the chatbot', 'update agent pricing', 'change the greeting', 'remove booking from the agent', 'the chatbot answer for X is wrong, fix it', 'add another service to the agent'. " +
      "Updates an agent's blueprint (FAQ, pricing facts, greeting, capabilities). Bumps current_version + writes a new agent_versions row for rollback. The agent's status is unchanged — flip to test/live separately. " +
      "PATCH SEMANTICS: arrays REPLACE (not merge). If you want to ADD a single FAQ pair, fetch the current blueprint first via list_agents, append your new pair, and submit the full updated array. " +
      "After a blueprint change, RE-RUN evals before promoting to live (use run_agent_evals or just call publish_agent({status:'live'}) which auto-runs them). " +
      "Common reasons to call this: operator added new FAQ entries; pricing changed; greeting needs A/B testing; restricting capabilities (e.g. removing book_appointment to make agent answer-only).",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        agent_id: str("Agent id from create_agent."),
        patch: {
          type: "object",
          description:
            "Partial blueprint patch. Fields: faq, pricing_facts, greeting, capabilities, archetype. Arrays REPLACE.",
        },
        publish_notes: str(
          "Optional one-line note for the audit log (e.g. 'Added emergency-call FAQ').",
        ),
      },
      ["workspace_id", "agent_id", "patch"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/agents", {
        body: {
          op: "update_blueprint",
          agent_id: args.agent_id,
          patch: args.patch,
          publish_notes: args.publish_notes ?? undefined,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // v1.28.1 — WORKSPACE DISCOVERY (single-call replacement for the
  // 4-6 progressive "Called seldonframe N times" round-trips that
  // happen as Claude Code lazy-loads tool schemas to figure out what's
  // in a workspace). Returns workspace identity + integrations status +
  // agents with inline health stats + counts. Designed to be the FIRST
  // call for any "what's in this workspace?" / "build me a chatbot for X"
  // / "is the agent healthy?" prompt.
  // ───────────────────────────────────────────────────────────────────────

  {
    name: "get_workspace_state",
    description:
      "USE FIRST for any workspace task — replaces 4-6 separate discovery calls with one. " +
      "Returns: workspace identity (name, slug, industry, timezone, dashboard URL); integrations status (anthropic / openai / twilio / resend / kit / mailchimp configured? — booleans only, no keys leaked); agents WITH inline health stats (status, version, eval pass rate, validator pass rate 24h, conversations 24h, eval gate met?, last eval run); high-level counts (contacts, bookings, deals, agents); and a next_steps array tailored to the workspace's current state (e.g. 'configure Anthropic key', 'no agents yet — call build_website_chatbot', 'agents need eval run before live'). " +
      "USE WHEN USER SAYS: 'what's in this workspace', 'how is my chatbot doing', 'build me a chatbot for [biz]' (call FIRST so you know if an agent already exists + if LLM is configured), 'is my agent live yet', 'workspace status'. " +
      "AVOIDS asking the user obvious questions like 'how should I configure the Anthropic key?' — the response.integrations.anthropic.configured tells you. Avoids creating a duplicate agent — response.agents tells you what already exists. Avoids a separate get_agent_metrics call — stats come inline.",
    inputSchema: obj(
      { workspace_id: str("Workspace id (bearer workspace).") },
      ["workspace_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("GET", "/workspace-state", {
        workspace_id: ws,
      });
      return result;
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // v1.28.0 — SKILL BUNDLE. Wraps the canonical 4-call chatbot-build
  // sequence (configure_llm_provider → create_agent → publish_agent test
  // → return embed snippet) into ONE call. Reduces ~30s + 4 round-trips
  // to ~5s + 1 round-trip. Primitives stay fully callable for power users
  // who need a custom flow; this is sugar.
  // ───────────────────────────────────────────────────────────────────────

  {
    name: "build_website_chatbot",
    description:
      "USE WHEN USER SAYS: 'build me a chatbot for [business]', 'add a chatbot to my website', 'create a website chatbot', 'put a chat widget on my homepage', 'set up an AI assistant for my landing page'. " +
      "ONE-CALL skill bundle that does the canonical chatbot setup end-to-end: " +
      "(1) auto-configures the workspace's Anthropic LLM key from process.env.ANTHROPIC_API_KEY if no key is configured yet (most Claude Code users already have this set), or accepts an explicit anthropic_api_key arg; " +
      "(2) creates a website-chatbot agent with the FAQ + pricing facts + greeting you provide; " +
      "(3) publishes to status='test' so the operator can sandbox-test before going live (the eval gate runs only on 'live'); " +
      "(4) returns the embed snippet, dashboard URL, and clear next-steps. " +
      "USE THIS as the default for natural-language 'create a chatbot' requests. Fall back to the primitive tools (configure_llm_provider + create_agent + publish_agent) only when you need a custom flow (e.g. agency managing multiple operators with separate Anthropic billing — pass anthropic_api_key explicitly per workspace). " +
      "v1.59.2 — CONSENT REQUIRED before storing an env-detected key: if no anthropic_api_key is passed and process.env.ANTHROPIC_API_KEY is found, this tool does NOT store it on the first call. It reports what it found and stops (nothing else in the bundle runs yet). Ask the user for permission, then re-call with confirm_store_env_key: true to proceed with the full bundle. If neither an explicit key nor an env key is present, the bundle proceeds anyway on the SeldonFrame platform key — no consent needed because nothing of the operator's is transmitted.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        name: str(
          "Agent display name (e.g. 'Cypress & Pine HVAC Assistant'). Surfaces in chat header.",
        ),
        faq: {
          type: "array",
          description:
            "Operator-curated FAQ pairs. Each item is { q, a }. Pass at least 3-5 covering the top customer questions: hours, service area, common issues, what to expect.",
          items: obj(
            {
              q: str("Question as a visitor would phrase it."),
              a: str("Operator's exact answer (1-3 sentences)."),
            },
            ["q", "a"],
          ),
        },
        pricing_facts: {
          type: "array",
          description:
            "ONLY prices the agent may quote. Critical for safety — without this, agent refuses ALL price questions (safer default). With this, agent can quote ONLY listed amounts; anything else gets validator-blocked. Each item: { label, amount, currency }.",
          items: obj(
            {
              label: str("Service name (e.g. 'Service call', 'AC tune-up')."),
              amount: { type: "number" },
              currency: str("3-letter code, e.g. USD."),
            },
            ["label", "amount", "currency"],
          ),
        },
        greeting: str(
          "First message shown when chat opens (~120 chars). E.g. 'Hi! Asking about HVAC service in Phoenix? I can book you in or answer common questions.' Default if omitted: 'Hi! How can I help you today?'",
        ),
        anthropic_api_key: str(
          "Optional explicit Anthropic API key (sk-ant-...). If omitted, reads from process.env.ANTHROPIC_API_KEY in the MCP server's environment (subject to the confirm_store_env_key consent gate below). Pass explicitly for white-label scenarios (different operator = different Anthropic billing) — passing it here IS consent, never gated. Skipped entirely if the workspace already has a key configured.",
        ),
        confirm_store_env_key: {
          type: "boolean",
          description:
            "Set true ONLY after the user has explicitly confirmed storing the API key found in this machine's environment variables in their SeldonFrame workspace.",
        },
      },
      ["workspace_id", "name"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const steps = [];

      // v1.40.10 — graceful no-key path.
      //
      // Pre-1.40.10 this tool blocked workspace chatbot creation when no
      // Anthropic key was present in process.env. That assumed the
      // operator had to BYOK upfront — but the SF backend already falls
      // back to its platform ANTHROPIC_API_KEY (in lib/ai/client.ts ->
      // getAIClient) for any workspace without BYOK. The chatbot WORKS
      // without operator BYOK; pre-1.40.10 we just refused to create it.
      //
      // v1.40.10: if explicit key OR env key, set_llm_key as before
      // (configures BYOK on the workspace, operator pays Anthropic
      // directly). If NEITHER, skip set_llm_key entirely — the workspace
      // will use SF platform key automatically. In the response we tell
      // the operator they can BYOK later via /settings/integrations/llm.
      // Removes the friction "where do I get an Anthropic key" step
      // that v1.40.9 Sunset Plumbing test exposed.
      const explicitKey = args.anthropic_api_key;
      const envKey = process.env.ANTHROPIC_API_KEY;

      // v1.59.2 — CONSENT GATE. An env-inherited key is about to be
      // transmitted to the SF API and stored on the workspace; the
      // operator hasn't agreed to that yet just by virtue of having the
      // var set in their shell. Stop the ENTIRE bundle here (before
      // create_agent / publish_agent run) and ask first. An explicit
      // anthropic_api_key arg is consent by definition and skips this.
      if (!explicitKey && envKey && args.confirm_store_env_key !== true) {
        return {
          ok: true,
          needs_consent: true,
          env_var_found: "ANTHROPIC_API_KEY",
          message:
            "Found ANTHROPIC_API_KEY in the environment. SeldonFrame can store this key in the workspace (server-side, used only to power the hosted chatbot/agent). " +
            "Ask the user for permission first, then re-call this tool with confirm_store_env_key: true.",
        };
      }

      const keyToUse = explicitKey || envKey;
      let llmMode = "platform";
      if (keyToUse) {
        const configResult = await api("POST", "/agents", {
          body: {
            op: "set_llm_key",
            provider: "anthropic",
            api_key: keyToUse,
          },
          workspace_id: ws,
        });
        if (!configResult || configResult.ok === false) {
          return {
            ok: false,
            error: "llm_config_failed",
            detail: configResult,
            steps,
          };
        }
        llmMode = explicitKey ? "byok_explicit" : "byok_env";
        steps.push({
          step: "configure_llm_provider",
          ok: true,
          source: explicitKey ? "explicit" : "env_inherited",
        });
      } else {
        steps.push({
          step: "configure_llm_provider",
          ok: true,
          source: "platform_fallback",
          note: "No BYOK key supplied — agent will use SeldonFrame platform Anthropic key. Operator can switch to BYOK later in /settings/integrations/llm.",
        });
      }

      // 2. Create the agent
      const createResult = await api("POST", "/agents", {
        body: {
          op: "create",
          name: args.name,
          archetype: "website-chatbot",
          channel: "web_chat",
          faq: args.faq ?? [],
          pricing_facts: args.pricing_facts ?? [],
          greeting:
            args.greeting ?? "Hi! How can I help you today?",
        },
        workspace_id: ws,
      });
      if (!createResult || createResult.ok === false) {
        return {
          ok: false,
          error: "create_agent_failed",
          detail: createResult,
          steps,
        };
      }
      steps.push({
        step: "create_agent",
        ok: true,
        agent_id: createResult.agent?.id,
      });

      const agentId = createResult.agent?.id;
      if (!agentId) {
        return {
          ok: false,
          error: "create_agent_returned_no_id",
          detail: createResult,
          steps,
        };
      }

      // 3. Publish to test (sandbox-callable; eval gate doesn't run yet)
      const publishResult = await api("POST", "/agents", {
        body: {
          op: "publish",
          agent_id: agentId,
          status: "test",
        },
        workspace_id: ws,
      });
      if (!publishResult || publishResult.ok === false) {
        // Created but not published. Return partial success so the user
        // can publish manually.
        return {
          ok: false,
          error: "publish_failed_but_agent_created",
          agent: createResult.agent,
          embed_url: createResult.embed_url,
          turn_api_url: createResult.turn_url,
          turn_api_method: "POST",
          publish_detail: publishResult,
          steps,
          next_steps: [
            `Agent ${agentId} was created but couldn't be published to test. Call publish_agent({ agent_id: '${agentId}', status: 'test' }) manually, or check the dashboard at /agents/${agentId}`,
            `Turn API (POST) — this is not a clickable link, it's a POST-only endpoint: curl -sX POST ${createResult.turn_url} -H "Content-Type: application/json" -d '{"message":"hi"}'`,
          ],
        };
      }
      steps.push({ step: "publish_agent_test", ok: true });

      // 4. Compose the operator-friendly final response.
      const baseDomain =
        process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
      const dashboardUrl = `https://${baseDomain}/agents/${agentId}`;

      // v1.40.10 — surface the LLM-key mode in the response so Claude
      // Code can naturally tell the operator "your chatbot is using
      // SeldonFrame's shared Anthropic key right now; switch to your
      // own anytime in Settings."
      const llmKeyNote =
        llmMode === "platform"
          ? `Note on LLM billing: this chatbot is using SeldonFrame's shared Anthropic key (no setup required from you). To switch to your own Anthropic billing (higher rate limits, separate invoice), open ${dashboardUrl.replace("/agents/" + agentId, "/settings/integrations/llm")} and paste your sk-ant-... key. The chatbot picks up the new key automatically — no code changes.`
          : `LLM billing: this workspace is on BYOK (your Anthropic key). Switch in /settings/integrations/llm anytime.`;

      return {
        ok: true,
        agent: createResult.agent,
        embed_url: createResult.embed_url,
        turn_api_url: createResult.turn_url,
        turn_api_method: "POST",
        dashboard_url: dashboardUrl,
        sandbox_url: `${dashboardUrl}/test`,
        llm_mode: llmMode,
        steps,
        next_steps: [
          `1. Test in sandbox: ${dashboardUrl}/test (chat with the agent before customers do).`,
          `2. Run safety evals: open ${dashboardUrl}/evals → Run evals now (8-scenario suite).`,
          `3. When ready, publish to live: call publish_agent({ agent_id: '${agentId}', status: 'live' }) — auto-runs eval gate, requires ≥87.5% pass.`,
          `4. Add to the operator's SF-hosted landing page (one MCP call): embed_chatbot_on_workspace_landing({ workspace_id, agent_id: '${agentId}' }) — the chatbot bubble appears bottom-right on every public page. (For an external website the operator owns, paste this snippet manually: <script src="${createResult.embed_url}" async></script>)`,
          `5. ${llmKeyNote}`,
          `6. Turn API (POST) — not a clickable link, it's a POST-only endpoint: curl -sX POST ${createResult.turn_url} -H "Content-Type: application/json" -d '{"message":"hi"}'`,
        ],
      };
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // v1.28.1 — UPDATE skill bundle. Peer to build_website_chatbot for
  // the case when an agent ALREADY exists. One call to merge new FAQ /
  // pricing / greeting / capabilities into the existing blueprint
  // (bumps version), returns refreshed embed snippet + dashboard URL.
  // Saves operators from rediscovering the agent_id and re-running
  // update_agent_blueprint with full-array semantics.
  // ───────────────────────────────────────────────────────────────────────

  {
    name: "update_website_chatbot",
    description:
      "USE WHEN USER SAYS: 'update the chatbot's FAQ', 'add new pricing to the agent', 'change the greeting', 'add a new service to the chatbot', 'the chatbot answer for X needs updating'. " +
      "ONE-CALL bundle for updating an existing website-chatbot (peer to build_website_chatbot which CREATES). Looks up the workspace's website-chatbot agent (or accepts an explicit agent_id), merges your patch into the current blueprint, bumps version, returns refreshed embed_url + dashboard_url + version + next_steps. " +
      "PATCH SEMANTICS: arrays REPLACE (not merge) per update_agent_blueprint convention — pass the FULL desired faq[] / pricing_facts[], not a delta. Greeting + capabilities are scalar replaces. If you want to ADD one FAQ pair, fetch current via get_workspace_state first and submit the full updated array. " +
      "AFTER UPDATE: re-run evals (call run_agent_evals or use the dashboard) before promoting back to live, since blueprint changes can affect agent behavior.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        agent_id: str(
          "Agent id. Optional — if omitted, the bundle finds the workspace's first website-chatbot agent (most workspaces have one).",
        ),
        faq: {
          type: "array",
          description:
            "FULL desired FAQ list (REPLACES existing). Each item: { q, a }.",
          items: obj(
            { q: str("Question."), a: str("Answer.") },
            ["q", "a"],
          ),
        },
        pricing_facts: {
          type: "array",
          description:
            "FULL desired pricing list (REPLACES existing). Each item: { label, amount, currency }.",
          items: obj(
            {
              label: str("Service name."),
              amount: { type: "number" },
              currency: str("3-letter currency code, e.g. USD."),
            },
            ["label", "amount", "currency"],
          ),
        },
        greeting: str("New greeting text. Omit to keep current."),
        capabilities: {
          type: "array",
          description:
            "FULL desired capability list (REPLACES). Default 7-tool list for website-chatbot: look_up_availability, book_appointment, find_my_existing_appointment, reschedule_appointment, cancel_appointment, escalate_to_human, provide_faq_answer.",
          items: { type: "string" },
        },
        publish_notes: str(
          "Optional one-line audit note (e.g. 'Added emergency-call FAQ').",
        ),
        regenerate_synthesized: {
          type: "boolean",
          description:
            "Optional. When true, regenerate the synthesized portion of the chatbot's FAQ from the current soul. Extracted and operator-added FAQ entries are preserved.",
        },
      },
      ["workspace_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;

      // 1. Resolve agent id — either provided or look up the first
      // website-chatbot agent in the workspace.
      let agentId = args.agent_id;
      if (!agentId) {
        const stateResult = await api("GET", "/workspace-state", {
          workspace_id: ws,
        });
        const websiteChatbots = (stateResult?.agents ?? []).filter(
          (a) => a.archetype === "website-chatbot",
        );
        if (websiteChatbots.length === 0) {
          return {
            ok: false,
            error: "no_website_chatbot",
            hint:
              "No website-chatbot agent in this workspace. Call build_website_chatbot to create one first.",
          };
        }
        if (websiteChatbots.length > 1) {
          return {
            ok: false,
            error: "ambiguous_agent",
            hint:
              "Multiple website-chatbot agents found in this workspace. Pass agent_id explicitly.",
            agents: websiteChatbots.map((a) => ({
              id: a.id,
              name: a.name,
              status: a.status,
            })),
          };
        }
        agentId = websiteChatbots[0].id;
      }

      // 2. Build the patch — only include fields explicitly provided.
      const patch = {};
      if (Array.isArray(args.faq)) patch.faq = args.faq;
      if (Array.isArray(args.pricing_facts))
        patch.pricingFacts = args.pricing_facts;
      if (typeof args.greeting === "string") patch.greeting = args.greeting;
      if (Array.isArray(args.capabilities))
        patch.capabilities = args.capabilities;

      if (Object.keys(patch).length === 0) {
        return {
          ok: false,
          error: "empty_patch",
          hint:
            "No update fields provided. Pass at least one of: faq, pricing_facts, greeting, capabilities.",
        };
      }

      // 3. Update the blueprint
      const updateResult = await api("POST", "/agents", {
        body: {
          op: "update_blueprint",
          agent_id: agentId,
          patch,
          publish_notes: args.publish_notes ?? undefined,
          regenerate_synthesized: args.regenerate_synthesized === true ? true : undefined,
        },
        workspace_id: ws,
      });
      if (!updateResult || updateResult.ok === false) {
        return {
          ok: false,
          error: "update_failed",
          detail: updateResult,
        };
      }

      const baseDomain =
        process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
      return {
        ok: true,
        agent_id: agentId,
        version: updateResult.version,
        dashboard_url: `https://${baseDomain}/agents/${agentId}`,
        next_steps: [
          `Blueprint updated to v${updateResult.version}.`,
          `Re-test in sandbox: https://${baseDomain}/agents/${agentId}/test`,
          `Re-run evals before promoting to live: open https://${baseDomain}/agents/${agentId}/evals → Run evals now, OR call run_agent_evals from MCP.`,
          `If pass rate ≥ 87.5%, promote to live: publish_agent({ agent_id: '${agentId}', status: 'live' })`,
        ],
      };
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // v1.40.7 — workspace-level chatbot embed.
  // The natural-language ask "add the chatbot to my landing page" /
  // "embed this on the website" / "make the bubble appear on every
  // page" maps to this single MCP call. Wires the agent's embed.js
  // URL into organizations.settings.chatbot, and the public page
  // renderer (/s/ + /l/ routes) injects <script src="..." async></script>
  // automatically. No Pages → Edit, no copy-paste. One call, done.
  // ───────────────────────────────────────────────────────────────────────

  {
    name: "embed_chatbot_on_workspace_landing",
    description:
      "USE WHEN USER SAYS: 'add the chatbot to my landing page', 'embed this on the website', 'put the agent on every page', 'make the chat bubble appear', 'wire the chatbot to the public site'. " +
      "Wires a published agent's embed.js URL into the workspace's organization settings. The public page renderer (/s/ + /l/ routes) reads this on every render and injects a <script src='...' async></script> tag near </body>, so the floating chat bubble appears bottom-right on every page of the workspace's public surface — no per-section editing, no manual HTML, no Pages → Edit step. " +
      "Agent must already be in status='test' or status='live' (call publish_agent first if it's still draft). One workspace = one chatbot at a time; calling this again with a different agent_id replaces the bubble. Pair with remove_chatbot_from_landing to clear it.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        agent_id: str(
          "Agent id from build_website_chatbot's response or list_agents. Must belong to the workspace and be in status=test or live.",
        ),
      },
      ["workspace_id", "agent_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/agents", {
        body: { op: "embed_on_landing", agent_id: args.agent_id },
        workspace_id: ws,
      });
      if (!result.ok) return result;
      return {
        ...result,
        next_steps: [
          `The chatbot is now live on every page of this workspace's public landing.`,
          `Open the workspace's public URL to verify the bubble appears bottom-right.`,
          `Conversations will appear in /agents/${args.agent_id}/conversations.`,
          `To remove: call remove_chatbot_from_landing({ workspace_id }).`,
        ],
      };
    },
  },

  {
    name: "remove_chatbot_from_landing",
    description:
      "USE WHEN USER SAYS: 'remove the chatbot from the landing', 'take the chat bubble off the page', 'unembed the chatbot', 'hide the chat from visitors'. " +
      "Clears the workspace's chatbot embed setting so the public page renderer stops injecting the script tag. The agent itself is NOT deleted — it's still available via /agents/[id]/test for sandbox conversations and can be re-embedded with embed_chatbot_on_workspace_landing.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
      },
      ["workspace_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/agents", {
        body: { op: "remove_from_landing" },
        workspace_id: ws,
      });
      return result;
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // v1.26.2 — agent debug + observability tools.
  // run_agent_evals = manual eval suite trigger (publish auto-runs too).
  // tail_agent_conversations / get_agent_conversation = observability.
  // replay_conversation = regression-test a blueprint change against a
  //   known-good past chat. get_agent_metrics = aggregate stats for the
  //   "is my agent healthy?" check.
  // ───────────────────────────────────────────────────────────────────────

  {
    name: "run_agent_evals",
    description:
      "USE WHEN USER SAYS: 'test the chatbot against safety scenarios', 'run evals', 'check if my agent passes the safety suite', 'is the chatbot safe?', 'why did my agent fail the publish gate?'. " +
      "Runs the platform's 8-scenario safety + behavior eval suite against this agent: prompt-injection probes (ignore-instructions, role-swap), PII probes (customer-list leak), pricing discipline (refuses invented prices, refuses competitor match), scope refusal (off-topic), greeting + escalation. Each scenario runs through the live blueprint as an ephemeral test conversation; results persist to agent_evals. " +
      "publish_agent({status:'live'}) AUTOMATICALLY runs this and gates on ≥87.5% pass. Call THIS tool directly to dry-run before publishing or to verify after a blueprint update.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        agent_id: str("Agent id from list_agents / create_agent."),
      },
      ["workspace_id", "agent_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/agents", {
        body: { op: "run_evals", agent_id: args.agent_id },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "tail_agent_conversations",
    description:
      "USE WHEN USER SAYS: 'show me recent chats with the agent', 'what are customers asking the chatbot', 'tail conversations', 'list the latest 20 chatbot sessions', 'what's been happening on the agent today?'. " +
      "Lists recent conversations for an agent — newest first. Excludes eval-runs and replay-runs by default (set include_eval_runs=true to see them). Each row includes status, turn_count, tokens, llm_cost_cents, and the customer's first message preview so you can spot patterns (most common questions, escalations, etc.) without opening each transcript. " +
      "Use BEFORE get_agent_conversation to pick which conversation to drill into.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        agent_id: str("Agent id from list_agents."),
        limit: {
          type: "integer",
          description: "How many conversations to return (default 20, max 100).",
        },
        include_eval_runs: {
          type: "boolean",
          description: "Include eval/replay synthetic runs in the list (default false).",
        },
      },
      ["workspace_id", "agent_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/agents", {
        body: {
          op: "tail_conversations",
          agent_id: args.agent_id,
          limit: args.limit,
          include_eval_runs: args.include_eval_runs,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "get_agent_conversation",
    description:
      "USE WHEN USER SAYS: 'show me that conversation in detail', 'why did the chatbot say X?', 'debug this chat', 'what tools did the agent call in conversation Y', 'show the validator results for conversation Z'. " +
      "Fetches the full transcript of a single conversation: every turn (user + assistant), all tool_calls (look_up_availability, book_appointment, escalate_to_human, etc.) with their inputs, all tool_results with success/error, validator_results per assistant turn (which validators passed/failed), tokens, latency, model. " +
      "Use this to debug WHY an agent gave a specific answer — was it a tool failure? a validator gating? wrong info in blueprint? Pair with replay_conversation to test a blueprint fix.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        conversation_id: str(
          "Conversation id (from tail_agent_conversations or admin /conversations page).",
        ),
      },
      ["workspace_id", "conversation_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/agents", {
        body: {
          op: "get_conversation",
          conversation_id: args.conversation_id,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "replay_conversation",
    description:
      "USE WHEN USER SAYS: 'will my new FAQ break the booking flow?', 'replay this chat against the new blueprint', 'regression test the chatbot', 'test if my recent change still answers this conversation correctly'. " +
      "Replays a past conversation's user messages against the agent's CURRENT blueprint, returning the original responses + the new responses side-by-side. Lets you regression-test a blueprint change without touching production. " +
      "Creates a new ephemeral test-status conversation tagged with replay_of=<original>; the original is untouched.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        conversation_id: str("Original conversation id to replay."),
      },
      ["workspace_id", "conversation_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/agents", {
        body: {
          op: "replay_conversation",
          conversation_id: args.conversation_id,
        },
        workspace_id: ws,
      });
      return result;
    },
  },

  {
    name: "get_agent_metrics",
    description:
      "USE WHEN USER SAYS: 'is my chatbot healthy?', 'how's the agent performing?', 'show me agent stats', 'what's my chatbot's pass rate this week?', 'agent dashboard ping'. " +
      "Aggregate health stats for an agent over a time window: conversations + turns count, tokens (in/out), avg latency, validator pass rate (% of assistant turns where ALL validators passed), latest eval pass rate (last result per scenario). " +
      "Use as a dashboard ping. If validator_pass_rate drops or eval_pass_rate falls below the 87.5% gate, the agent shouldn't be promoted to live.",
    inputSchema: obj(
      {
        workspace_id: str("Workspace id (bearer workspace)."),
        agent_id: str("Agent id from list_agents."),
        since_hours: {
          type: "integer",
          description:
            "Time window in hours (default 24). Pass 168 for last 7 days, 720 for last 30 days.",
        },
      },
      ["workspace_id", "agent_id"],
    ),
    handler: async (args) => {
      const ws = args.workspace_id;
      const result = await api("POST", "/agents", {
        body: {
          op: "get_metrics",
          agent_id: args.agent_id,
          since_hours: args.since_hours,
        },
        workspace_id: ws,
      });
      return result;
    },
  },
  // ─── v1.47.0 — Partner-agency onboarding (Build P1 #2) ─────────────────
  //
  // Thin MCP wrappers around the partner-agency API ops shipped in
  // v1.17 - v1.20. The backend logic + state model already exist;
  // these tools let Claude Code drive end-to-end agency setup in one
  // conversation instead of routing the operator through dashboard
  // pages.
  //
  // Canonical sequence Claude Code follows when an agency owner says
  // "set up my agency brand":
  //   1. register_partner_agency({ name, logo_url?, primary_color?, ... })
  //      → returns agency_id + gated_pending flag
  //   2. (optional) register_partner_agency_sender_domain({ agency_id,
  //      domain }) → returns DNS records the operator adds at their
  //      registrar
  //   3. (after DNS propagates) verify_partner_agency_sender_domain(
  //      { agency_id }) → polls Resend; flips verified_sender_at on
  //      success so the agency's outbound emails can ship from
  //      welcome@agency-domain.com
  //   4. For each client workspace the agency manages:
  //      attach_workspace_to_partner_agency({ workspace_id, agency_id })
  //      → chrome substitution applies on next page load
  //
  // The full sequence + DNS gotchas + A2P 10DLC implications live in
  // packages/crm/src/lib/partner-agencies/SETUP_GUIDE.md — point the
  // operator there if they need depth beyond the tool descriptions.
  {
    name: "register_partner_agency",
    description:
      "Create a partner-agency entity for white-label SaaS reselling. STEP 1 of agency onboarding. " +
      "The agency owns multiple client workspaces; chrome (brand name, logo, colors, support URLs) " +
      "is substituted on each workspace when its parent_agency_id is set to this agency. " +
      "Plan-gate: caller must own a workspace on the Scale tier ($99/mo). If not, the agency is " +
      "created in 'pending' status (gated_pending=true) — caller upgrades a workspace and re-runs to flip it. " +
      "After this call succeeds: optionally register a sender domain (register_partner_agency_sender_domain), " +
      "then attach client workspaces (attach_workspace_to_partner_agency). " +
      'Example: register_partner_agency({ name: "Acme Digital", primary_color: "#1FAE85", support_email: "help@acmedigital.com" })',
    inputSchema: obj(
      {
        workspace_id: str(
          "Workspace bearer that owns the agency. Falls back to default workspace if omitted.",
        ),
        name: str(
          "Agency display name (2+ chars). Surfaces as the brand_name in operator-facing chrome.",
        ),
        slug: str(
          "Optional URL-safe slug. Defaults to slugified name. Must be unique across all agencies.",
        ),
        logo_url: str(
          "Optional logo URL (publicly accessible PNG/SVG). Replaces SeldonFrame logo in chrome.",
        ),
        primary_color: str(
          "Optional brand primary color (hex, e.g. '#1FAE85'). Cascades to UI components.",
        ),
        accent_color: str(
          "Optional brand accent color (hex). Used for secondary surfaces.",
        ),
        support_email: str(
          "Optional support email shown in operator-facing chrome (e.g., 'help@acmedigital.com').",
        ),
        support_url: str(
          "Optional support URL shown in chrome (e.g., 'https://acmedigital.com/help').",
        ),
        hide_powered_by_badge: {
          type: "boolean",
          description:
            "Hide the 'Powered by SeldonFrame' footer badge. Defaults to false. Scale tier feature.",
        },
      },
      ["name"],
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/partner-agencies", {
        body: {
          op: "register",
          name: a.name,
          slug: a.slug,
          logo_url: a.logo_url,
          primary_color: a.primary_color,
          accent_color: a.accent_color,
          support_email: a.support_email,
          support_url: a.support_url,
          hide_powered_by_badge: a.hide_powered_by_badge,
        },
        workspace_id: ws,
      });
    },
  },
  {
    name: "register_partner_agency_sender_domain",
    description:
      "Register a custom email-sender domain for a partner-agency. STEP 2 of agency onboarding (optional but recommended — without it, agency emails ship from welcome@seldonframe.com). " +
      "Calls Resend's /domains endpoint, persists the resend_domain_id on the agency row, and returns the DNS records the agency must add at their registrar (Cloudflare / Namecheap / GoDaddy / etc.). " +
      "DNS propagation typically takes 5-60 minutes. After propagation, call verify_partner_agency_sender_domain to poll Resend + flip verified_sender_at. " +
      "Requires: RESEND_API_KEY configured on the SeldonFrame backend. " +
      'Example: register_partner_agency_sender_domain({ agency_id: "uuid", domain: "acmedigital.com", sender_local_part: "hello" })',
    inputSchema: obj(
      {
        workspace_id: str("Workspace bearer that owns the agency."),
        agency_id: str("Agency id from register_partner_agency response."),
        domain: str(
          "Domain to register (e.g., 'acmedigital.com'). The agency's customer-facing emails ship from <local>@<domain> once verified.",
        ),
        sender_local_part: str(
          "Optional local part for the sender address. Defaults to 'welcome'. Final address: <local>@<domain>.",
        ),
      },
      ["agency_id", "domain"],
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/partner-agencies", {
        body: {
          op: "register_sender_domain",
          agency_id: a.agency_id,
          domain: a.domain,
          sender_local_part: a.sender_local_part,
        },
        workspace_id: ws,
      });
    },
  },
  {
    name: "verify_partner_agency_sender_domain",
    description:
      "Poll Resend for sender-domain verification status. STEP 3 of agency onboarding. " +
      "Run this after the agency has added the DNS records returned by register_partner_agency_sender_domain " +
      "and DNS has had time to propagate (usually 5-60 minutes; some registrars can take longer). " +
      "On success: sets verified_sender_at on the agency row + populates sender_email_address. The branding " +
      "resolver then exposes the verified sender to outbound email paths automatically. " +
      "Idempotent + safe to call repeatedly while waiting on DNS. " +
      'Example: verify_partner_agency_sender_domain({ agency_id: "uuid" })',
    inputSchema: obj(
      {
        workspace_id: str("Workspace bearer that owns the agency."),
        agency_id: str("Agency id from register_partner_agency response."),
      },
      ["agency_id"],
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/partner-agencies", {
        body: {
          op: "verify_sender_domain",
          agency_id: a.agency_id,
        },
        workspace_id: ws,
      });
    },
  },
  {
    name: "attach_workspace_to_partner_agency",
    description:
      "Attach a client workspace to a partner-agency so chrome substitution applies on that workspace's operator-facing surfaces. " +
      "STEP 4 of agency onboarding — run once per client workspace the agency manages. Caller must own both the workspace AND the agency. " +
      "Effect is immediate: next page load in that workspace renders the agency's brand_name, logo, colors, support URLs " +
      "(replacing SeldonFrame's defaults). The workspace's own data (contacts, bookings, agents, etc.) is unchanged. " +
      "Reversible via detach_workspace_from_partner_agency. " +
      'Example: attach_workspace_to_partner_agency({ workspace_id: "phoenix-hvac-uuid", agency_id: "acme-digital-uuid" })',
    inputSchema: obj(
      {
        workspace_id: str(
          "Client workspace id to attach. Caller's bearer workspace doesn't have to match — caller just has to own this workspace.",
        ),
        agency_id: str("Agency id the workspace will inherit chrome from."),
      },
      ["workspace_id", "agency_id"],
    ),
    handler: async (a) => {
      // The attach op's auth derives the agency ownership from the
      // caller's bearer (orgRow.ownerId). The bearer here is whichever
      // workspace the agency operator is currently authenticated as
      // (typically their own primary workspace, not the client's).
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/partner-agencies", {
        body: {
          op: "attach",
          workspace_id: a.workspace_id,
          agency_id: a.agency_id,
        },
        workspace_id: ws,
      });
    },
  },
  {
    name: "detach_workspace_from_partner_agency",
    description:
      "Detach a client workspace from its parent partner-agency. The workspace's chrome falls back to SeldonFrame defaults on next page load. " +
      "Use when an agency loses a client or when the workspace transitions out of agency management. " +
      "Caller must own the workspace OR own the agency the workspace is attached to (either authorizes detach). " +
      "Workspace data is unchanged; only parent_agency_id is set to null. Reversible via attach_workspace_to_partner_agency. " +
      'Example: detach_workspace_from_partner_agency({ workspace_id: "phoenix-hvac-uuid" })',
    inputSchema: obj(
      {
        workspace_id: str("Client workspace id to detach from its agency."),
      },
      ["workspace_id"],
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/partner-agencies", {
        body: {
          op: "detach",
          workspace_id: a.workspace_id,
        },
        workspace_id: ws,
      });
    },
  },

  // Phase T — natural-language R1 landing-page editor.
  //
  // Wraps POST /api/v1/landing/r1/customize. Same handler as the in-app
  // editor at /clients/<slug>/landing/edit. Auth flows through the workspace
  // bearer stored in ~/.seldonframe/device.json.
  //
  // IMPORTANT: The target workspace MUST already have an R1 landing page
  // (generated by create_full_workspace or create_workspace_from_url with
  // the R-framework pipeline). If no R1 page exists, the tool returns
  // { ok: false, error: "no_landing_exists" }.
  {
    name: "customize_landing",
    description:
      "Apply a natural-language instruction to the current R1 landing page for a workspace. " +
      "The LLM rewrites only the parts of the payload touched by the instruction, preserving " +
      "everything else. Each call creates an immutable version snapshot so the operator can " +
      "undo any change. Edits go live immediately (no publish step). " +
      "Examples:\n" +
      "  • customize_landing({ workspace_id: '...', instruction: 'Change the hero tagline to focus on 24/7 emergency service' })\n" +
      "  • customize_landing({ workspace_id: '...', instruction: 'Replace the hero photo with https://example.com/photo.jpg' })\n" +
      "  • customize_landing({ workspace_id: '...', instruction: 'Make the FAQ more local-flavored for Phoenix residents' })\n" +
      "  • customize_landing({ workspace_id: '...', instruction: 'Add a question about financing options to the FAQ' })\n" +
      "Requires: the workspace must have an R1 landing page (auto-generated during workspace creation). " +
      "Requires: an Anthropic API key configured for the workspace (BYOK via /settings/integrations or platform fallback). " +
      "Returns: { ok: true, summary, version_id } on success. " +
      "Returns: { ok: false, error: 'no_landing_exists' } if the workspace has no R1 landing yet.",
    inputSchema: obj(
      {
        workspace_id: str("UUID of the workspace whose landing page to edit."),
        instruction: str(
          "Natural-language description of what to change. Be specific. " +
          "Include image URLs verbatim if swapping a photo. " +
          "Example: 'Change the hero tagline to: Fast. Local. Trusted.' or " +
          "'Replace the hero photo with https://images.unsplash.com/photo-...'",
        ),
      },
      ["workspace_id", "instruction"],
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      if (typeof a.instruction !== "string" || !a.instruction.trim()) {
        throw new Error("instruction must be a non-empty string.");
      }
      return api("POST", "/landing/r1/customize", {
        body: { instruction: a.instruction },
        workspace_id: ws,
      });
    },
  },

  // Phase T — list R1 landing version history.
  {
    name: "list_landing_versions",
    description:
      "Return the edit history for a workspace's R1 landing page, newest first. " +
      "Each row has: id, instruction, summary, createdAt. Pass a version id to " +
      "customize_landing_revert to undo to that point. " +
      "Example: list_landing_versions({ workspace_id: '...' })",
    inputSchema: obj(
      {
        workspace_id: str("UUID of the workspace."),
        limit: {
          type: "number",
          description: "Optional. Max rows to return (default 20, max 100).",
        },
      },
      ["workspace_id"],
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      const qs = a.limit ? `?limit=${encodeURIComponent(String(a.limit))}` : "";
      return api("GET", `/landing/r1/versions${qs}`, { workspace_id: ws });
    },
  },

  // Phase T — revert R1 landing to a prior version.
  {
    name: "revert_landing",
    description:
      "Revert the R1 landing page to a prior version's payload snapshot. " +
      "Creates a new immutable version row (never deletes history). " +
      "The page goes live immediately with the reverted content. " +
      "Get version IDs from list_landing_versions. " +
      "Example: revert_landing({ workspace_id: '...', version_id: '<uuid>' })",
    inputSchema: obj(
      {
        workspace_id: str("UUID of the workspace."),
        version_id: str("UUID of the version to revert to (from list_landing_versions)."),
      },
      ["workspace_id", "version_id"],
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      if (typeof a.version_id !== "string" || !a.version_id.trim()) {
        throw new Error("version_id must be a non-empty string.");
      }
      return api("POST", "/landing/r1/revert", {
        body: { version_id: a.version_id },
        workspace_id: ws,
      });
    },
  },
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
