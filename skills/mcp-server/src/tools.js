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
  {
    name: "configure_booking",
    description:
      "Edit the default booking template at /book — title, duration (5-240 min), description. Provide only the fields you want to change.",
    inputSchema: obj(
      {
        title: str("Booking title (e.g. 'Initial consultation')."),
        duration_minutes: { type: "integer", minimum: 5, maximum: 240 },
        description: str("Booking description shown to the prospect."),
        workspace_id: str("Optional workspace override."),
      },
    ),
    handler: async (a) => {
      const ws = wsOrDefault(a.workspace_id);
      return api("POST", "/booking/configure", {
        body: {
          title: a.title,
          duration_minutes: a.duration_minutes,
          description: a.description,
          workspace_id: ws,
        },
        workspace_id: ws,
      });
    },
  },
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
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
