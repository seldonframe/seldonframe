// deploy — deploy an agent (self-built template or a marketplace listing) and
// either surface the one-time connect wizard link or confirm it's live. Calls
// the money-safe POST /api/v1/build/deploy and renders the server's verdict
// honestly. The CLI does NO deploy logic of its own — it relays the DeployResult.

import type { ParsedArgs } from "../lib/args.js";
import type { Writer } from "../lib/output.js";
import type { ApiClient, DeployPhone, DeploySource } from "../lib/api-client.js";
import { errorToMessage } from "../lib/io.js";

/** Resolve --template/--listing → the DeploySource, or a usage-error string. */
function readSource(args: ParsedArgs): DeploySource | string {
  const templateId = (args.flags.template ?? "").trim();
  const listingSlug = (args.flags.listing ?? "").trim();
  if (templateId) return { templateId };
  if (listingSlug) return { listingSlug };
  return "Specify what to deploy: --template <id> (your own agent) or --listing <slug> (a marketplace listing).";
}

/** Resolve --forward/--area → the DeployPhone. Neither flag ⇒ undefined (the
 *  deployment may already have a number, or need none) — the server decides. */
function readPhone(args: ParsedArgs): DeployPhone | undefined {
  const forward = (args.flags.forward ?? "").trim();
  const area = (args.flags.area ?? "").trim();
  // The server normalizes/validates the number — the CLI passes it through raw.
  if (forward) return { mode: "forward", number: forward };
  if (area) return { mode: "provision", areaCode: area };
  return undefined;
}

export async function runDeployCommand(
  args: ParsedArgs,
  client: ApiClient,
  writer: Writer,
): Promise<number> {
  if (!client.hasKey()) {
    writer.err("No key yet. Run `seldonframe login`.");
    return 1;
  }

  const source = readSource(args);
  if (typeof source === "string") {
    writer.err(source);
    return 1;
  }
  const phone = readPhone(args);

  let result;
  try {
    result = await client.deploy({ source, phone });
  } catch (err) {
    writer.err(errorToMessage(err));
    return 1;
  }

  if (args.json) {
    writer.out(JSON.stringify(result, null, 2));
    return result.ok && result.status !== "disabled" ? 0 : 1;
  }

  if (!result.ok) {
    writer.err(`Deploy failed: ${result.reason}`);
    return 1;
  }

  switch (result.status) {
    case "needs_connect": {
      writer.out("Connect these once, then re-run `seldonframe deploy`:");
      for (const req of result.missing) {
        writer.out(`  - ${req.label}`);
      }
      writer.out(`→ ${result.wizardUrl}`);
      return 0;
    }
    case "live":
      writer.out(`✓ deployed — ${result.phoneNumber ?? "your agent"} is answering.`);
      return 0;
    case "disabled":
      writer.err("Self-serve deploy isn't enabled on this workspace yet.");
      return 1;
  }
}
