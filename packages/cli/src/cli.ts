#!/usr/bin/env node
// cli — the seldonframe entry point. Parses argv, routes to a command, and sets
// the process exit code. Thin: each command's logic lives in src/commands/*; this
// file wires the real Writer (stdout/stderr), the on-disk key store, and the API
// client (active key + SELDONFRAME_API_BASE_URL).
//
// Pipeline: parseArgs → (--version | --help | command) → exit code.

import { parseArgs, type ParsedArgs } from "./lib/args.js";
import { HELP_TEXT } from "./lib/help.js";
import { getVersion } from "./lib/version.js";
import { consoleWriter, type Writer } from "./lib/output.js";
import { ApiClient } from "./lib/api-client.js";
import { processConfigEnv, resolveApiKey, addKey, loadStore, saveStore } from "./lib/key-store.js";
import { runKeysCommand } from "./commands/keys.js";
import {
  runDiscoverCommand,
  runInspectCommand,
  runRunCommand,
  runWalletCommand,
} from "./commands/marketplace.js";
import { runLoginCommand } from "./commands/login.js";
import { runStatusCommand } from "./commands/status.js";
import { runPayoutCommand } from "./commands/payout.js";
import { errorToMessage, promptLine } from "./lib/io.js";

/** Build an ApiClient from the active stored key + the (overridable) API base. */
function buildClient(): ApiClient {
  const cfg = processConfigEnv();
  return new ApiClient({
    baseUrl: process.env.SELDONFRAME_API_BASE_URL ?? "https://app.seldonframe.com",
    apiKey: resolveApiKey(cfg),
  });
}

export async function dispatch(args: ParsedArgs, writer: Writer): Promise<number> {
  // --version / --help short-circuit (work with or without a command).
  if (args.version) {
    writer.out(getVersion());
    return 0;
  }
  if (args.help || args.command === null) {
    writer.out(HELP_TEXT);
    // No command at all is a usage miss → non-zero so scripts notice; an explicit
    // --help is a success.
    return args.help ? 0 : args.command === null ? 1 : 0;
  }

  switch (args.command) {
    case "keys":
      return runKeysCommand(args, writer, processConfigEnv());
    case "login":
      return runLoginCommand(args, writer, {
        promptKey: promptLine,
        verifyKey: async (key) => {
          try {
            await new ApiClient({
              baseUrl: process.env.SELDONFRAME_API_BASE_URL ?? "https://app.seldonframe.com",
              apiKey: key,
            }).walletBalance();
            return true;
          } catch {
            return false;
          }
        },
        storeKey: (label, key) => {
          const cfg = processConfigEnv();
          saveStore(addKey(loadStore(cfg), label, key), cfg);
        },
      });
    case "discover":
      return runDiscoverCommand(args, buildClient(), writer);
    case "inspect":
      return runInspectCommand(args, buildClient(), writer);
    case "run":
      return runRunCommand(args, buildClient(), writer);
    case "wallet":
      return runWalletCommand(args, buildClient(), writer);
    case "status":
      return runStatusCommand(args, buildClient(), writer);
    case "payout":
      return runPayoutCommand(args, buildClient(), writer);
    case "help":
      writer.out(HELP_TEXT);
      return 0;
    case "version":
      writer.out(getVersion());
      return 0;
    default:
      writer.err(`Unknown command "${args.command}". Run \`seldonframe --help\`.`);
      return 1;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let code: number;
  try {
    code = await dispatch(args, consoleWriter);
  } catch (err) {
    consoleWriter.err(errorToMessage(err));
    code = 1;
  }
  process.exitCode = code;
}

void main();
