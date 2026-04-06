export interface SoulPackage {
  version: "1.0";

  meta: {
    name: string;
    slug: string;
    description: string;
    longDescription?: string;
    niche: string;
    tags: string[];
    creatorName: string;
    previewImages: string[];
  };

  soul: {
    businessType?: string;
    industry?: string;
    services?: Array<{ name: string; description: string; price?: string; duration?: string }>;
    pipelineStages?: Array<{ name: string; order: number }>;
    voiceGuide?: string;
    customContext?: string;
    framework?: string;
  };

  wiki: {
    articles: Array<{
      slug: string;
      title: string;
      category: string;
      content: string;
    }>;
  };

  theme: {
    primaryColor: string;
    accentColor: string;
    fontFamily: string;
    borderRadius: string;
    mode: "light" | "dark";
    logoUrl?: string;
  };

  blocks: {
    templates: Array<{
      type: "page" | "form" | "email" | "booking";
      name: string;
      slug: string;
      description: string;
      data: unknown;
    }>;
  };
}
