import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  newWorkspaceId,
  saveState,
  loadState,
  listStates,
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  exportClaim,
  GUEST_ROOT,
} from "./store.js";
import { GUEST_FIRST_CALL_BANNER } from "../welcome.js";

const SEEDS_DIR = join(dirname(fileURLToPath(import.meta.url)), "seeds");
const CRM_STARTER = JSON.parse(readFileSync(join(SEEDS_DIR, "crm-starter.json"), "utf8"));

const KNOWN_BLOCKS = {
  "caldiy-booking": join(SEEDS_DIR, "caldiy-booking.block.md"),
  "formbricks-intake": join(SEEDS_DIR, "formbricks-intake.block.md"),
};

const KNOWN_PACKS = {
  "real-estate": join(SEEDS_DIR, "verticals", "real-estate-agency.pack.md"),
  "real-estate-agency": join(SEEDS_DIR, "verticals", "real-estate-agency.pack.md"),
};

function now() {
  return new Date().toISOString();
}

function emptyWorkspace(id, name, source) {
  return {
    id,
    name,
    source: source ?? null,
    mode: "guest",
    created_at: now(),
    updated_at: now(),
    crm: structuredClone(CRM_STARTER),
    blocks: [],
    packs: [],
    secrets: {},
    domains: [],
    events: [
      { type: "workspace_created", at: now(), payload: { name } },
    ],
  };
}

function requireActive(explicitId) {
  const id = explicitId ?? getActiveWorkspaceId();
  if (!id) {
    throw new Error(
      "No active guest workspace. Call create_workspace({name:'...'}) first, or pass workspace_id explicitly.",
    );
  }
  const state = loadState(id);
  if (!state) {
    throw new Error(`Guest workspace ${id} not found at ${GUEST_ROOT}.`);
  }
  return state;
}

function save(state) {
  state.updated_at = now();
  saveState(state.id, state);
  return state;
}

function firstCallWrap(payload, isFirstCall) {
  if (!isFirstCall) return payload;
  return { ...payload, _banner: GUEST_FIRST_CALL_BANNER };
}

function isFirstEverCall() {
  return listStates().length === 0;
}

const HANDLERS = {
  create_workspace({ name, source }) {
    const firstEver = isFirstEverCall();
    const id = newWorkspaceId();
    const state = emptyWorkspace(id, name, source);
    saveState(id, state);
    setActiveWorkspaceId(id);
    return firstCallWrap(
      {
        ok: true,
        mode: "guest",
        workspace: {
          id,
          name,
          source: source ?? null,
          created_at: state.created_at,
          crm: {
            objects: state.crm.objects.map((o) => o.slug),
            pipelines: state.crm.pipelines.map((p) => p.slug),
            views: state.crm.views.map((v) => v.slug),
          },
        },
        next: [
          "install_caldiy_booking({})",
          "install_formbricks_intake({})",
          "install_vertical_pack({ pack: 'real-estate' })",
          "query_brain({ question: 'What should I do first?' })",
        ],
      },
      firstEver,
    );
  },

  list_workspaces() {
    const items = listStates();
    const active = getActiveWorkspaceId();
    return { ok: true, mode: "guest", active, workspaces: items };
  },

  switch_workspace({ workspace_id }) {
    const state = loadState(workspace_id);
    if (!state) throw new Error(`Workspace ${workspace_id} not found.`);
    setActiveWorkspaceId(workspace_id);
    return { ok: true, active: workspace_id, name: state.name };
  },

  clone_workspace({ source_workspace_id, name }) {
    const src = loadState(source_workspace_id);
    if (!src) throw new Error(`Source workspace ${source_workspace_id} not found.`);
    const id = newWorkspaceId();
    const state = {
      ...structuredClone(src),
      id,
      name,
      created_at: now(),
      updated_at: now(),
      events: [...src.events, { type: "workspace_cloned", at: now(), payload: { from: source_workspace_id } }],
    };
    saveState(id, state);
    setActiveWorkspaceId(id);
    return { ok: true, workspace: { id, name, cloned_from: source_workspace_id } };
  },

  install_caldiy_booking({ workspace_id, config }) {
    const state = requireActive(workspace_id);
    const spec = readFileSync(KNOWN_BLOCKS["caldiy-booking"], "utf8");
    const block = {
      slug: "caldiy-booking",
      kind: "booking",
      installed_at: now(),
      config: config ?? {},
      spec_bytes: spec.length,
    };
    state.blocks.push(block);
    state.events.push({ type: "caldiy_block_configured", at: now(), payload: { slug: block.slug } });
    save(state);
    return {
      ok: true,
      mode: "guest",
      installed: block,
      entities: ["EventType", "Availability", "Booking"],
      booking_page_slug: "book",
      preview_url: `local://guest/${state.id}/book`,
    };
  },

  install_formbricks_intake({ workspace_id, form_id }) {
    const state = requireActive(workspace_id);
    const spec = readFileSync(KNOWN_BLOCKS["formbricks-intake"], "utf8");
    const block = {
      slug: "formbricks-intake",
      kind: "intake",
      installed_at: now(),
      form_id: form_id ?? `frm_${randomUUID().slice(0, 8)}`,
      spec_bytes: spec.length,
    };
    state.blocks.push(block);
    state.events.push({ type: "formbricks_block_configured", at: now(), payload: { slug: block.slug } });
    save(state);
    return {
      ok: true,
      mode: "guest",
      installed: block,
      entities: ["Survey", "Question", "Response"],
      intake_page_slug: "intake",
      preview_url: `local://guest/${state.id}/intake`,
    };
  },

  install_vertical_pack({ pack, workspace_id }) {
    const state = requireActive(workspace_id);
    const path = KNOWN_PACKS[pack];
    if (!path) {
      const available = Object.keys(KNOWN_PACKS).filter((k) => !k.endsWith("-agency"));
      throw new Error(`Unknown pack '${pack}'. Available in guest mode: ${available.join(", ")}.`);
    }
    const spec = readFileSync(path, "utf8");
    const entry = { slug: pack, installed_at: now(), spec_bytes: spec.length };
    state.packs.push(entry);
    state.events.push({ type: "vertical_pack_installed", at: now(), payload: { pack } });
    save(state);
    return { ok: true, mode: "guest", installed: entry };
  },

  seldon_it({ prompt, workspace_id }) {
    const state = requireActive(workspace_id);
    state.events.push({ type: "seldon_it_invoked", at: now(), payload: { prompt } });
    save(state);
    return {
      ok: true,
      mode: "guest",
      note: "Guest mode cannot call the LLM. Prompt logged to event history. Set SELDONFRAME_API_KEY to enable natural-language generation.",
      prompt,
    };
  },

  list_automations({ workspace_id }) {
    const state = requireActive(workspace_id);
    const derived = state.blocks.map((b) => ({
      source_block: b.slug,
      triggers: b.slug === "caldiy-booking" ? ["booking.created"] : ["form.submitted"],
    }));
    return { ok: true, mode: "guest", automations: derived };
  },

  query_brain({ question, workspace_id }) {
    const state = requireActive(workspace_id);
    const blocks = state.blocks.map((b) => b.slug);
    const packs = state.packs.map((p) => p.slug);
    const suggestions = [];
    if (!blocks.includes("caldiy-booking"))
      suggestions.push("Install Cal.diy booking so prospects can self-book: install_caldiy_booking({})");
    if (!blocks.includes("formbricks-intake"))
      suggestions.push("Install Formbricks intake to capture leads: install_formbricks_intake({})");
    if (packs.length === 0)
      suggestions.push("Install a vertical pack for domain-specific CRM fields: install_vertical_pack({ pack: 'real-estate' })");
    if (suggestions.length === 0)
      suggestions.push("Run seldon_it({ prompt: 'review my funnel and suggest improvements' }) once you set SELDONFRAME_API_KEY.");
    return {
      ok: true,
      mode: "guest-heuristic",
      question,
      answer: suggestions[0],
      all_suggestions: suggestions,
      state_summary: {
        blocks_installed: blocks,
        packs_installed: packs,
        event_count: state.events.length,
      },
      note: "Brain v2 in guest mode is heuristic-only. Connect an API key for real intelligence.",
    };
  },

  connect_custom_domain({ domain, workspace_id }) {
    const state = requireActive(workspace_id);
    state.domains.push({ domain, status: "pending-dns", added_at: now() });
    save(state);
    return {
      ok: true,
      mode: "guest",
      domain,
      status: "pending-dns",
      note: "Guest mode cannot verify real DNS. Connect an API key to activate this domain against app.seldonframe.com.",
    };
  },

  export_agent({ workspace_id }) {
    const state = requireActive(workspace_id);
    return {
      ok: true,
      mode: "guest",
      agent: {
        name: state.name,
        crm: state.crm,
        blocks: state.blocks,
        packs: state.packs,
        exported_at: now(),
      },
    };
  },

  store_secret({ key, value, workspace_id }) {
    const state = requireActive(workspace_id);
    state.secrets[key] = { set_at: now(), preview: `${value.slice(0, 3)}…${value.slice(-2)}` };
    save(state);
    return { ok: true, mode: "guest", key, stored: true };
  },

  list_secrets({ workspace_id }) {
    const state = requireActive(workspace_id);
    return {
      ok: true,
      mode: "guest",
      secrets: Object.entries(state.secrets).map(([k, v]) => ({ key: k, ...v })),
    };
  },

  rotate_secret({ key, new_value, workspace_id }) {
    const state = requireActive(workspace_id);
    if (new_value === undefined) {
      delete state.secrets[key];
      save(state);
      return { ok: true, mode: "guest", key, deleted: true };
    }
    state.secrets[key] = { set_at: now(), preview: `${new_value.slice(0, 3)}…${new_value.slice(-2)}` };
    save(state);
    return { ok: true, mode: "guest", key, rotated: true };
  },

  claim_guest_workspace({ workspace_id }) {
    const id = workspace_id ?? getActiveWorkspaceId();
    if (!id) throw new Error("No workspace to claim. Pass workspace_id or create one first.");
    const path = exportClaim(id);
    return {
      ok: true,
      mode: "guest",
      workspace_id: id,
      claim_file: path,
      next_steps: [
        `Set SELDONFRAME_API_KEY (get one at https://app.seldonframe.com/settings/api).`,
        `Upload the claim file at https://app.seldonframe.com/settings/import, or email it to support@seldonframe.com.`,
        `Once imported, you can connect a custom domain and run seldon_it with real AI.`,
      ],
    };
  },
};

export function handle(toolName, args) {
  const fn = HANDLERS[toolName];
  if (!fn) {
    throw new Error(`Guest mode does not yet simulate '${toolName}'. Set SELDONFRAME_API_KEY to use the live API.`);
  }
  return fn(args ?? {});
}
