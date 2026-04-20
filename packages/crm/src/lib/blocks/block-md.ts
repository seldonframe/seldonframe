export type BlockMdViewType = "table" | "kanban" | "record" | "timeline";

export type BlockMdFieldDefinition = {
  name: string;
  type: string;
  relation?: string;
  options?: string[];
  auto?: boolean;
  raw: string;
};

export type BlockMdEntityRelationDefinition = {
  field: string;
  target: string;
  raw: string;
};

export type BlockMdEntityDefinition = {
  name: string;
  singular?: string;
  plural?: string;
  slug?: string;
  routeBase?: string;
  description?: string;
  fields: BlockMdFieldDefinition[];
  relations: BlockMdEntityRelationDefinition[];
  raw: string[];
};

export type BlockMdViewFilter = {
  field: string;
  value: string;
  operator?: "contains" | "is" | "gt" | "gte" | "lt" | "lte";
};

export type BlockMdViewSort = {
  field: string;
  direction: "asc" | "desc";
};

export type BlockMdSavedViewDefinition = {
  visibility: "personal" | "shared";
  label: string;
};

export type BlockMdViewDefinition = {
  name: string;
  entity: string;
  type: BlockMdViewType;
  route?: string;
  default?: boolean;
  columns: string[];
  fields: string[];
  cardFields: string[];
  filters: BlockMdViewFilter[];
  sorting: BlockMdViewSort[];
  laneField?: string;
  titleField?: string;
  descriptionField?: string;
  wipLimits: Record<string, number>;
  savedViews: BlockMdSavedViewDefinition[];
  raw: string[];
};

export type ParsedBlockMd = {
  title: string | null;
  purpose: string;
  entities: BlockMdEntityDefinition[];
  views: BlockMdViewDefinition[];
  sections: Record<string, string>;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "1";
}

function extractSections(blockMd: string) {
  const lines = blockMd.replace(/\r\n/g, "\n").split("\n");
  const sections: Record<string, string[]> = {};
  let currentSection = "";

  for (const line of lines) {
    if (line.startsWith("## ")) {
      currentSection = line.slice(3).trim().toLowerCase();
      sections[currentSection] = [];
      continue;
    }

    if (!currentSection) {
      continue;
    }

    sections[currentSection].push(line);
  }

  return Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, value.join("\n").trim()]));
}

function parseField(line: string): BlockMdFieldDefinition | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("- ")) {
    return null;
  }

  const match = trimmed.match(/^-\s*([^()]+?)\s*\(([^)]+)\)\s*$/);
  if (!match) {
    return null;
  }

  const [, rawName, rawDescriptor] = match;
  const name = rawName.trim();
  const descriptor = rawDescriptor.trim();
  const normalizedDescriptor = descriptor.toLowerCase();

  if (!name) {
    return null;
  }

  if (normalizedDescriptor.startsWith("relation")) {
    const relationMatch = descriptor.match(/relation\s*->\s*(.+)$/i);
    return {
      name,
      type: "relation",
      relation: relationMatch?.[1]?.trim(),
      raw: trimmed,
    };
  }

  if (normalizedDescriptor.startsWith("enum:")) {
    return {
      name,
      type: "enum",
      options: descriptor
        .slice(descriptor.indexOf(":") + 1)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      raw: trimmed,
    };
  }

  const parts = descriptor.split(",").map((item) => item.trim()).filter(Boolean);

  return {
    name,
    type: parts[0]?.toLowerCase() || descriptor.toLowerCase(),
    auto: parts.some((part) => part.toLowerCase() === "auto"),
    raw: trimmed,
  };
}

function parseEntityMetadata(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("- ")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex < 1) {
    return null;
  }

  const key = trimmed.slice(2, separatorIndex).trim().toLowerCase();
  const value = trimmed.slice(separatorIndex + 1).trim();
  if (!value) {
    return null;
  }

  if (key === "singular" || key === "plural" || key === "slug" || key === "routebase" || key === "description") {
    return { key, value };
  }

  return null;
}

function finalizeEntity(entity: BlockMdEntityDefinition): BlockMdEntityDefinition {
  return {
    ...entity,
    relations: entity.fields
      .filter((field) => field.type === "relation" && field.relation)
      .map((field) => ({
        field: field.name,
        target: field.relation ?? "",
        raw: field.raw,
      })),
  };
}

function parseEntities(section: string) {
  const lines = section.replace(/\r\n/g, "\n").split("\n");
  const entities: BlockMdEntityDefinition[] = [];
  let current: BlockMdEntityDefinition | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("### ")) {
      if (current) {
        entities.push(current);
      }

      current = {
        name: trimmed.slice(4).trim(),
        fields: [],
        relations: [],
        raw: [],
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (trimmed.startsWith("- ")) {
      current.raw.push(trimmed);
    }

    const metadata = parseEntityMetadata(trimmed);
    if (metadata) {
      if (metadata.key === "singular") {
        current.singular = metadata.value;
      } else if (metadata.key === "plural") {
        current.plural = metadata.value;
      } else if (metadata.key === "slug") {
        current.slug = metadata.value;
      } else if (metadata.key === "routebase") {
        current.routeBase = metadata.value.replace(/^\/+|\/+$/g, "");
      } else if (metadata.key === "description") {
        current.description = metadata.value;
      }
      continue;
    }

    const field = parseField(trimmed);
    if (field) {
      current.fields.push(field);
    }
  }

  if (current) {
    entities.push(finalizeEntity(current));
  }

  return entities;
}

function parseFilterItem(input: string): BlockMdViewFilter | null {
  const trimmed = input.trim();
  const operators = [
    { token: ">=", operator: "gte" as const },
    { token: "<=", operator: "lte" as const },
    { token: ">", operator: "gt" as const },
    { token: "<", operator: "lt" as const },
    { token: "=", operator: "contains" as const },
    { token: ":", operator: "contains" as const },
  ];

  for (const candidate of operators) {
    const separatorIndex = trimmed.indexOf(candidate.token);
    if (separatorIndex < 1) {
      continue;
    }

    const field = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + candidate.token.length).trim();
    if (!field || !value) {
      return null;
    }

    return { field, value, operator: candidate.operator };
  }

  return null;
}

function parseSortItem(input: string): BlockMdViewSort | null {
  const separatorIndex = input.indexOf(":");
  if (separatorIndex < 1) {
    return null;
  }

  const field = input.slice(0, separatorIndex).trim();
  const direction = input.slice(separatorIndex + 1).trim().toLowerCase();
  if (!field || (direction !== "asc" && direction !== "desc")) {
    return null;
  }

  return { field, direction };
}

function parseSavedViewItem(input: string): BlockMdSavedViewDefinition | null {
  const separatorIndex = input.indexOf(":");
  if (separatorIndex < 1) {
    return null;
  }

  const visibility = input.slice(0, separatorIndex).trim().toLowerCase();
  const label = input.slice(separatorIndex + 1).trim();

  if ((visibility !== "personal" && visibility !== "shared") || !label) {
    return null;
  }

  return {
    visibility,
    label,
  };
}

function parseWipLimitItem(input: string) {
  const separatorIndex = input.includes("=") ? input.indexOf("=") : input.indexOf(":");
  if (separatorIndex < 1) {
    return null;
  }

  const lane = input.slice(0, separatorIndex).trim();
  const rawValue = Number(input.slice(separatorIndex + 1).trim());
  if (!lane || !Number.isFinite(rawValue)) {
    return null;
  }

  return { lane, value: rawValue };
}

function parseViews(section: string) {
  const lines = section.replace(/\r\n/g, "\n").split("\n");
  const views: BlockMdViewDefinition[] = [];
  let current: BlockMdViewDefinition | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("### ")) {
      if (current) {
        views.push(current);
      }

      current = {
        name: trimmed.slice(4).trim(),
        entity: "",
        type: "table",
        columns: [],
        fields: [],
        cardFields: [],
        filters: [],
        sorting: [],
        wipLimits: {},
        savedViews: [],
        raw: [],
      };
      continue;
    }

    if (!current || !trimmed.startsWith("- ")) {
      continue;
    }

    current.raw.push(trimmed);
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex < 1) {
      continue;
    }

    const rawKey = trimmed.slice(2, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    const key = rawKey.toLowerCase();

    if (key === "entity") {
      current.entity = value;
      continue;
    }

    if (key === "type") {
      if (value === "table" || value === "kanban" || value === "record" || value === "timeline") {
        current.type = value;
      }
      continue;
    }

    if (key === "route") {
      current.route = value;
      continue;
    }

    if (key === "default") {
      current.default = toBoolean(value);
      continue;
    }

    if (key === "columns") {
      current.columns = splitCommaList(value);
      continue;
    }

    if (key === "fields") {
      current.fields = splitCommaList(value);
      continue;
    }

    if (key === "cardfields") {
      current.cardFields = splitCommaList(value);
      continue;
    }

    if (key === "filters") {
      current.filters = value
        .split(",")
        .map((item) => parseFilterItem(item.trim()))
        .filter((item): item is BlockMdViewFilter => Boolean(item));
      continue;
    }

    if (key === "sorting") {
      current.sorting = value
        .split(",")
        .map((item) => parseSortItem(item.trim()))
        .filter((item): item is BlockMdViewSort => Boolean(item));
      continue;
    }

    if (key === "lanefield") {
      current.laneField = value;
      continue;
    }

    if (key === "titlefield") {
      current.titleField = value;
      continue;
    }

    if (key === "descriptionfield") {
      current.descriptionField = value;
      continue;
    }

    if (key === "wiplimits") {
      current.wipLimits = Object.fromEntries(
        value
          .split(",")
          .map((item) => parseWipLimitItem(item.trim()))
          .filter((item): item is { lane: string; value: number } => Boolean(item))
          .map((item) => [item.lane, item.value])
      );
      continue;
    }

    if (key === "savedviews" || key === "savedview") {
      current.savedViews.push(
        ...value
          .split("|")
          .map((item) => parseSavedViewItem(item.trim()))
          .filter((item): item is BlockMdSavedViewDefinition => Boolean(item))
      );
    }
  }

  if (current) {
    views.push(current);
  }

  return views.filter((view) => view.name && view.entity);
}

function pickPrimaryField(entity: BlockMdEntityDefinition) {
  return (
    entity.fields.find((field) => /^(name|title|subject)$/i.test(field.name))?.name ||
    entity.fields.find((field) => field.type !== "relation")?.name ||
    entity.fields[0]?.name ||
    "name"
  );
}

function buildDefaultViews(entities: BlockMdEntityDefinition[]): BlockMdViewDefinition[] {
  const primaryEntity = entities[0];
  if (!primaryEntity) {
    return [];
  }

  const singularLabel = primaryEntity.singular?.trim() || primaryEntity.name;
  const pluralLabel = primaryEntity.plural?.trim() || primaryEntity.name;
  const routeBase = primaryEntity.routeBase?.trim().replace(/^\/+|\/+$/g, "") || slugify(primaryEntity.slug || pluralLabel) || "records";
  const primaryField = pickPrimaryField(primaryEntity);
  const defaultColumns = primaryEntity.fields
    .filter((field) => field.type !== "long text" && field.type !== "rich text" && field.type !== "key-value map")
    .slice(0, 5)
    .map((field) => field.name);
  const defaultFields = primaryEntity.fields.slice(0, 8).map((field) => field.name);
  const stageField = primaryEntity.fields.find((field) => field.type === "enum" && /stage|status|pipeline|lane/i.test(field.name));

  const views: BlockMdViewDefinition[] = [
    {
      name: `${pluralLabel} Table`,
      entity: singularLabel,
      type: "table",
      route: `/${routeBase}`,
      default: true,
      columns: defaultColumns,
      fields: [],
      cardFields: [],
      filters: stageField ? [{ field: stageField.name, value: stageField.options?.[0] ?? "active" }] : [],
      sorting: [{ field: primaryEntity.fields.find((field) => /updatedat|createdat/i.test(field.name))?.name ?? primaryField, direction: "desc" }],
      laneField: undefined,
      titleField: undefined,
      descriptionField: undefined,
      wipLimits: {},
      savedViews: [
        { visibility: "personal", label: `My ${pluralLabel} Queue` },
        { visibility: "shared", label: `${pluralLabel} Team View` },
      ],
      raw: [],
    },
    {
      name: `${singularLabel} Record`,
      entity: singularLabel,
      type: "record",
      route: `/${routeBase}/[id]`,
      default: false,
      columns: [],
      fields: defaultFields,
      cardFields: [],
      filters: [],
      sorting: [],
      laneField: undefined,
      titleField: primaryField,
      descriptionField: primaryEntity.fields.find((field) => /description|summary|notes/i.test(field.name))?.name,
      wipLimits: {},
      savedViews: [],
      raw: [],
    },
  ];

  if (stageField) {
    views.push({
      name: `${pluralLabel} Pipeline`,
      entity: singularLabel,
      type: "kanban",
      route: `/${routeBase}/pipeline`,
      default: false,
      columns: [],
      fields: [],
      cardFields: [
        primaryField,
        ...primaryEntity.fields
          .filter((field) => field.name !== primaryField && field.type !== "long text" && field.type !== "rich text")
          .slice(0, 3)
          .map((field) => field.name),
      ],
      filters: [],
      sorting: [],
      laneField: stageField.name,
      titleField: primaryField,
      descriptionField: primaryEntity.fields.find((field) => /description|summary|notes/i.test(field.name))?.name,
      wipLimits: Object.fromEntries((stageField.options ?? []).slice(0, 5).map((option) => [option, 10])),
      savedViews: [
        { visibility: "personal", label: `My ${pluralLabel} Pipeline` },
        { visibility: "shared", label: `${pluralLabel} Pipeline` },
      ],
      raw: [],
    });
  }

  return views;
}

function serializeViewsSection(views: BlockMdViewDefinition[]) {
  const body = views
    .map((view) => {
      const lines = [
        `### ${view.name}`,
        `- entity: ${view.entity}`,
        `- type: ${view.type}`,
      ];

      if (view.route) {
        lines.push(`- route: ${view.route}`);
      }
      if (typeof view.default === "boolean") {
        lines.push(`- default: ${view.default ? "true" : "false"}`);
      }
      if (view.columns.length > 0) {
        lines.push(`- columns: ${view.columns.join(", ")}`);
      }
      if (view.fields.length > 0) {
        lines.push(`- fields: ${view.fields.join(", ")}`);
      }
      if (view.cardFields.length > 0) {
        lines.push(`- cardFields: ${view.cardFields.join(", ")}`);
      }
      if (view.filters.length > 0) {
        lines.push(`- filters: ${view.filters.map((filter) => {
          const token = filter.operator === "gt"
            ? ">"
            : filter.operator === "gte"
              ? ">="
              : filter.operator === "lt"
                ? "<"
                : filter.operator === "lte"
                  ? "<="
                  : filter.operator === "is"
                    ? ":"
                    : "=";
          return `${filter.field}${token}${filter.value}`;
        }).join(", ")}`);
      }
      if (view.sorting.length > 0) {
        lines.push(`- sorting: ${view.sorting.map((sort) => `${sort.field}:${sort.direction}`).join(", ")}`);
      }
      if (view.laneField) {
        lines.push(`- laneField: ${view.laneField}`);
      }
      if (view.titleField) {
        lines.push(`- titleField: ${view.titleField}`);
      }
      if (view.descriptionField) {
        lines.push(`- descriptionField: ${view.descriptionField}`);
      }
      if (Object.keys(view.wipLimits).length > 0) {
        lines.push(`- wipLimits: ${Object.entries(view.wipLimits).map(([lane, value]) => `${lane}=${value}`).join(", ")}`);
      }
      if (view.savedViews.length > 0) {
        lines.push(`- savedViews: ${view.savedViews.map((savedView) => `${savedView.visibility}:${savedView.label}`).join(" | ")}`);
      }

      return lines.join("\n");
    })
    .join("\n\n");

  return `## Views\n\n${body}`;
}

export function serializeBlockMdViews(views: BlockMdViewDefinition[]) {
  return serializeViewsSection(views);
}

export function parseBlockMd(blockMd: string): ParsedBlockMd {
  const normalized = blockMd.replace(/\r\n/g, "\n").trim();
  const titleMatch = normalized.match(/^#\s*BLOCK(?:\.md)?\s*:\s*(.+)$/im);
  const sections = extractSections(normalized);

  return {
    title: titleMatch?.[1]?.trim() || null,
    purpose: sections.purpose ?? "",
    entities: parseEntities(sections.entities ?? ""),
    views: parseViews(sections.views ?? ""),
    sections,
  };
}

export function normalizeGeneratedBlockMd(blockMd: string) {
  const normalized = blockMd.replace(/\r\n/g, "\n").trim();
  const parsed = parseBlockMd(normalized);

  if (parsed.views.length > 0) {
    return {
      blockMd: normalized,
      parsed,
    };
  }

  const defaultViews = buildDefaultViews(parsed.entities);
  if (defaultViews.length === 0) {
    return {
      blockMd: normalized,
      parsed,
    };
  }

  const viewsSection = serializeViewsSection(defaultViews);
  const nextBlockMd = /(^|\n)## Navigation\b/i.test(normalized)
    ? normalized.replace(/(^|\n)(## Navigation\b)/i, `\n\n${viewsSection}\n\n$2`)
    : `${normalized}\n\n${viewsSection}`;

  return {
    blockMd: nextBlockMd.trim(),
    parsed: {
      ...parsed,
      views: defaultViews,
      sections: {
        ...parsed.sections,
        views: viewsSection.replace(/^## Views\n\n/, ""),
      },
    },
  };
}

export function replaceBlockMdViews(blockMd: string, views: BlockMdViewDefinition[]) {
  const normalized = blockMd.replace(/\r\n/g, "\n").trim();
  const viewsSection = serializeViewsSection(views);

  if (/(^|\n)## Views\b/i.test(normalized)) {
    const match = normalized.match(/(^|\n)## Views\b[\s\S]*?(?=\n## [^\n]+|$)/i);
    if (match) {
      const replacement = `${match[0].startsWith("\n") ? "\n" : ""}${viewsSection}`;
      return normalized.replace(match[0], replacement).trim();
    }
  }

  const nextBlockMd = /(^|\n)## Navigation\b/i.test(normalized)
    ? normalized.replace(/(^|\n)(## Navigation\b)/i, `\n\n${viewsSection}\n\n$2`)
    : `${normalized}\n\n${viewsSection}`;

  return nextBlockMd.trim();
}

export function replaceBlockMdSection(blockMd: string, sectionTitle: string, body: string) {
  const normalized = blockMd.replace(/\r\n/g, "\n").trim();
  const normalizedTitle = sectionTitle.trim();
  const section = `## ${normalizedTitle}\n\n${body.trim()}`;
  const sectionPattern = new RegExp(`(^|\\n)## ${normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[\\s\\S]*?(?=\\n## [^\\n]+|$)`, "i");

  if (sectionPattern.test(normalized)) {
    const match = normalized.match(sectionPattern);
    if (match) {
      const replacement = `${match[0].startsWith("\n") ? "\n" : ""}${section}`;
      return normalized.replace(match[0], replacement).trim();
    }
  }

  const nextBlockMd = /(^|\n)## Navigation\b/i.test(normalized)
    ? normalized.replace(/(^|\n)(## Navigation\b)/i, `\n\n${section}\n\n$2`)
    : `${normalized}\n\n${section}`;

  return nextBlockMd.trim();
}
