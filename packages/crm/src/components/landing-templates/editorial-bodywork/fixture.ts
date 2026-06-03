import type { CTAs, Soul } from "../_contract/types";

// Realistic massage / bodywork fixture. The 4th treatment thumbnail and the
// About portrait are intentionally omitted to exercise the themed placeholder
// fallback. The hero is split-screen (two `role: "hero"` photos).
export const palmerBodywork: Soul = {
  business_name: "Palmer Bodywork",
  tagline: "Find your quiet",
  soul_description:
    "Therapeutic bodywork tailored to you. Every session is built around what your body needs — relief, recovery, and longevity, in unhurried hands.",
  phone: "(512) 555-0455",
  email: "book@palmerbodywork.com",
  address: "2407 Manor Rd, Austin, TX 78722",
  service_area: ["Austin", "East Austin", "Mueller", "Cherrywood"],
  hours: [
    { day: "Mon–Fri", open: "10am", close: "8pm" },
    { day: "Sat", open: "10am", close: "5pm" },
    { day: "Sun", open: "Closed", close: "" },
  ],
  review_rating: 4.9,
  review_count: 412,
  trust_signals: ["Licensed Massage Therapists", "Gift certificates available", "FSA/HSA receipts provided"],
  certifications: ["Licensed Massage Therapist", "Certified in Myofascial Release"],
  offerings: [
    { name: "Swedish Relaxation", description: "Flowing strokes to ease tension and quiet the mind.", price: 95, currency: "USD", duration_minutes: 60 },
    { name: "Deep Tissue", description: "Targeted pressure to release chronic, stubborn knots.", price: 135, currency: "USD", duration_minutes: 90 },
    { name: "Hot Stone Therapy", description: "Heated basalt stones for deep, grounding warmth.", price: 145, currency: "USD", duration_minutes: 90 },
    { name: "Prenatal Massage", description: "Safe, supportive care for every trimester.", price: 110, currency: "USD", duration_minutes: 60 },
  ],
  faqs: [
    { q: "How do I choose the right massage?", a: "Book an initial session and your therapist will assess and recommend the best approach — most clients get a tailored blend." },
    { q: "Do you offer gift certificates?", a: "Yes — available online or in-studio, a perfect gift for any occasion." },
    { q: "Can I use my FSA/HSA?", a: "Often, yes. We provide detailed receipts you can submit for reimbursement." },
    { q: "What should I expect on my first visit?", a: "A short intake about your goals and any tension areas, then an unhurried, fully tailored session." },
  ],
  testimonials: [
    { name: "Rebecca O.", text: "The best massage I've had in Austin — they knew exactly which knots needed attention." },
    { name: "Chris A.", text: "Monthly sports massage has become a non-negotiable part of my marathon training." },
  ],
  photos: [
    { url: "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1300&q=72", role: "hero", alt: "Therapeutic bodywork" },
    { url: "https://images.unsplash.com/photo-1556760544-74068565f05c?auto=format&fit=crop&w=1100&q=72", role: "hero", alt: "Aromatherapy detail" },
    { url: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=400&q=72", role: "service", alt: "Swedish relaxation" },
    { url: "https://images.unsplash.com/photo-1600334129128-685c5582fd35?auto=format&fit=crop&w=400&q=72", role: "service", alt: "Deep tissue" },
    { url: "https://images.unsplash.com/photo-1556760544-74068565f05c?auto=format&fit=crop&w=400&q=72", role: "service", alt: "Hot stone therapy" },
    { url: "https://images.unsplash.com/photo-1556760544-74068565f05c?auto=format&fit=crop&w=1400&q=72", role: "gallery", alt: "Studio detail" },
    // service[3] (Prenatal) & role:"about" omitted → themed placeholder fallback
  ],
};

export const exampleCTAs: CTAs = {
  bookUrl: "/book",
  callHref: "tel:+15125550455",
  intakeUrl: "/intake",
};
