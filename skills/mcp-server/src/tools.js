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
  {
    name: "customize_intake_form",
    description:
      "Replace the default intake form's fields. Provide 1-8 fields appropriate to the workspace. Field shape: { key, label, type, required, options? }. type in {text, email, tel, textarea, select}. Use select + options for dropdowns.",
    inputSchema: obj(
      {
        fields: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          description: "Array of field objects.",
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "Machine key, e.g. 'full_name'." },
              label: { type: "string" },
              type: { type: "string", enum: ["text", "email", "tel", "textarea", "select"] },
              required: { type: "boolean" },
              options: {
                type: "array",
                items: { type: "string" },
                description: "Only for type=select.",
              },
            },
            required: ["key", "label", "type", "required"],
          },
        },
        form_name: str("Optional new display name for the form."),
        workspace_id: str("Optional workspace override."),
      },
      ["fields"],
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/intake/customize", {
        body: { fields: a.fields, form_name: a.form_name, workspace_id: ws },
        workspace_id: ws,
      });
    },
  },
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
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
