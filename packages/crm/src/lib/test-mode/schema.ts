// Per-provider test-mode credential schemas + composite TestModeConfigSchema.
// SLICE 8 C1 per audit §3.2 + gates G-8-1 (top-level testMode column),
// G-8-3 (admin banner + customer badge), G-8-4 (fail-fast on missing creds).
//
// Cross-ref Zod edges (5-6 total, single gate per L-17 hypothesis):
//   1. Twilio test.accountSid format refine (must start with "AC")
//   2. Twilio test.authToken non-empty refine
//   3. Twilio test.fromNumber E.164 refine
//   4. Resend test.apiKey format refine (must start with "re_test_")
//   5. Resend test.fromEmail email refine
//   6. (composite superRefine) per-provider all-or-nothing — partial
//      sub-objects are rejected, preventing builder confusion
//
// Per L-17 hypothesis (4-datapoint settled):
//   expected_ratio = base(5-6 edges) × gate_breadth(1 gate)
//                  = 2.5-3.0x test/prod
// SLICE 8 close-out documents the actual.

import { z } from "zod";

const E164Regex = /^\+[1-9]\d{1,14}$/;
const TwilioAccountSidRegex = /^AC[a-zA-Z0-9]+$/;
const ResendTestKeyRegex = /^re_test_[a-zA-Z0-9_-]+$/;

export const TwilioTestConfigSchema = z.object({
  accountSid: z
    .string()
    .min(1)
    .refine((v) => TwilioAccountSidRegex.test(v), {
      message: 'Twilio test accountSid must start with "AC"',
    }),
  authToken: z.string().min(1),
  fromNumber: z
    .string()
    .min(1)
    .refine((v) => E164Regex.test(v), {
      message:
        "Twilio test fromNumber must be E.164 (e.g., +15005550006). " +
        "Use Twilio magic test numbers — see twilio.com/docs/iam/test-credentials",
    }),
});

export type TwilioTestConfig = z.infer<typeof TwilioTestConfigSchema>;

export const ResendTestConfigSchema = z.object({
  apiKey: z
    .string()
    .min(1)
    .refine((v) => ResendTestKeyRegex.test(v), {
      message:
        'Resend test apiKey must start with "re_test_" (test keys ' +
        "are distinct from re_live_ production keys; see " +
        "resend.com/docs/dashboard/api-keys/introduction)",
    }),
  fromEmail: z.string().email(),
});

export type ResendTestConfig = z.infer<typeof ResendTestConfigSchema>;

// Composite — both providers optional individually. The composite
// schema accepts partial provider coverage (e.g., builder configures
// only Twilio test creds, not Resend yet). The validator just enforces
// per-provider all-or-nothing inside each sub-object via the inner
// schemas' required fields.
export const TestModeConfigSchema = z.object({
  twilio: TwilioTestConfigSchema.optional(),
  resend: ResendTestConfigSchema.optional(),
});

export type TestModeConfig = z.infer<typeof TestModeConfigSchema>;
