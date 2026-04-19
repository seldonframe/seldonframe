import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = join(homedir(), ".seldonframe", "guest");

function ensureRoot() {
  mkdirSync(ROOT, { recursive: true });
}

function idFor(workspaceId) {
  return join(ROOT, `${workspaceId}.json`);
}

export function newWorkspaceId() {
  return `wsp_${randomUUID().slice(0, 8)}`;
}

export function saveState(workspaceId, state) {
  ensureRoot();
  writeFileSync(idFor(workspaceId), JSON.stringify(state, null, 2));
}

export function loadState(workspaceId) {
  const path = idFor(workspaceId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function listStates() {
  ensureRoot();
  return readdirSync(ROOT)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".claim.json"))
    .map((f) => {
      const data = JSON.parse(readFileSync(join(ROOT, f), "utf8"));
      return {
        id: data.id,
        name: data.name,
        created_at: data.created_at,
        blocks_installed: data.blocks?.length ?? 0,
        packs_installed: data.packs?.length ?? 0,
      };
    });
}

const ACTIVE_POINTER = join(ROOT, "active.txt");

export function getActiveWorkspaceId() {
  if (!existsSync(ACTIVE_POINTER)) return null;
  return readFileSync(ACTIVE_POINTER, "utf8").trim() || null;
}

export function setActiveWorkspaceId(workspaceId) {
  ensureRoot();
  writeFileSync(ACTIVE_POINTER, workspaceId);
}

export function exportClaim(workspaceId) {
  const state = loadState(workspaceId);
  if (!state) throw new Error(`Guest workspace ${workspaceId} not found.`);
  const path = join(ROOT, `${workspaceId}.claim.json`);
  const envelope = {
    schema_version: "guest-claim/1",
    exported_at: new Date().toISOString(),
    workspace: state,
  };
  writeFileSync(path, JSON.stringify(envelope, null, 2));
  return path;
}

export const GUEST_ROOT = ROOT;
