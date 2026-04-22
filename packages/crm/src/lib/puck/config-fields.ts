// Server-safe mirror of the Puck component fields declared in
// `config.impl.tsx`. Pure data — no React imports, no hooks, no UI —
// so server-runtime code paths (validator.ts, generate-with-claude.ts,
// and transitively the API routes that import them) can read the
// component registry without pulling React hooks into the server
// bundle.
//
// Fix landed 2026-04-21 after Vercel deployments started failing on
// commits since `93a6ca9`. The Turbopack error was:
//
//   "You're importing a module that depends on `useEffect` / `useState`
//    into a React Server Component module. This API is only available
//    in Client Components."
//
// The import trace ran: self-service/route.ts → seldon-actions.ts →
// landing/actions.ts → landing/api.ts → puck/validator.ts →
// puck/config.impl.tsx (which imports useState/useEffect at the top).
// This file breaks that chain by giving server code a fields registry
// that doesn't transitively touch React.
//
// *** KEEP THIS FILE IN SYNC WITH packages/crm/src/lib/puck/config.impl.tsx. ***
// When adding/removing/renaming a field on a component in config.impl.tsx,
// mirror the change here. A follow-up slice will make this the single
// source of truth by having config.impl.tsx import from here; for the
// fix landing here, fields are carefully duplicated and the risk is
// bounded by the Puck validator (validator.ts) running on every save.

// Mirror of the `icons` map in config.impl.tsx. Kept here so
// IconText's `icon` field options match the registry without importing
// lucide-react into the server bundle.
const ICON_NAMES = [
  "check",
  "star",
  "arrow",
  "heart",
  "shield",
  "zap",
  "clock",
  "mapPin",
  "mail",
  "phone",
  "chevronRight",
  "play",
  "users",
  "calendar",
  "creditCard",
  "lock",
] as const;

type PuckField = {
  type: string;
  options?: Array<{ label?: string; value: string | number }>;
  arrayFields?: Record<string, PuckField>;
};

export type PuckComponentFields = {
  fields: Record<string, PuckField>;
};

// The 32-component registry. Order mirrors the `categories` declaration
// in config.impl.tsx (layout → content → forms → business → interactive)
// so diffs stay readable when components are added.
export const componentFieldRegistry: Record<string, PuckComponentFields> = {
  // layout
  Hero: {
    fields: {
      headline: { type: "text" },
      subheadline: { type: "textarea" },
      ctaText: { type: "text" },
      ctaLink: { type: "text" },
      alignment: { type: "select", options: [{ label: "Left", value: "left" }, { label: "Center", value: "center" }] },
      showCta: { type: "radio", options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }] },
    },
  },
  Section: {
    fields: {
      heading: { type: "text" },
      description: { type: "textarea" },
      backgroundColor: {
        type: "select",
        options: [
          { label: "Default", value: "transparent" },
          { label: "Subtle", value: "subtle" },
          { label: "Primary", value: "primary" },
        ],
      },
      paddingY: {
        type: "select",
        options: [
          { label: "Small", value: "py-8" },
          { label: "Medium", value: "py-16" },
          { label: "Large", value: "py-24" },
          { label: "Extra Large", value: "py-32" },
        ],
      },
      content: { type: "slot" },
    },
  },
  TwoColumn: {
    fields: {
      ratio: {
        type: "select",
        options: [
          { label: "50-50", value: "md:grid-cols-2" },
          { label: "60-40", value: "md:grid-cols-[1.5fr_1fr]" },
          { label: "40-60", value: "md:grid-cols-[1fr_1.5fr]" },
          { label: "70-30", value: "md:grid-cols-[2fr_1fr]" },
        ],
      },
      gap: {
        type: "select",
        options: [
          { label: "Small", value: "gap-4" },
          { label: "Medium", value: "gap-8" },
          { label: "Large", value: "gap-16" },
        ],
      },
      reverseOnMobile: { type: "radio", options: [{ label: "Yes", value: "flex-col-reverse" }, { label: "No", value: "" }] },
      left: { type: "slot" },
      right: { type: "slot" },
    },
  },
  Grid: {
    fields: {
      columns: {
        type: "select",
        options: [
          { label: "2", value: "md:grid-cols-2" },
          { label: "3", value: "md:grid-cols-3" },
          { label: "4", value: "md:grid-cols-4" },
        ],
      },
      gap: {
        type: "select",
        options: [
          { label: "Small", value: "gap-4" },
          { label: "Medium", value: "gap-8" },
          { label: "Large", value: "gap-12" },
        ],
      },
      content: { type: "slot" },
    },
  },
  Divider: {
    fields: {
      style: {
        type: "select",
        options: [
          { label: "Solid", value: "border-solid" },
          { label: "Dashed", value: "border-dashed" },
          { label: "Gradient", value: "gradient" },
        ],
      },
      spacing: {
        type: "select",
        options: [
          { label: "Small", value: "my-4" },
          { label: "Medium", value: "my-8" },
          { label: "Large", value: "my-16" },
        ],
      },
    },
  },

  // content
  Heading: {
    fields: {
      text: { type: "text" },
      level: { type: "select", options: [{ label: "h1", value: "h1" }, { label: "h2", value: "h2" }, { label: "h3", value: "h3" }, { label: "h4", value: "h4" }] },
      alignment: {
        type: "select",
        options: [
          { label: "Left", value: "text-left" },
          { label: "Center", value: "text-center" },
          { label: "Right", value: "text-right" },
        ],
      },
    },
  },
  RichText: {
    fields: { content: { type: "textarea" } },
  },
  Image: {
    fields: {
      src: { type: "text" },
      alt: { type: "text" },
      caption: { type: "text" },
      width: { type: "select", options: [{ label: "Small", value: "max-w-sm" }, { label: "Medium", value: "max-w-2xl" }, { label: "Full", value: "w-full" }] },
      rounded: { type: "radio", options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }] },
    },
  },
  Video: {
    fields: {
      url: { type: "text" },
      title: { type: "text" },
      aspectRatio: { type: "select", options: [{ label: "16:9", value: "aspect-video" }, { label: "1:1", value: "aspect-square" }] },
    },
  },
  Spacer: {
    fields: {
      height: {
        type: "select",
        options: [
          { label: "XS", value: "h-4" },
          { label: "SM", value: "h-8" },
          { label: "MD", value: "h-12" },
          { label: "LG", value: "h-16" },
          { label: "XL", value: "h-24" },
        ],
      },
    },
  },
  IconText: {
    fields: {
      icon: { type: "select", options: ICON_NAMES.map((k) => ({ label: k, value: k })) },
      title: { type: "text" },
      description: { type: "textarea" },
      layout: { type: "select", options: [{ label: "Horizontal", value: "flex-row" }, { label: "Vertical", value: "flex-col" }] },
    },
  },

  // forms
  FormContainer: {
    fields: {
      formName: { type: "text" },
      submitButtonText: { type: "text" },
      successMessage: { type: "text" },
      enableScoring: {
        type: "select",
        options: [
          { label: "No scoring", value: "none" },
          { label: "Score and redirect by threshold", value: "score" },
        ],
      },
      scoreThreshold: { type: "number" },
      qualifiedRedirectUrl: { type: "text" },
      unqualifiedRedirectUrl: { type: "text" },
      content: { type: "slot" },
    },
  },
  TextInput: {
    fields: {
      label: { type: "text" },
      placeholder: { type: "text" },
      fieldName: { type: "text" },
      required: { type: "radio", options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }] },
    },
  },
  EmailInput: {
    fields: { label: { type: "text" }, fieldName: { type: "text" } },
  },
  TextAreaInput: {
    fields: { label: { type: "text" }, fieldName: { type: "text" }, rows: { type: "number" } },
  },
  SelectInput: {
    fields: {
      label: { type: "text" },
      fieldName: { type: "text" },
      options: { type: "array", arrayFields: { label: { type: "text" }, value: { type: "text" } } },
    },
  },
  ScoreSelect: {
    fields: {
      label: { type: "text" },
      fieldName: { type: "text" },
      required: {
        type: "radio",
        options: [
          { label: "Yes", value: "yes" },
          { label: "No", value: "no" },
        ],
      },
      options: {
        type: "array",
        arrayFields: { label: { type: "text" }, value: { type: "text" }, points: { type: "number" } },
      },
    },
  },
  CheckboxInput: {
    fields: { label: { type: "text" }, description: { type: "text" }, fieldName: { type: "text" } },
  },

  // business
  ServiceCard: {
    fields: {
      name: { type: "text" },
      description: { type: "textarea" },
      price: { type: "text" },
      duration: { type: "text" },
      ctaText: { type: "text" },
    },
  },
  PricingTable: {
    fields: {
      plans: {
        type: "array",
        arrayFields: {
          name: { type: "text" },
          price: { type: "text" },
          period: { type: "text" },
          highlighted: { type: "radio", options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }] },
          features: { type: "array", arrayFields: { text: { type: "text" } } },
          ctaText: { type: "text" },
        },
      },
    },
  },
  TestimonialCard: {
    fields: { quote: { type: "textarea" }, authorName: { type: "text" }, authorRole: { type: "text" }, rating: { type: "number" } },
  },
  FAQ: {
    fields: { items: { type: "array", arrayFields: { question: { type: "text" }, answer: { type: "textarea" } } } },
  },
  TeamMember: {
    fields: { name: { type: "text" }, role: { type: "text" }, photoUrl: { type: "text" } },
  },
  ContactInfo: {
    fields: { email: { type: "text" }, phone: { type: "text" }, address: { type: "textarea" } },
  },
  LogoBar: {
    fields: { heading: { type: "text" }, logos: { type: "array", arrayFields: { src: { type: "text" } } } },
  },
  CountdownTimer: {
    fields: { targetDate: { type: "text" }, heading: { type: "text" } },
  },

  // interactive
  BookingWidget: {
    fields: { heading: { type: "text" }, bookingUrl: { type: "text" }, buttonText: { type: "text" } },
  },
  PaymentButton: {
    fields: { amount: { type: "text" }, paymentUrl: { type: "text" } },
  },
  ProgressBar: {
    fields: { currentStep: { type: "number" }, totalSteps: { type: "number" } },
  },
  ConditionalBlock: {
    fields: {
      condition: {
        type: "select",
        options: [
          { label: "Always", value: "always" },
          { label: "Authenticated", value: "auth" },
          { label: "Paid Member", value: "paid" },
          { label: "Score", value: "score" },
        ],
      },
      threshold: { type: "number" },
      content: { type: "slot" },
      fallbackContent: { type: "slot" },
    },
  },
  GatedContent: {
    fields: { content: { type: "slot" }, loginHeading: { type: "text" } },
  },
  QuizResults: {
    fields: {
      qualifiedHeadline: { type: "text" },
      qualifiedMessage: { type: "textarea" },
      qualifiedCtaText: { type: "text" },
      qualifiedCtaLink: { type: "text" },
      unqualifiedHeadline: { type: "text" },
      unqualifiedMessage: { type: "textarea" },
      unqualifiedCtaText: { type: "text" },
      unqualifiedCtaLink: { type: "text" },
      threshold: { type: "number" },
    },
  },
};
