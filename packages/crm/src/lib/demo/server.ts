import { NextResponse } from "next/server";
import { DEMO_API_BLOCK_MESSAGE, DEMO_BLOCK_MESSAGE, DEMO_REPO_URL } from "@/lib/demo/constants";

export function isDemoReadonly() {
  return process.env.NEXT_PUBLIC_DEMO_READONLY === "true";
}

export function assertWritable() {
  if (isDemoReadonly()) {
    throw new Error(DEMO_BLOCK_MESSAGE);
  }
}

export function demoApiBlockedResponse() {
  return NextResponse.json(
    {
      error: DEMO_API_BLOCK_MESSAGE,
      repo: DEMO_REPO_URL,
    },
    { status: 403 }
  );
}

export function isWriteMethod(method: string) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}
