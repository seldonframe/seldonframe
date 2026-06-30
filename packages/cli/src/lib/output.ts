// output — the print sink. A tiny indirection over console so command handlers
// take a Writer and the CLI wires the real stdout/stderr. The `emit` helper picks
// JSON vs the human renderer based on the global --json flag.

export type Writer = {
  out: (line: string) => void;
  err: (line: string) => void;
};

export const consoleWriter: Writer = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

/** Emit a result: when `json` is set, the raw payload as pretty JSON; otherwise
 *  the human string produced by `human(payload)`. */
export function emit<T>(writer: Writer, json: boolean, payload: T, human: (p: T) => string): void {
  if (json) {
    writer.out(JSON.stringify(payload, null, 2));
  } else {
    writer.out(human(payload));
  }
}
