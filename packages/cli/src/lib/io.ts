// io — small impure helpers shared by command handlers: resolving the `-i` run
// input (inline JSON or @file) and mapping an ApiError's status to a friendly,
// HONEST hint. Kept thin; the parsing core (parseInputObject) is pure + tested.

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { ApiError, NoKeyError, NetworkError } from "./api-client.js";

/** Read a single line from stdin behind a prompt (echoed). Impure. Used by
 *  `login` so a builder pastes their key into a prompt — far more reliable than
 *  a shell arg (no quote/truncation gremlins), and the echo lets them SEE the
 *  full key landed. Resolves the trimmed line. */
export function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Parse a JSON object string into a record. Pure. Throws a clear message when
 *  the JSON is invalid or isn't an object. */
export function parseInputObject(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`--input is not valid JSON: ${truncate(raw)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("--input must be a JSON object (e.g. '{\"message\":\"hi\"}').");
  }
  return parsed as Record<string, unknown>;
}

/** Resolve the `-i/--input` value: a leading `@` means read a file, else treat
 *  the value as inline JSON. Returns the parsed object. Impure (reads the file). */
export function resolveInput(value: string | undefined): Record<string, unknown> {
  const v = (value ?? "").trim();
  if (v.length === 0) return {};
  if (v.startsWith("@")) {
    const path = v.slice(1);
    let contents: string;
    try {
      contents = readFileSync(path, "utf8");
    } catch {
      throw new Error(`Could not read --input file: ${path}`);
    }
    return parseInputObject(contents);
  }
  return parseInputObject(v);
}

/** Turn any thrown error into the line(s) the CLI prints to stderr. Honest:
 *  401 → "add a key"; 402 → "top up"; NoKeyError → "add a key". */
export function errorToMessage(err: unknown): string {
  if (err instanceof NoKeyError) {
    return "No active key. Run `seldonframe keys add --label <name> --key wst_…` (mint one at https://app.seldonframe.com/build/keys).";
  }
  if (err instanceof NetworkError) {
    return `${err.message} Check your connection or SELDONFRAME_API_BASE_URL.`;
  }
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return "Unauthorized (401). Your key is missing or invalid — run `seldonframe keys add` with a fresh wst_ key from https://app.seldonframe.com/build/keys.";
    }
    if (err.status === 402) {
      return "Insufficient balance (402) — top up at https://app.seldonframe.com/build/wallet.";
    }
    if (err.status === 429) {
      return "Rate limited (429). Wait a moment and try again.";
    }
    return `API error (${err.status}): ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function truncate(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
