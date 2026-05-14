import { readFile } from "node:fs/promises";

const cache = new Map<string, string>();

export async function readSkillPack(absolutePath: string): Promise<string> {
  const cached = cache.get(absolutePath);
  if (cached !== undefined) {
    return cached;
  }

  let content: string;
  try {
    content = await readFile(absolutePath, "utf8");
  } catch (err: unknown) {
    const code = err instanceof Error && "code" in err ? (err as { code: string }).code : "";
    if (code === "ENOENT") {
      throw new Error(`Skill pack not found at ${absolutePath}`);
    }
    throw err;
  }

  cache.set(absolutePath, content);
  return content;
}

/** Test-only utility. Resets the in-process cache. */
export function __clearSkillPackCache(): void {
  cache.clear();
}
