import type { VerticalTemplate } from "./index";

export const agencyLeadGenTemplate: VerticalTemplate = {
  id: "agency-lead-gen",
  name: "Agency — Lead gen",
  description: "Hero + social proof + scored qualification form. Filters cold traffic into discovery-call-ready leads.",
  industry: ["agency", "consulting"],
  payload: {
    content: [
      {
        type: "Hero",
        props: {
          id: "Hero-agency-root",
          headline: "Grow your business without hiring another marketer",
          subheadline: "We help 6–8-figure brands build repeatable acquisition systems. Free 30-min audit — no pitch, just a plan.",
          ctaText: "Get My Free Audit",
          ctaLink: "#audit-form",
          alignment: "center",
          showCta: "yes",
        },
      },
      {
        type: "Section",
        props: {
          id: "Section-trust",
          heading: "Trusted by",
          description: "A few of the teams we've helped scale.",
          backgroundColor: "transparent",
          paddingY: "py-16",
        },
      },
      {
        type: "Section",
        props: {
          id: "Section-what-we-do",
          heading: "How we work",
          description: "Three disciplines, one team, one monthly invoice.",
          backgroundColor: "subtle",
          paddingY: "py-24",
        },
      },
      {
        type: "TestimonialCard",
        props: {
          id: "TestimonialCard-main",
          quote: "They tripled our pipeline in two quarters. What I like most: they tell us when we're wrong.",
          authorName: "Sarah K.",
          authorRole: "VP Marketing, mid-market SaaS",
          rating: 5,
        },
      },
      {
        type: "Section",
        props: {
          id: "Section-audit",
          heading: "Book your audit",
          description: "Answer 4 questions. If you're a fit, we'll book a 30-min call.",
          backgroundColor: "transparent",
          paddingY: "py-24",
        },
      },
    ],
    root: { props: {} },
    zones: {
      "Section-trust:content": [
        {
          type: "LogoBar",
          props: {
            id: "LogoBar-trust",
            heading: "As seen on",
            logos: [
              { src: "https://via.placeholder.com/120x40?text=Logo1" },
              { src: "https://via.placeholder.com/120x40?text=Logo2" },
              { src: "https://via.placeholder.com/120x40?text=Logo3" },
              { src: "https://via.placeholder.com/120x40?text=Logo4" },
            ],
          },
        },
      ],
      "Section-what-we-do:content": [
        {
          type: "IconText",
          props: {
            id: "IconText-strategy",
            icon: "zap",
            title: "Strategy",
            description: "We audit what's working, kill what isn't, and write the plan.",
            layout: "flex-col",
          },
        },
        {
          type: "IconText",
          props: {
            id: "IconText-execution",
            icon: "check",
            title: "Execution",
            description: "Landing pages, ad creative, lifecycle emails — shipped weekly.",
            layout: "flex-col",
          },
        },
        {
          type: "IconText",
          props: {
            id: "IconText-reporting",
            icon: "star",
            title: "Reporting",
            description: "Monthly scorecards. Clear metrics. No fluff.",
            layout: "flex-col",
          },
        },
      ],
      "Section-audit:content": [
        {
          type: "FormContainer",
          props: {
            id: "FormContainer-audit",
            formName: "Agency audit",
            submitButtonText: "Request my audit",
            successMessage: "Thanks — check your inbox for the next step.",
            enableScoring: "score",
            scoreThreshold: 15,
            qualifiedRedirectUrl: "/book/discovery-call",
            unqualifiedRedirectUrl: "/thanks",
          },
        },
      ],
      "FormContainer-audit:content": [
        {
          type: "TextInput",
          props: { id: "TextInput-name", label: "Your name", placeholder: "Jane Doe", fieldName: "name", required: "yes" },
        },
        {
          type: "EmailInput",
          props: { id: "EmailInput-email", label: "Work email", fieldName: "email" },
        },
        {
          type: "TextInput",
          props: { id: "TextInput-company", label: "Company", placeholder: "Acme Inc.", fieldName: "company", required: "yes" },
        },
        {
          type: "ScoreSelect",
          props: {
            id: "ScoreSelect-revenue",
            label: "Annual revenue",
            fieldName: "revenue",
            required: "yes",
            options: [
              { label: "Under $500k", value: "under_500k", points: 0 },
              { label: "$500k–$2M", value: "500k_2m", points: 5 },
              { label: "$2M–$10M", value: "2m_10m", points: 10 },
              { label: "$10M+", value: "10m_plus", points: 15 },
            ],
          },
        },
      ],
    },
  },
};
