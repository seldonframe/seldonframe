export function hasEnv(...keys: string[]) {
  return keys.every((key) => {
    const value = process.env[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

export async function simpleHealthCheck(configured: boolean) {
  return configured;
}
