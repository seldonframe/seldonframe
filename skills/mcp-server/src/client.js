import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { VERSION } from "./welcome.js";

const API_BASE =
  process.env.SELDONFRAME_API_BASE ?? "https://app.seldonframe.com/api/v1";
const API_KEY = process.env.SELDONFRAME_API_KEY;

const SELDON_DIR = join(homedir(), ".seldonframe");
const DEVICE_FILE = join(SELDON_DIR, "device.json");

function loadDevice() {
  if (!existsSync(DEVICE_FILE)) {
    return { tokens: {}, default_workspace: null, created_at: null };
  }
  try {
    const parsed = JSON.parse(readFileSync(DEVICE_FILE, "utf8"));
    return {
      tokens: parsed.tokens ?? {},
      default_workspace: parsed.default_workspace ?? null,
      created_at: parsed.created_at ?? null,
    };
  } catch {
    return { tokens: {}, default_workspace: null, created_at: null };
  }
}

function saveDevice(device) {
  mkdirSync(SELDON_DIR, { recursive: true });
  writeFileSync(DEVICE_FILE, JSON.stringify(device, null, 2));
}

export function rememberWorkspace({ workspace_id, bearer_token, make_default = true }) {
  const d = loadDevice();
  if (bearer_token) d.tokens[workspace_id] = bearer_token;
  if (make_default || !d.default_workspace) d.default_workspace = workspace_id;
  if (!d.created_at) d.created_at = new Date().toISOString();
  saveDevice(d);
}

export function setDefaultWorkspace(workspace_id) {
  const d = loadDevice();
  d.default_workspace = workspace_id;
  saveDevice(d);
}

// Remove a workspace's bearer token from the local device store. If it was the
// default, clear the default pointer too. Used by revoke_bearer when the call
// revokes the caller's own token — the device can't keep pretending it has
// access.
export function forgetWorkspace(workspace_id) {
  const d = loadDevice();
  delete d.tokens[workspace_id];
  if (d.default_workspace === workspace_id) {
    const remaining = Object.keys(d.tokens);
    d.default_workspace = remaining[0] ?? null;
  }
  saveDevice(d);
}

export function getDefaultWorkspace() {
  return loadDevice().default_workspace;
}

export function knownWorkspaceIds() {
  return Object.keys(loadDevice().tokens);
}

export function hasApiKey() {
  return !!API_KEY;
}

export function isFirstEverCall() {
  const d = loadDevice();
  return Object.keys(d.tokens).length === 0 && !API_KEY;
}

function resolveAuth(workspace_id) {
  if (API_KEY) return `Bearer ${API_KEY}`;
  const d = loadDevice();
  const target = workspace_id ?? d.default_workspace;
  if (target && d.tokens[target]) return `Bearer ${d.tokens[target]}`;
  return null;
}

export function getWorkspaceBearer(workspace_id) {
  const d = loadDevice();
  const target = workspace_id ?? d.default_workspace;
  if (!target) return null;
  return d.tokens[target] ?? null;
}

export function getApiKey() {
  return API_KEY ?? null;
}

function hintFor(status, data) {
  if (status === 401) {
    return " — credentials rejected. If you meant to use a paid capability, check SELDONFRAME_API_KEY at https://app.seldonframe.com/settings/api.";
  }
  if (status === 402) {
    const need = data?.error?.requires ?? "a SeldonFrame API key";
    return ` — this capability requires ${need}. Get one at https://app.seldonframe.com/settings/api and \`export SELDONFRAME_API_KEY=sk-…\`.`;
  }
  if (status === 409) {
    return " — the requested resource already exists or conflicts with existing state.";
  }
  if (status === 429) return " — rate limited. Try again in a moment.";
  return "";
}

export async function api(method, path, opts = {}) {
  const {
    body,
    workspace_id,
    allow_anonymous = false,
    force_workspace_bearer = false,
    extra_headers = {},
  } = opts;

  let auth = null;
  if (force_workspace_bearer) {
    const token = getWorkspaceBearer(workspace_id);
    if (token) auth = `Bearer ${token}`;
  } else {
    auth = resolveAuth(workspace_id);
  }

  if (!auth && !allow_anonymous) {
    throw new Error(
      "No workspace available. Run create_workspace({ name: '…' }) first, or set SELDONFRAME_API_KEY.",
    );
  }
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": `seldonframe-mcp/${VERSION}`,
    ...extra_headers,
  };
  if (auth) headers.Authorization = auth;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.message ?? text ?? res.statusText;
    throw new Error(`Seldon API ${res.status}: ${msg}${hintFor(res.status, data)}`);
  }
  return data;
}

export async function fetchText(url, { maxBytes = 256 * 1024 } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": `seldonframe-mcp/${VERSION} (+soul-compiler)` },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Fetch ${url} failed: ${res.status} ${res.statusText}`);
  }
  const raw = await res.text();
  const truncated = raw.length > maxBytes;
  const html = truncated ? raw.slice(0, maxBytes) : raw;
  return { html, truncated, status: res.status, final_url: res.url };
}

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(h[1-6]|p|li|br|div|section|article|header|footer)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const API_INFO = { base: API_BASE };
