// Server-safe fields import — puck/config.impl.tsx is a client boundary
// (uses React hooks) and would pull useState/useEffect into any
// server-runtime bundle transitively importing it (see the 2026-04-21
// Vercel deploy-failure fix). config-fields.ts carries the same fields
// data as pure JSON, importable from anywhere.
import { componentFieldRegistry } from "./config-fields";

// Pre-save validator for Puck payloads. Closes the D-5 risk surface:
// when Claude (or any other generator) produces a Puck JSON blob, we
// want to catch schema drift *before* it hits the editor or the
// public renderer. Failure modes this caches — each observed in the
// Phase 6.a spike:
// - wrong enum values (e.g. Hero.alignment: "middle")
// - missing props.id on a component
// - unknown component type
// - malformed zone key (expects "<parentId>:<slotName>")
// - undocumented props that aren't in the component's fields

type JsonObject = Record<string, unknown>;

export type PuckPayload = {
  content: Array<{ type: string; props: JsonObject }>;
  root?: { props?: JsonObject };
  zones?: Record<string, Array<{ type: string; props: JsonObject }>>;
};

export type PuckValidationIssue = {
  code:
    | "payload_not_object"
    | "content_not_array"
    | "root_missing"
    | "zones_not_object"
    | "item_not_object"
    | "missing_type"
    | "unknown_component"
    | "missing_props"
    | "missing_id"
    | "duplicate_id"
    | "malformed_zone_key"
    | "undocumented_prop"
    | "enum_violation";
  path: string;
  message: string;
};

export type PuckValidationResult =
  | { ok: true; payload: PuckPayload; issues: [] }
  | { ok: false; payload: PuckPayload | null; issues: PuckValidationIssue[] };

// Pull the declared component fields out of the Puck config — this
// is the source of truth. If a field isn't here, the editor has no
// UI for it and Claude should not be emitting it.
function getComponentFields(type: string): {
  fields: Record<string, { type: string; options?: Array<{ value: string | number }> }>;
  hasSlot: boolean;
} | null {
  const component = componentFieldRegistry[type];
  if (!component || !component.fields) return null;
  const fields = component.fields as Record<string, { type: string; options?: Array<{ value: string | number }> }>;
  const hasSlot = Object.values(fields).some((field) => field?.type === "slot");
  return { fields, hasSlot };
}

const ZONE_KEY_RE = /^[^:]+:[^:]+$/;

export function validatePuckPayload(input: unknown): PuckValidationResult {
  const issues: PuckValidationIssue[] = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    issues.push({ code: "payload_not_object", path: "$", message: "payload is not an object" });
    return { ok: false, payload: null, issues };
  }

  const payload = input as JsonObject;

  if (!Array.isArray(payload.content)) {
    issues.push({ code: "content_not_array", path: "content", message: "content is not an array" });
    return { ok: false, payload: null, issues };
  }

  if (!payload.root || typeof payload.root !== "object") {
    issues.push({ code: "root_missing", path: "root", message: "root is missing or not an object" });
  }

  if (payload.zones !== undefined && (typeof payload.zones !== "object" || Array.isArray(payload.zones))) {
    issues.push({ code: "zones_not_object", path: "zones", message: "zones is not a plain object" });
  }

  const seenIds = new Set<string>();

  function checkItem(raw: unknown, path: string) {
    if (!raw || typeof raw !== "object") {
      issues.push({ code: "item_not_object", path, message: "item is not an object" });
      return;
    }
    const item = raw as JsonObject;

    if (typeof item.type !== "string" || !item.type) {
      issues.push({ code: "missing_type", path, message: "missing type string" });
      return;
    }

    const component = getComponentFields(item.type);
    if (!component) {
      issues.push({
        code: "unknown_component",
        path,
        message: `type "${item.type}" is not in the Puck registry`,
      });
      // Keep going — malformed props are still worth reporting for
      // adjacent well-formed items.
    }

    if (!item.props || typeof item.props !== "object") {
      issues.push({ code: "missing_props", path, message: "missing props object" });
      return;
    }
    const props = item.props as JsonObject;

    if (typeof props.id !== "string" || !props.id) {
      issues.push({ code: "missing_id", path: `${path}.props`, message: "props.id missing or not a non-empty string" });
    } else {
      if (seenIds.has(props.id)) {
        issues.push({
          code: "duplicate_id",
          path: `${path}.props.id`,
          message: `duplicate props.id "${props.id}"`,
        });
      }
      seenIds.add(props.id);
    }

    if (component) {
      for (const [propName, value] of Object.entries(props)) {
        if (propName === "id") continue;
        const field = component.fields[propName];
        if (!field) {
          issues.push({
            code: "undocumented_prop",
            path: `${path}.props.${propName}`,
            message: `"${propName}" is not a documented field on ${item.type}`,
          });
          continue;
        }
        // Enum check for fields with explicit options.
        if ((field.type === "select" || field.type === "radio") && Array.isArray(field.options)) {
          const allowed = field.options.map((o) => o.value);
          if (!allowed.includes(value as string | number)) {
            issues.push({
              code: "enum_violation",
              path: `${path}.props.${propName}`,
              message: `"${propName}" value ${JSON.stringify(value)} not in allowed set ${JSON.stringify(allowed)}`,
            });
          }
        }
      }
    }
  }

  payload.content.forEach((item, i) => checkItem(item, `content[${i}]`));

  if (payload.zones && typeof payload.zones === "object" && !Array.isArray(payload.zones)) {
    for (const [key, zoneItems] of Object.entries(payload.zones)) {
      if (!ZONE_KEY_RE.test(key)) {
        issues.push({
          code: "malformed_zone_key",
          path: `zones["${key}"]`,
          message: `zone key "${key}" does not match "<parentId>:<slotName>" shape`,
        });
      }
      if (!Array.isArray(zoneItems)) {
        issues.push({
          code: "item_not_object",
          path: `zones["${key}"]`,
          message: `zones["${key}"] is not an array`,
        });
        continue;
      }
      zoneItems.forEach((item, i) => checkItem(item, `zones["${key}"][${i}]`));
    }
  }

  if (issues.length > 0) {
    return { ok: false, payload: payload as PuckPayload, issues };
  }

  return { ok: true, payload: payload as PuckPayload, issues: [] };
}

// Non-destructive sanitizer: returns a cleaned payload that drops
// undocumented props + items with unknown types. Used for best-effort
// recovery when a generator produces partially-valid output. Only
// called when explicitly requested; the default path is hard-fail
// and surface the issues to the caller.
export function sanitizePuckPayload(payload: PuckPayload): {
  cleaned: PuckPayload;
  dropped: PuckValidationIssue[];
} {
  const dropped: PuckValidationIssue[] = [];

  const filterItem = (item: { type: string; props: JsonObject }, path: string) => {
    const component = getComponentFields(item.type);
    if (!component) {
      dropped.push({
        code: "unknown_component",
        path,
        message: `dropped unknown component "${item.type}"`,
      });
      return null;
    }
    const cleanedProps: JsonObject = {};
    for (const [propName, value] of Object.entries(item.props)) {
      if (propName === "id") {
        cleanedProps.id = value;
        continue;
      }
      if (component.fields[propName]) {
        cleanedProps[propName] = value;
      } else {
        dropped.push({
          code: "undocumented_prop",
          path: `${path}.props.${propName}`,
          message: `dropped undocumented prop "${propName}"`,
        });
      }
    }
    return { type: item.type, props: cleanedProps };
  };

  const cleaned: PuckPayload = {
    content: [],
    root: payload.root ?? { props: {} },
    zones: {},
  };

  payload.content.forEach((item, i) => {
    const result = filterItem(item, `content[${i}]`);
    if (result) cleaned.content.push(result);
  });

  if (payload.zones) {
    for (const [key, items] of Object.entries(payload.zones)) {
      if (!ZONE_KEY_RE.test(key)) {
        dropped.push({
          code: "malformed_zone_key",
          path: `zones["${key}"]`,
          message: `dropped zone with malformed key`,
        });
        continue;
      }
      const cleanedZone: Array<{ type: string; props: JsonObject }> = [];
      items.forEach((item, i) => {
        const result = filterItem(item, `zones["${key}"][${i}]`);
        if (result) cleanedZone.push(result);
      });
      cleaned.zones![key] = cleanedZone;
    }
  }

  return { cleaned, dropped };
}

export function puckIssuesToString(issues: PuckValidationIssue[]): string {
  return issues.map((issue) => `[${issue.code}] ${issue.path}: ${issue.message}`).join("\n");
}
