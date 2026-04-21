import type { VerticalTemplate } from "./index";

export const serviceBusinessBookingTemplate: VerticalTemplate = {
  id: "service-business-booking",
  name: "Service business — Booking",
  description: "Local-service hero + services grid + testimonials + direct booking. Works for dentists, plumbers, salons, vets, PT clinics.",
  industry: ["service", "realestate"],
  payload: {
    content: [
      {
        type: "Hero",
        props: {
          id: "Hero-service-root",
          headline: "Welcome to [Business Name]",
          subheadline: "Trusted local care, same-day appointments, honest pricing.",
          ctaText: "Book an Appointment",
          ctaLink: "#book",
          alignment: "left",
          showCta: "yes",
        },
      },
      {
        type: "Section",
        props: {
          id: "Section-services",
          heading: "Services",
          description: "Most common appointments — we do more. Call for anything not listed.",
          backgroundColor: "transparent",
          paddingY: "py-24",
        },
      },
      {
        type: "Section",
        props: {
          id: "Section-testimonials",
          heading: "What clients say",
          description: "",
          backgroundColor: "subtle",
          paddingY: "py-24",
        },
      },
      {
        type: "Section",
        props: {
          id: "Section-contact",
          heading: "Visit us",
          description: "Or call / email — whichever works.",
          backgroundColor: "transparent",
          paddingY: "py-16",
        },
      },
      {
        type: "Section",
        props: {
          id: "Section-book",
          heading: "Book online",
          description: "Pick a time — we'll confirm within the hour.",
          backgroundColor: "transparent",
          paddingY: "py-24",
        },
      },
    ],
    root: { props: {} },
    zones: {
      "Section-services:content": [
        {
          type: "ServiceCard",
          props: {
            id: "ServiceCard-1",
            name: "New-client consultation",
            description: "45-minute intake covering your history, goals, and next steps.",
            price: "$0",
            duration: "45 min",
            ctaText: "Book",
          },
        },
        {
          type: "ServiceCard",
          props: {
            id: "ServiceCard-2",
            name: "Standard appointment",
            description: "Our core service — what most clients book.",
            price: "$120",
            duration: "60 min",
            ctaText: "Book",
          },
        },
        {
          type: "ServiceCard",
          props: {
            id: "ServiceCard-3",
            name: "Extended session",
            description: "For complex cases or follow-up work.",
            price: "$220",
            duration: "90 min",
            ctaText: "Book",
          },
        },
      ],
      "Section-testimonials:content": [
        {
          type: "TestimonialCard",
          props: {
            id: "TestimonialCard-t1",
            quote: "Clean, professional, on time. They do what they say they'll do.",
            authorName: "Marco R.",
            authorRole: "Client since 2021",
            rating: 5,
          },
        },
        {
          type: "TestimonialCard",
          props: {
            id: "TestimonialCard-t2",
            quote: "Been going to them for years. Best in town.",
            authorName: "Amira O.",
            authorRole: "Client since 2019",
            rating: 5,
          },
        },
        {
          type: "TestimonialCard",
          props: {
            id: "TestimonialCard-t3",
            quote: "Honest pricing, no upselling. Refreshing.",
            authorName: "David T.",
            authorRole: "New client, 2024",
            rating: 5,
          },
        },
      ],
      "Section-contact:content": [
        {
          type: "ContactInfo",
          props: {
            id: "ContactInfo-main",
            email: "hello@example.com",
            phone: "(555) 123-4567",
            address: "123 Main St, Your City",
          },
        },
      ],
      "Section-book:content": [
        {
          type: "BookingWidget",
          props: {
            id: "BookingWidget-service",
            heading: "Ready when you are",
            bookingUrl: "/book/standard",
            buttonText: "See available times",
          },
        },
      ],
    },
  },
};
