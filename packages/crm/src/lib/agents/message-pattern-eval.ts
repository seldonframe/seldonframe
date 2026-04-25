// Pure evaluators for SLICE 7 message-trigger matching.
// SLICE 7 PR 1 C4 per audit §5.1 + §5.2 + gates G-7-1, G-7-3.
//
// Two pure functions, zero I/O:
//   - matchesMessagePattern(pattern, text) → boolean
//   - channelBindingMatches(binding, inbound) → boolean
//
// The schema (validator.ts MessageTriggerSchema) guarantees:
//   - regex pre-compiles successfully (so `new RegExp(value, flags)`
//     here cannot throw on a Zod-validated pattern)
//   - phone binding's `number` is valid E.164
// We re-validate defensively here only for the few whitespace edge
// cases the webhook receiver hasn't normalized yet.

import type { ChannelBinding, MessagePattern, MessageChannel } from "./validator";

export type InboundMessageForMatching = {
  channel: MessageChannel;
  /** Normalized destination (E.164 phone for SMS). */
  to: string;
};

export function matchesMessagePattern(
  pattern: MessagePattern,
  text: string,
): boolean {
  switch (pattern.kind) {
    case "any":
      return true;
    case "exact": {
      if (pattern.caseSensitive) return text === pattern.value;
      return text.toLowerCase() === pattern.value.toLowerCase();
    }
    case "contains": {
      if (pattern.caseSensitive) return text.includes(pattern.value);
      return text.toLowerCase().includes(pattern.value.toLowerCase());
    }
    case "starts_with": {
      if (pattern.caseSensitive) return text.startsWith(pattern.value);
      return text.toLowerCase().startsWith(pattern.value.toLowerCase());
    }
    case "regex": {
      const re = new RegExp(pattern.value, pattern.flags);
      return re.test(text);
    }
  }
}

export function channelBindingMatches(
  binding: ChannelBinding,
  inbound: InboundMessageForMatching,
): boolean {
  switch (binding.kind) {
    case "any":
      return true;
    case "phone":
      return binding.number === inbound.to.trim();
  }
}
