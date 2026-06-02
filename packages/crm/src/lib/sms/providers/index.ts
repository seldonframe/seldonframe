import { twilioProvider } from "./twilio";
import type { SmsProvider } from "./interface";

export { twilioProvider } from "./twilio";
export type { SmsProvider, SmsSendRequest, SmsSendResult } from "./interface";
export { SmsProviderSendError, toE164 } from "./interface";

export const smsProviders: Record<string, SmsProvider> = {
  twilio: twilioProvider,
};

export function getSmsProvider(id: string): SmsProvider | null {
  return smsProviders[id] ?? null;
}
