import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type HarnessRules = {
  end_client_customization?: boolean;
};

const defaultHarnessRules: HarnessRules = {
  end_client_customization: false,
};

function resolveHarnessRulesPath() {
  const candidates = [
    join(process.cwd(), "harness-rules.json"),
    join(process.cwd(), "packages", "crm", "harness-rules.json"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function getHarnessRules(): HarnessRules {
  const harnessPath = resolveHarnessRulesPath();

  if (!harnessPath) {
    return defaultHarnessRules;
  }

  try {
    const parsed = JSON.parse(readFileSync(harnessPath, "utf8")) as HarnessRules;
    return {
      ...defaultHarnessRules,
      ...parsed,
    };
  } catch {
    return defaultHarnessRules;
  }
}
