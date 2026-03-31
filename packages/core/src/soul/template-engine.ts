export interface SoulVariables {
  business_name: string;
  owner_name: string;
  owner_full_name: string;
  location?: string;
  specialty?: string;

  contact_singular: string;
  contact_plural: string;
  contact_singular_lower: string;
  contact_plural_lower: string;
  deal_singular: string;
  deal_plural: string;
  deal_singular_lower: string;
  deal_plural_lower: string;
  activity_singular: string;
  activity_plural: string;
  activity_singular_lower: string;
  activity_plural_lower: string;

  stage_1: string;
  stage_2: string;
  stage_3: string;
  stage_last: string;

  industry: string;
  industry_lower: string;

  contactFirstName?: string;
  contactLastName?: string;
  contactEmail?: string;
  bookingDate?: string;
  bookingTime?: string;
  bookingType?: string;

  [key: string]: string | undefined;
}

type SoulLabelGroup = {
  singular?: string;
  plural?: string;
};

type SoulConfigLike = {
  identity?: {
    industry?: string;
    entityLabels?: {
      contact?: SoulLabelGroup;
      deal?: SoulLabelGroup;
      activity?: SoulLabelGroup;
    };
    pipeline?: {
      stages?: Array<string | { name?: string }>;
    };
  };
  industry?: string;
  entityLabels?: {
    contact?: SoulLabelGroup;
    deal?: SoulLabelGroup;
    activity?: SoulLabelGroup;
  };
  pipeline?: {
    stages?: Array<string | { name?: string }>;
  };
};

function readLabel(group: SoulLabelGroup | undefined, fallbackSingular: string, fallbackPlural: string) {
  const singular = group?.singular || fallbackSingular;
  const plural = group?.plural || fallbackPlural;

  return {
    singular,
    plural,
    singularLower: singular.toLowerCase(),
    pluralLower: plural.toLowerCase(),
  };
}

function readStageName(value: string | { name?: string } | undefined) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return value.name || "";
}

function getByPath(source: Record<string, unknown>, path: string): unknown {
  if (!path) {
    return undefined;
  }

  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc == null || typeof acc !== "object") {
      return undefined;
    }

    return (acc as Record<string, unknown>)[part];
  }, source);
}

export function interpolate(template: string, vars: Partial<SoulVariables>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const direct = vars[key as keyof SoulVariables];

    if (direct !== undefined) {
      return String(direct);
    }

    const byPath = getByPath(vars as Record<string, unknown>, key);
    return byPath !== undefined ? String(byPath) : match;
  });
}

export function interpolateDeep<T>(obj: T, vars: Partial<SoulVariables>): T {
  if (typeof obj === "string") {
    return interpolate(obj, vars) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => interpolateDeep(item, vars)) as unknown as T;
  }

  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = interpolateDeep(value, vars);
    }
    return result as T;
  }

  return obj;
}

export function buildSoulVariables(soul: SoulConfigLike, wizardAnswers: Record<string, string>): SoulVariables {
  const labels = soul.identity?.entityLabels ?? soul.entityLabels ?? {};
  const stages = soul.identity?.pipeline?.stages ?? soul.pipeline?.stages ?? [];
  const industry = soul.identity?.industry ?? soul.industry ?? "Service Business";

  const contact = readLabel(labels.contact, "Contact", "Contacts");
  const deal = readLabel(labels.deal, "Deal", "Deals");
  const activity = readLabel(labels.activity, "Activity", "Activities");

  return {
    business_name: wizardAnswers.businessName || "",
    owner_name: wizardAnswers.ownerFirstName || wizardAnswers.ownerName || "",
    owner_full_name: wizardAnswers.ownerFullName || "",
    location: wizardAnswers.location,
    specialty: wizardAnswers.specialty,

    contact_singular: contact.singular,
    contact_plural: contact.plural,
    contact_singular_lower: contact.singularLower,
    contact_plural_lower: contact.pluralLower,
    deal_singular: deal.singular,
    deal_plural: deal.plural,
    deal_singular_lower: deal.singularLower,
    deal_plural_lower: deal.pluralLower,
    activity_singular: activity.singular,
    activity_plural: activity.plural,
    activity_singular_lower: activity.singularLower,
    activity_plural_lower: activity.pluralLower,

    stage_1: readStageName(stages[0]),
    stage_2: readStageName(stages[1]),
    stage_3: readStageName(stages[2]),
    stage_last: readStageName(stages[stages.length - 1]),

    industry,
    industry_lower: industry.toLowerCase(),
  };
}
