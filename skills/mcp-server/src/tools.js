import {
  api,
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
import { FIRST_CALL_BANNER } from "./welcome.js";

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
  {
    name: "create_workspace",
    description:
      "Create a real, hosted workspace on <slug>.app.seldonframe.com with CRM, Cal.diy booking, Formbricks intake, and Brain v2 pre-installed. The first workspace requires no API key. Example: create_workspace({ name: 'Dental Clinic Laval', source: 'https://mysite.com' })",
    inputSchema: obj(
      {
        name: str("Human-readable workspace name."),
        source: str("Optional URL or description to seed the workspace's Soul from."),
      },
      ["name"],
    ),
    handler: async (args) => {
      const firstEver = isFirstEverCall();
      const result = await api("POST", "/workspace/create", {
        body: { name: args.name, source: args.source ?? null },
        allow_anonymous: true,
      });
      const ws = result.workspace ?? result;
      const id = ws.id;
      if (!id) throw new Error("Server did not return a workspace id.");
      if (result.bearer_token) {
        rememberWorkspace({ workspace_id: id, bearer_token: result.bearer_token });
      } else {
        setDefaultWorkspace(id);
      }
      const payload = {
        ok: true,
        workspace: {
          id,
          name: ws.name,
          slug: ws.slug,
          tier: ws.tier ?? "free",
          created_at: ws.created_at,
        },
        urls: result.urls ?? ws.urls ?? null,
        installed: result.installed ?? ["crm", "caldiy-booking", "formbricks-intake", "brain-v2"],
        next: [
          "install_vertical_pack({ pack: 'real-estate' })  // or 'dental', 'legal'",
          "fetch_source_for_soul({ url: 'https://yoursite.com' }) → submit_soul({ soul })",
          "get_workspace_snapshot({}) — read workspace state to reason about next steps",
        ],
      };
      return firstEver ? withFirstCallBanner(payload) : payload;
    },
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
      "Rewrite the workspace's public landing page at / — headline, subhead, and primary CTA label. YOU decide the copy based on the user's request + the workspace Soul; this tool persists it.",
    inputSchema: obj(
      {
        headline: str("Main hero heading. Keep short; 1 line."),
        subhead: str("One-sentence supporting line under the headline."),
        cta_label: str("Primary call-to-action button text, e.g. 'Book a call'."),
        workspace_id: str("Optional workspace override."),
      },
      ["headline", "subhead", "cta_label"],
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
  {
    name: "list_automations",
    description: "List automations configured in the active (or specified) workspace.",
    inputSchema: obj({ workspace_id: str("Optional workspace override.") }),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("GET", `/automations?workspace_id=${encodeURIComponent(ws)}`, { workspace_id: ws });
    },
  },
  {
    name: "install_vertical_pack",
    description:
      "Install a vertical pack (e.g. 'real-estate', 'dental', 'legal'). Adds domain-specific objects, fields, views.",
    inputSchema: obj(
      {
        pack: str("Pack slug, e.g. 'real-estate', 'dental', 'legal'."),
        workspace_id: str("Optional workspace override."),
      },
      ["pack"],
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/packs/install", {
        body: { pack: a.pack, workspace_id: ws },
        workspace_id: ws,
      });
    },
  },
  {
    name: "install_caldiy_booking",
    description:
      "Install the Cal.diy booking block (event types, availability, bookings). Example: install_caldiy_booking({})",
    inputSchema: obj({
      workspace_id: str("Optional workspace override."),
      config: { type: "object", description: "Optional Cal.diy configuration overrides." },
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
      "Install a Formbricks intake form (surveys, conditional logic, contact sync). Example: install_formbricks_intake({})",
    inputSchema: obj({
      workspace_id: str("Optional workspace override."),
      form_id: str("Optional existing Formbricks form id to bind."),
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
      "Fetch a URL and return normalized text (headings + body, up to 256KB). Use this to gather raw content; then you (the caller) extract a structured Soul and submit it with submit_soul. Zero LLM cost to Seldon — extraction runs in this session.",
    inputSchema: obj(
      {
        url: str("Absolute URL to fetch."),
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
          "Extract a Soul object: { mission, audience, tone, offerings[], differentiators[], faqs[] }",
          "submit_soul({ soul: <extracted> })",
        ],
      };
    },
  },
  {
    name: "submit_soul",
    description:
      "Submit a compiled Soul object to the active workspace. The caller is expected to have produced the structured Soul from fetch_source_for_soul output or user conversation.",
    inputSchema: obj(
      {
        soul: {
          type: "object",
          description:
            "Structured Soul. Expected keys: mission, audience, tone, offerings, differentiators, faqs. Additional keys allowed.",
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
        expires_at: str("Optional ISO timestamp. Code becomes invalid after this moment."),
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
  {
    name: "create_landing_page",
    description:
      "Create a landing page from an optional Puck payload. Without puck_data, creates a blank draft. With puck_data, validates the payload against the Puck schema and rejects on mismatch. Set published=true to publish immediately.",
    inputSchema: obj(
      {
        title: str("Page title (used for the dashboard; not the public URL)."),
        slug: str("Optional URL slug. Derived from title if omitted."),
        puck_data: {
          type: "object",
          description: "Optional Puck payload { content: [], root: {props}, zones: {} }.",
        },
        published: {
          type: "boolean",
          description: "If true, publish the page immediately. Default: draft.",
        },
        workspace_id: str("Optional. Falls back to the active workspace."),
      },
      ["title"],
    ),
    handler: async (args) => {
      const ws = wsOrDefault(args.workspace_id);
      return api("POST", "/landing", {
        body: {
          title: args.title,
          slug: args.slug,
          puckData: args.puck_data,
          published: Boolean(args.published),
        },
        workspace_id: ws,
      });
    },
  },
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
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
