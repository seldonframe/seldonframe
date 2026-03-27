export type CloudSoulInput = {
  businessName: string;
  offerType: string;
  industry: string;
  clientType: string;
  clientLabel: string;
  processDescription: string;
  communicationStyle: string;
  priorities: string[];
  narrative: string;
};

export type CloudTier = "free" | "pro" | "enterprise";
