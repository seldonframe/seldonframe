import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

type SoulLoaderOptions = {
  soulsRoot?: string;
};

export type SoulPackage = {
  config: Record<string, unknown>;
  landingPages: Array<Record<string, unknown>>;
  emails: Array<Record<string, unknown>>;
  intakeForm: Record<string, unknown> | null;
  proposal: Record<string, unknown> | null;
};

export type SoulSummary = {
  id: string;
  name: string;
  description: string;
  landingPageCount: number;
  emailTemplateCount: number;
  intakeFieldCount: number;
};

const LEGACY_SPLIT_DIRECTORIES = ["landing-pages", "emails", "forms", "proposals"];

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function hasPath(candidatePath: string) {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function assertSingleFileSoulFormat(soulDir: string, soulId: string, config: Record<string, unknown>) {
  for (const legacyDir of LEGACY_SPLIT_DIRECTORIES) {
    const legacyPath = path.resolve(soulDir, legacyDir);
    if (await hasPath(legacyPath)) {
      throw new Error(
        `Soul '${soulId}' uses legacy split format (${legacyDir}/). Use canonical single-file format in soul.json only.`
      );
    }
  }

  const requiredArrayKeys = ["landingPageVariants", "emailTemplates"] as const;
  for (const key of requiredArrayKeys) {
    if (!Array.isArray(config[key])) {
      throw new Error(`Soul '${soulId}' is missing required '${key}' array in soul.json.`);
    }
  }

  if (!config.identity || typeof config.identity !== "object") {
    throw new Error(`Soul '${soulId}' is missing required 'identity' object in soul.json.`);
  }

  if (!config.intakeForm || typeof config.intakeForm !== "object") {
    throw new Error(`Soul '${soulId}' is missing required 'intakeForm' object in soul.json.`);
  }

  if (!config.proposalTemplate || typeof config.proposalTemplate !== "object") {
    throw new Error(`Soul '${soulId}' is missing required 'proposalTemplate' object in soul.json.`);
  }
}

function getCandidateRoots(explicitRoot?: string) {
  if (explicitRoot) {
    return [explicitRoot];
  }

  const cwd = process.cwd();
  return [
    path.resolve(cwd, "souls"),
    path.resolve(cwd, "..", "souls"),
    path.resolve(cwd, "..", "..", "souls"),
  ];
}

async function resolveSoulsRoot(explicitRoot?: string) {
  for (const root of getCandidateRoots(explicitRoot)) {
    try {
      await access(root);
      return root;
    } catch {
      continue;
    }
  }

  throw new Error("Souls directory not found. Expected a souls/ directory in the workspace.");
}

export async function loadSoulPackage(soulId: string, options: SoulLoaderOptions = {}): Promise<SoulPackage> {
  const soulsRoot = await resolveSoulsRoot(options.soulsRoot);
  const soulDir = path.resolve(soulsRoot, soulId);
  const soulPath = path.resolve(soulsRoot, soulId, "soul.json");

  try {
    const raw = await readFile(soulPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    await assertSingleFileSoulFormat(soulDir, soulId, config);

    return {
      config,
      landingPages: Array.isArray(config.landingPageVariants) ? (config.landingPageVariants as Array<Record<string, unknown>>) : [],
      emails: Array.isArray(config.emailTemplates) ? (config.emailTemplates as Array<Record<string, unknown>>) : [],
      intakeForm: (config.intakeForm as Record<string, unknown> | undefined) ?? null,
      proposal: (config.proposalTemplate as Record<string, unknown> | undefined) ?? null,
    };
  } catch (error) {
    throw new Error(`Unable to load soul package '${soulId}' from ${soulPath}: ${(error as Error).message}`);
  }
}

export async function listAvailableSouls(options: SoulLoaderOptions = {}): Promise<SoulSummary[]> {
  const soulsRoot = await resolveSoulsRoot(options.soulsRoot);
  const entries = await readdir(soulsRoot, { withFileTypes: true });

  const summaries: SoulSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidate = path.resolve(soulsRoot, entry.name, "soul.json");
    const soulDir = path.resolve(soulsRoot, entry.name);

    try {
      await access(candidate);
      const raw = await readFile(candidate, "utf-8");
      const config = JSON.parse(raw) as Record<string, unknown>;
      await assertSingleFileSoulFormat(soulDir, entry.name, config);

      const intakeFields = Array.isArray((config.intakeForm as { fields?: unknown[] } | undefined)?.fields)
        ? (((config.intakeForm as { fields?: unknown[] }).fields as unknown[])?.length ?? 0)
        : 0;

      summaries.push({
        id: asString(config.id) || entry.name,
        name: asString(config.name) || entry.name,
        description: asString(config.description),
        landingPageCount: Array.isArray(config.landingPageVariants) ? config.landingPageVariants.length : 0,
        emailTemplateCount: Array.isArray(config.emailTemplates) ? config.emailTemplates.length : 0,
        intakeFieldCount: intakeFields,
      });
    } catch {
      continue;
    }
  }

  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}
