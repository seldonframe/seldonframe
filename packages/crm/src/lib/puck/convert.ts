function uid() {
  return crypto.randomUUID();
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function mapFieldType(type: string): string {
  switch (type) {
    case "text":
      return "TextInput";
    case "email":
      return "EmailInput";
    case "textarea":
      return "TextAreaInput";
    case "select":
      return "SelectInput";
    case "score_select":
      return "ScoreSelect";
    case "checkbox":
      return "CheckboxInput";
    default:
      return "TextInput";
  }
}

type GenericParams = Record<string, unknown>;

type PuckData = {
  content: Array<{ type: string; props: Record<string, unknown> }>;
  root: { props: Record<string, unknown> };
  zones: Record<string, Array<{ type: string; props: Record<string, unknown> }>>;
};

export function convertToPuckData(params: GenericParams): PuckData {
  const content: PuckData["content"] = [];
  const sections = Array.isArray((params.content as { sections?: unknown[] } | undefined)?.sections)
    ? (((params.content as { sections?: unknown[] }).sections ?? []) as Array<Record<string, unknown>>)
    : [];

  for (const section of sections) {
    const type = String(section.type ?? "").toLowerCase();

    switch (type) {
      case "hero": {
        content.push({
          type: "Hero",
          props: {
            id: uid(),
            headline: String(section.headline ?? "Welcome"),
            subheadline: String(section.subheadline ?? ""),
            ctaText: String(section.ctaText ?? "Get Started"),
            ctaLink: String(section.ctaLink ?? "#"),
            alignment: "center",
            showCta: section.ctaText ? "yes" : "no",
          },
        });
        break;
      }
      case "services": {
        const items = Array.isArray(section.items) ? (section.items as Array<Record<string, unknown>>) : [];
        for (const item of items) {
          content.push({
            type: "ServiceCard",
            props: {
              id: uid(),
              name: String(item.name ?? "Service"),
              description: String(item.description ?? ""),
              price: String(item.price ?? ""),
              duration: String(item.duration ?? ""),
              ctaText: "Learn More",
            },
          });
        }
        break;
      }
      case "testimonials": {
        const items = Array.isArray(section.items) ? (section.items as Array<Record<string, unknown>>) : [];
        for (const item of items) {
          content.push({
            type: "TestimonialCard",
            props: {
              id: uid(),
              quote: String(item.quote ?? ""),
              authorName: String(item.author ?? ""),
              authorRole: String(item.role ?? ""),
              rating: 5,
            },
          });
        }
        break;
      }
      case "faq": {
        const items = Array.isArray(section.items) ? section.items : [];
        content.push({
          type: "FAQ",
          props: {
            id: uid(),
            items,
          },
        });
        break;
      }
      case "cta": {
        content.push({
          type: "Hero",
          props: {
            id: uid(),
            headline: String(section.headline ?? "Ready to Start?"),
            subheadline: "",
            ctaText: String(section.buttonText ?? "Book Now"),
            ctaLink: String(section.buttonLink ?? "#"),
            alignment: "center",
            showCta: "yes",
          },
        });
        break;
      }
      default: {
        content.push({
          type: "Heading",
          props: {
            id: uid(),
            text: String(section.headline ?? section.type ?? "Section"),
            level: "h2",
            alignment: "text-center",
          },
        });
      }
    }
  }

  if (content.length === 0) {
    content.push({
      type: "Hero",
      props: {
        id: uid(),
        headline: String(params.title ?? params.name ?? "Landing Page"),
        subheadline: String(params.description ?? ""),
        ctaText: "Get Started",
        ctaLink: "#",
        alignment: "center",
        showCta: "yes",
      },
    });
  }

  return { content, root: { props: {} }, zones: {} };
}

export function convertFormToPuckData(params: GenericParams): PuckData {
  const formChildren: PuckData["content"] = [];
  const fields = Array.isArray(params.fields) ? (params.fields as Array<Record<string, unknown>>) : [];

  for (const field of fields) {
    const fieldType = mapFieldType(String(field.type ?? "text"));
    const label = String(field.label ?? "Field");
    const placeholder = String(field.placeholder ?? "");

    const options = Array.isArray(field.options)
      ? (field.options as Array<string | Record<string, unknown>>).map((option) => {
          if (typeof option === "string") {
            return { label: option, value: slugify(option) };
          }

          const labelValue = String(option.label ?? option.value ?? "Option");
          const value = String(option.value ?? slugify(labelValue));
          const points = typeof option.points === "number" ? option.points : undefined;
          return points === undefined ? { label: labelValue, value } : { label: labelValue, value, points };
        })
      : [];

    formChildren.push({
      type: fieldType,
      props: {
        id: uid(),
        label,
        fieldName: String(field.fieldName ?? slugify(label)),
        placeholder,
        required: field.required ? "yes" : "no",
        ...(options.length > 0 ? { options } : {}),
        ...(typeof field.rows === "number" ? { rows: field.rows } : {}),
      },
    });
  }

  const formContainerId = uid();

  const content: PuckData["content"] = [
    {
      type: "Hero",
      props: {
        id: uid(),
        headline: String(params.name ?? "Form"),
        subheadline: String(params.description ?? ""),
        alignment: "center",
        showCta: "no",
      },
    },
    {
      type: "FormContainer",
      props: {
        id: formContainerId,
        formName: String(params.name ?? "Form"),
        submitButtonText: "Submit",
        successMessage: String(params.successMessage ?? "Thank you! We'll be in touch."),
      },
    },
  ];

  const zones: PuckData["zones"] = {
    [`${formContainerId}:content`]: formChildren,
  };

  return { content, root: { props: {} }, zones };
}
