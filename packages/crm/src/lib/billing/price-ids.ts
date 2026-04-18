export const WORKSPACE_ADDON_MONTHLY_PRICE_ID = "price_1TMC7UJOtNZA0x7xNrl2VDVE";
export const SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID = "price_1TNY81JOtNZA0x7xsulCSP6x";

export type SeldonCheckoutPriceId =
  | typeof WORKSPACE_ADDON_MONTHLY_PRICE_ID
  | typeof SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID;

export function isAllowedCheckoutPriceId(priceId: string): priceId is SeldonCheckoutPriceId {
  return priceId === WORKSPACE_ADDON_MONTHLY_PRICE_ID || priceId === SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID;
}

export function isSelfServiceCheckoutPriceId(priceId: string | null | undefined) {
  return priceId === SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID;
}
