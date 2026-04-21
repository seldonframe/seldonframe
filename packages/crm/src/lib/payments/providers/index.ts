import { stripeProvider } from "./stripe";
import type { PaymentProvider, PaymentProviderId } from "./interface";

export { stripeProvider } from "./stripe";
export * from "./interface";

export const paymentProviders: Record<PaymentProviderId, PaymentProvider> = {
  stripe: stripeProvider,
};

export function getPaymentProvider(id: PaymentProviderId = "stripe"): PaymentProvider {
  return paymentProviders[id];
}
