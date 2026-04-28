export interface Plan {
  id: string;
  name: string;
  type: "cloud" | "pro";
  price: number;
  yearlyPrice: number;
  stripePriceId: string;
  stripeYearlyPriceId: string;
  limits: {
    maxOrgs: number;
    maxContacts: number;
    maxEmailsPerMonth: number;
    customDomain: boolean;
    removeBranding: boolean;
  };
}

export const PLANS: Plan[] = [
  {
    id: "cloud-starter",
    name: "Cloud Starter",
    type: "cloud",
    price: 49,
    yearlyPrice: 468,
    // Live Stripe price (lookup_key: starter_monthly). Marketing surface
    // labels this tier "Starter" — see /pricing and the landing
    // Pricing component.
    stripePriceId: "price_1TQzh7JOtNZA0x7xLOTicHkW",
    stripeYearlyPriceId: "",
    limits: {
      maxOrgs: 1,
      maxContacts: 500,
      maxEmailsPerMonth: 1000,
      customDomain: false,
      removeBranding: false,
    },
  },
  {
    id: "cloud-pro",
    name: "Cloud Pro",
    type: "cloud",
    price: 99,
    yearlyPrice: 948,
    // Live Stripe price (lookup_key: cloud_pro_monthly). Marketing surface
    // labels this tier "Operator".
    stripePriceId: "price_1TNY81JOtNZA0x7xsulCSP6x",
    stripeYearlyPriceId: "",
    limits: {
      maxOrgs: 1,
      maxContacts: -1,
      maxEmailsPerMonth: 10000,
      customDomain: true,
      removeBranding: true,
    },
  },
  {
    id: "pro-3",
    name: "Pro 3",
    type: "pro",
    price: 149,
    yearlyPrice: 1428,
    // Live Stripe price (lookup_key: pro_3_monthly). Marketing surface
    // labels this tier "Agency".
    stripePriceId: "price_1TQzjrJOtNZA0x7xV4UFxWrH",
    stripeYearlyPriceId: "",
    limits: {
      maxOrgs: 3,
      maxContacts: -1,
      maxEmailsPerMonth: -1,
      customDomain: true,
      removeBranding: true,
    },
  },
  {
    id: "pro-5",
    name: "Pro 5",
    type: "pro",
    price: 199,
    yearlyPrice: 1908,
    stripePriceId: "",
    stripeYearlyPriceId: "",
    limits: {
      maxOrgs: 5,
      maxContacts: -1,
      maxEmailsPerMonth: -1,
      customDomain: true,
      removeBranding: true,
    },
  },
  {
    id: "pro-10",
    name: "Pro 10",
    type: "pro",
    price: 299,
    yearlyPrice: 2868,
    stripePriceId: "",
    stripeYearlyPriceId: "",
    limits: {
      maxOrgs: 10,
      maxContacts: -1,
      maxEmailsPerMonth: -1,
      customDomain: true,
      removeBranding: true,
    },
  },
  {
    id: "pro-20",
    name: "Pro 20",
    type: "pro",
    price: 449,
    yearlyPrice: 4308,
    stripePriceId: "",
    stripeYearlyPriceId: "",
    limits: {
      maxOrgs: 20,
      maxContacts: -1,
      maxEmailsPerMonth: -1,
      customDomain: true,
      removeBranding: true,
    },
  },
];

export function getPlan(planId: string): Plan | undefined {
  return PLANS.find((plan) => plan.id === planId);
}

export function getCloudPlans(): Plan[] {
  return PLANS.filter((plan) => plan.type === "cloud");
}

export function getProPlans(): Plan[] {
  return PLANS.filter((plan) => plan.type === "pro");
}

export function getPlanByStripePriceId(priceId: string): { plan: Plan; billingPeriod: "monthly" | "yearly" } | null {
  for (const plan of PLANS) {
    if (plan.stripePriceId && plan.stripePriceId === priceId) {
      return { plan, billingPeriod: "monthly" };
    }

    if (plan.stripeYearlyPriceId && plan.stripeYearlyPriceId === priceId) {
      return { plan, billingPeriod: "yearly" };
    }
  }

  return null;
}
