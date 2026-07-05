// Simple-home surface read/write/guard helpers — Task 2 of the simple-home
// plan. All settings.surface writes follow the 42P18 house rule (prod
// incident, see ladder-server.ts's buildStampStepPatch/buildStampShareUsedPatch):
// build the patch object in JS and pass ONE `${JSON.stringify(patch)}::jsonb`
// parameter inside `COALESCE(settings,'{}'::jsonb) || <patch>::jsonb` — NEVER a
// bare param as a jsonb_build_object key.

import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { deployments, organizations } from "@/db/schema";
import { resolveTierForWorkspace } from "@/lib/billing/tier-resolver";
import { MODULE_IDS, DEFAULT_FRESH_MODULES, type ModuleId } from "./modules";

const MODULE_ID_SET = new Set<string>(MODULE_IDS as readonly string[]);

type SurfaceSettings = {
  modules?: unknown;
  [key: string]: unknown;
};

type OrgSettings = {
  surface?: SurfaceSettings;
  [key: string]: unknown;
};

/**
 * Parse `settings?.surface?.modules`. Returns null when the key is
 * absent/malformed — callers treat null as "grandfathered" (show
 * everything, i.e. behave as if simple-home were never turned on for this
 * org). When present, filters out unknown ids and always unions in "home"
 * (it can never be turned off).
 */
export function readEnabledModules(settings: unknown): ModuleId[] | null {
  if (!settings || typeof settings !== "object") return null;

  const surface = (settings as OrgSettings).surface;
  if (!surface || typeof surface !== "object") return null;

  const modules = (surface as SurfaceSettings).modules;
  if (!Array.isArray(modules)) return null;

  const filtered = modules.filter(
    (id): id is ModuleId => typeof id === "string" && MODULE_ID_SET.has(id),
  );

  const result = new Set<ModuleId>(filtered);
  result.add("home");

  // Preserve MODULE_IDS order for deterministic output.
  return (MODULE_IDS as readonly ModuleId[]).filter((id) => result.has(id));
}

/**
 * Build the `settings` SQL fragment for the minimal-surface seed write.
 *
 * Same 42P18 house rule as ladder-server.ts's buildStampStepPatch: the
 * nested patch object is built in JS and bound as ONE parameter cast
 * `::jsonb`, merged in via `COALESCE(settings,'{}'::jsonb) || <patch>::jsonb`
 * — never a bare param as a jsonb_build_object key. Exported so the spec
 * can assert the SQL shape directly without touching a real DB.
 */
export function buildMinimalSurfacePatch() {
  const patch = JSON.stringify({
    surface: { modules: [...DEFAULT_FRESH_MODULES], version: 1 },
  });
  return sql`COALESCE(${organizations.settings}, '{}'::jsonb) || ${patch}::jsonb`;
}

/**
 * Only-if-absent seed write: gives a fresh org an explicit
 * settings.surface.modules (DEFAULT_FRESH_MODULES) so future reads stop
 * being "grandfathered" (null). No-ops when settings->'surface' already
 * exists — never clobbers an operator's own module choices.
 */
export async function writeMinimalSurface(orgId: string): Promise<void> {
  await db
    .update(organizations)
    .set({
      settings: buildMinimalSurfacePatch(),
      updatedAt: new Date(),
    })
    .where(and(eq(organizations.id, orgId), sql`${organizations.settings}->'surface' IS NULL`));
}

export type CanDisableModuleDeps = {
  /** True when the org has an ACTIVE paid subscription (blocks disabling "money"). */
  hasActiveSubscription: (orgId: string) => Promise<boolean>;
  /** True when the org has at least one active deployment (blocks disabling "agents"). */
  hasActiveDeployment: (orgId: string) => Promise<boolean>;
};

async function defaultHasActiveSubscription(orgId: string): Promise<boolean> {
  const tier = await resolveTierForWorkspace(orgId);
  return tier !== "inactive";
}

async function defaultHasActiveDeployment(orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: deployments.id })
    .from(deployments)
    .where(and(eq(deployments.builderOrgId, orgId), eq(deployments.status, "active")))
    .limit(1);
  return Boolean(row);
}

export const defaultCanDisableModuleDeps: CanDisableModuleDeps = {
  hasActiveSubscription: defaultHasActiveSubscription,
  hasActiveDeployment: defaultHasActiveDeployment,
};

/**
 * Decide whether `moduleId` may be disabled for `orgId`. "home" can never
 * be disabled. "money" is blocked while the org has an active paid
 * subscription (avoid hiding the surface that manages it). "agents" is
 * blocked while the org has an active deployment (avoid hiding the surface
 * that runs a live client-facing agent). Everything else is allowed.
 */
export async function canDisableModule(
  orgId: string,
  moduleId: ModuleId,
  deps: CanDisableModuleDeps = defaultCanDisableModuleDeps,
): Promise<{ ok: boolean; reason?: string }> {
  if (moduleId === "home") {
    return { ok: false, reason: "home_always_on" };
  }

  if (moduleId === "money") {
    const active = await deps.hasActiveSubscription(orgId);
    if (active) return { ok: false, reason: "active_subscription" };
  }

  if (moduleId === "agents") {
    const active = await deps.hasActiveDeployment(orgId);
    if (active) return { ok: false, reason: "active_deployment" };
  }

  return { ok: true };
}

/**
 * Build the `settings` SQL fragment for a whole-surface-object write. Same
 * 42P18-safe shape as buildMinimalSurfacePatch: ONE `::jsonb`-cast param,
 * merged in via `COALESCE(settings,'{}'::jsonb) || <patch>::jsonb`. Exported
 * for direct spec assertion.
 */
export function buildSetSurfacePatch(surface: SurfaceSettings) {
  const patch = JSON.stringify({ surface });
  return sql`COALESCE(${organizations.settings}, '{}'::jsonb) || ${patch}::jsonb`;
}

export type SetModuleEnabledDeps = CanDisableModuleDeps & {
  /** Reads the org's current `settings` jsonb (used to derive the current surface). */
  readSettings: (orgId: string) => Promise<unknown>;
  /** Writes the whole `surface` object via the 42P18-safe merge idiom. */
  writeSurface: (orgId: string, surface: SurfaceSettings) => Promise<void>;
};

async function defaultReadSettings(orgId: string): Promise<unknown> {
  const [row] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return row?.settings ?? null;
}

async function defaultWriteSurface(orgId: string, surface: SurfaceSettings): Promise<void> {
  await db
    .update(organizations)
    .set({
      settings: buildSetSurfacePatch(surface),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

export const defaultSetModuleEnabledDeps: SetModuleEnabledDeps = {
  ...defaultCanDisableModuleDeps,
  readSettings: defaultReadSettings,
  writeSurface: defaultWriteSurface,
};

/**
 * Read-modify-write toggle for a single module. Reads the org's current
 * settings.surface, computes the next `modules` array, rejects disabling
 * when `canDisableModule` says no, and writes back the WHOLE surface
 * object (preserving sibling surface keys like `chatIntroSeen`) via the
 * same `COALESCE || <patch>::jsonb` merge idiom (42P18 house rule).
 */
export async function setModuleEnabled(
  orgId: string,
  moduleId: ModuleId,
  enabled: boolean,
  deps: SetModuleEnabledDeps = defaultSetModuleEnabledDeps,
): Promise<{ ok: true; modules: ModuleId[] } | { ok: false; reason: string }> {
  if (moduleId === "home" && !enabled) {
    return { ok: false, reason: "home_always_on" };
  }

  if (!enabled) {
    const decision = await canDisableModule(orgId, moduleId, deps);
    if (!decision.ok) {
      return { ok: false, reason: decision.reason ?? "blocked" };
    }
  }

  const settings = await deps.readSettings(orgId);
  const currentSettings = (settings ?? {}) as OrgSettings;
  const currentSurface = currentSettings.surface;
  const currentSurfaceObj: SurfaceSettings =
    currentSurface && typeof currentSurface === "object" ? currentSurface : {};

  // null current surface (never seeded / malformed) ⇒ start from the FULL
  // MODULE_IDS set (grandfathered behavior — a workspace that predates
  // simple-home already had everything on).
  const currentModulesRaw = Array.isArray(currentSurfaceObj.modules)
    ? currentSurfaceObj.modules
    : null;
  const baseModules: ModuleId[] = currentModulesRaw
    ? currentModulesRaw.filter(
        (id): id is ModuleId => typeof id === "string" && MODULE_ID_SET.has(id),
      )
    : [...(MODULE_IDS as readonly ModuleId[])];

  const nextSet = new Set<ModuleId>(baseModules);
  if (enabled) {
    nextSet.add(moduleId);
  } else {
    nextSet.delete(moduleId);
  }
  nextSet.add("home");

  const nextModules = (MODULE_IDS as readonly ModuleId[]).filter((id) => nextSet.has(id));

  // Preserve sibling surface keys (e.g. chatIntroSeen) by spreading the
  // existing surface object, then overwriting modules/version.
  const nextSurface = {
    ...currentSurfaceObj,
    modules: nextModules,
    version: 1,
  };

  await deps.writeSurface(orgId, nextSurface);

  return { ok: true, modules: nextModules };
}
