export type ExportableSoul = Record<string, unknown>;

export type ExportedSoulConfig = {
  version: 1;
  orgId: string;
  exportedAt: string;
  soul: ExportableSoul;
};

export function exportSoulConfig(orgId: string, soul: ExportableSoul) {
  const payload: ExportedSoulConfig = {
    version: 1,
    orgId,
    exportedAt: new Date().toISOString(),
    soul,
  };

  return {
    fileName: `${orgId}.seldon.json`,
    content: JSON.stringify(payload, null, 2),
  };
}

export function importSoulConfig(input: string | Buffer) {
  const raw = typeof input === "string" ? input : input.toString("utf-8");
  const parsed = JSON.parse(raw) as Partial<ExportedSoulConfig>;

  if (parsed.version !== 1 || !parsed.orgId || !parsed.soul || typeof parsed.soul !== "object") {
    throw new Error("Invalid .seldon.json payload");
  }

  return parsed as ExportedSoulConfig;
}
