import type { VerticalTemplate } from "./index";

export const coachingDiscoveryCallTemplate: VerticalTemplate = {
  id: "coaching-discovery-call",
  name: "Coaching — Discovery call",
  description: "Personal-brand hero + outcomes-focused copy + single-CTA booking. For solo coaches / consultants.",
  industry: ["coaching", "consulting", "service"],
  payload: {
    content: [
      {
        type: "Hero",
        props: {
          id: "Hero-coach-root",
          headline: "Build the life you actually want, on purpose",
          subheadline: "I coach high-performers through career transitions, relationship work, and the scary in-between. Book a free 30-min discovery call.",
          ctaText: "Book My Discovery Call",
          ctaLink: "#book",
          alignment: "center",
          showCta: "yes",
        },
      },
      {
        type: "Section",
        props: {
          id: "Section-who",
          heading: "Who this is for",
          description: "Not for everyone. Very much for some.",
          backgroundColor: "transparent",
          paddingY: "py-24",
        },
      },
      {
        type: "Section",
        props: {
          id: "Section-how",
          heading: "How it works",
          description: "Simple, structured, confidential.",
          backgroundColor: "subtle",
          paddingY: "py-24",
        },
      },
      {
        type: "TestimonialCard",
        props: {
          id: "TestimonialCard-client-1",
          quote: "I came in stuck. Six months later I'd left the job, moved cities, and started the business I kept telling myself I'd build 'someday.'",
          authorName: "Priya M.",
          authorRole: "Former VP → independent consultant",
          rating: 5,
        },
      },
      {
        type: "Section",
        props: {
          id: "Section-book",
          heading: "Book your discovery call",
          description: "30 minutes. No pressure. Just a conversation.",
          backgroundColor: "transparent",
          paddingY: "py-24",
        },
      },
    ],
    root: { props: {} },
    zones: {
      "Section-who:content": [
        {
          type: "IconText",
          props: {
            id: "IconText-transition",
            icon: "arrow",
            title: "You're in transition",
            description: "Career change, relationship shift, post-sale, empty nest — anything with a clear before and after.",
            layout: "flex-row",
          },
        },
        {
          type: "IconText",
          props: {
            id: "IconText-stuck",
            icon: "clock",
            title: "You've been stuck for a while",
            description: "You know what you want — mostly. You're just not doing it. That's the usual starting point.",
            layout: "flex-row",
          },
        },
        {
          type: "IconText",
          props: {
            id: "IconText-accountability",
            icon: "shield",
            title: "You want accountability",
            description: "Not cheerleading, not therapy. Structured conversations with a concrete action at the end.",
            layout: "flex-row",
          },
        },
      ],
      "Section-how:content": [
        {
          type: "IconText",
          props: {
            id: "IconText-step-1",
            icon: "phone",
            title: "Discovery call",
            description: "30 minutes. We figure out if we're a fit.",
            layout: "flex-col",
          },
        },
        {
          type: "IconText",
          props: {
            id: "IconText-step-2",
            icon: "calendar",
            title: "Weekly 1:1",
            description: "60-minute sessions, Thursday mornings. Structured with a plan, flexible in the moment.",
            layout: "flex-col",
          },
        },
        {
          type: "IconText",
          props: {
            id: "IconText-step-3",
            icon: "mail",
            title: "Between-session support",
            description: "Quick voice memos, written check-ins when you're wobbling. Included.",
            layout: "flex-col",
          },
        },
      ],
      "Section-book:content": [
        {
          type: "BookingWidget",
          props: {
            id: "BookingWidget-discovery",
            heading: "Pick a time that works",
            bookingUrl: "/book/discovery-call",
            buttonText: "See available times",
          },
        },
      ],
    },
  },
};
