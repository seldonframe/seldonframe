export const CLOUD_TIERS = {
  starter: {
    price: 4900,
    limits: {
      landingPages: 1,
      emailSendsPerMonth: 1000,
      teamMembers: 1,
      aiCallsPerDay: 5,
      portalEnabled: false,
      aiCustomizationEnabled: false,
      customDomain: false,
      removeBranding: false,
    },
  },
  growth: {
    price: 9900,
    limits: {
      landingPages: Number.POSITIVE_INFINITY,
      emailSendsPerMonth: 10000,
      teamMembers: 3,
      aiCallsPerDay: Number.POSITIVE_INFINITY,
      portalEnabled: true,
      aiCustomizationEnabled: true,
      customDomain: true,
      removeBranding: true,
    },
  },
  scale: {
    price: 19900,
    limits: {
      landingPages: Number.POSITIVE_INFINITY,
      emailSendsPerMonth: 50000,
      teamMembers: 10,
      aiCallsPerDay: Number.POSITIVE_INFINITY,
      portalEnabled: true,
      aiCustomizationEnabled: true,
      customDomain: true,
      removeBranding: true,
    },
  },
} as const;

export const PRO_TIERS = {
  starter: {
    price: 14900,
    includedClients: 3,
    perAdditionalClient: 2900,
    allFeaturesForClients: true,
  },
  growth: {
    price: 34900,
    includedClients: 10,
    perAdditionalClient: 2500,
    allFeaturesForClients: true,
  },
  agency: {
    price: 69900,
    includedClients: 25,
    perAdditionalClient: 1900,
    allFeaturesForClients: true,
  },
  enterprise: {
    price: 199900,
    includedClients: 75,
    perAdditionalClient: 1200,
    allFeaturesForClients: true,
  },
} as const;

export type CloudTierKey = keyof typeof CLOUD_TIERS;
export type ProTierKey = keyof typeof PRO_TIERS;
