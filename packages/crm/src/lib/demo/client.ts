import { DEMO_BLOCK_MESSAGE } from "@/lib/demo/constants";

export const isDemoReadonlyClient = process.env.NEXT_PUBLIC_DEMO_READONLY === "true";

export function isDemoBlockedError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("Demo mode") || error.message.includes(DEMO_BLOCK_MESSAGE);
}
