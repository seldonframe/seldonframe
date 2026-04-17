export const TIER_FEATURES = {
  free: {
    maxWorkspaces: 1,
    seldonIt: "byok",
    customDomains: false,
    whiteLabel: false,
    managedEmail: false,
    marketplace: false,
    support: "community",
  },
  starter: {
    maxWorkspaces: 1,
    seldonIt: "byok",
    customDomains: false,
    whiteLabel: false,
    managedEmail: true,
    marketplace: false,
    support: "email",
  },
  cloud_pro: {
    maxWorkspaces: 1,
    seldonIt: "unlimited",
    customDomains: false,
    whiteLabel: false,
    managedEmail: true,
    marketplace: false,
    support: "priority",
  },
  pro_3: {
    maxWorkspaces: 3,
    seldonIt: "unlimited",
    customDomains: true,
    whiteLabel: false,
    managedEmail: true,
    marketplace: false,
    support: "priority",
  },
  pro_5: {
    maxWorkspaces: 5,
    seldonIt: "unlimited",
    customDomains: true,
    whiteLabel: true,
    managedEmail: true,
    marketplace: false,
    support: "priority",
  },
  pro_10: {
    maxWorkspaces: 10,
    seldonIt: "unlimited",
    customDomains: true,
    whiteLabel: true,
    managedEmail: true,
    marketplace: true,
    support: "priority",
  },
  pro_20: {
    maxWorkspaces: 20,
    seldonIt: "unlimited",
    customDomains: true,
    whiteLabel: true,
    managedEmail: true,
    marketplace: true,
    support: "dedicated",
  },
} as const;

export type BillingTier = keyof typeof TIER_FEATURES;

export function getOrgFeatures(tier: string | null | undefined) {
  if (!tier) {
    return TIER_FEATURES.free;
  }

  return TIER_FEATURES[tier as BillingTier] ?? TIER_FEATURES.free;
}
