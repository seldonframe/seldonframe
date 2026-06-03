import type { CTAs, Soul } from "../_contract/types";

// Realistic dermatology fixture. The About portrait, the 4th treatment photo,
// and the CTA texture are intentionally omitted to exercise the themed
// placeholder fallback. Note: derm `offerings` carry duration but no price.
export const lumenDermatology: Soul = {
  business_name: "Lumen Dermatology & Aesthetics",
  tagline: "Expert skin care, a patient-centered approach",
  soul_description:
    "Board-certified dermatologists delivering medical, surgical, and cosmetic skin care. From preventative screenings to advanced rejuvenation, we provide personalized care you can trust.",
  phone: "(512) 555-0610",
  email: "concierge@lumenderm.com",
  address: "3600 N Capital of Texas Hwy, Building B, Austin, TX 78746",
  service_area: ["Austin", "West Lake Hills", "Lakeway"],
  hours: [
    { day: "Mon–Thu", open: "8am", close: "5pm" },
    { day: "Fri", open: "8am", close: "3pm" },
    { day: "Sat", open: "By appointment", close: "" },
  ],
  review_rating: 5.0,
  review_count: 198,
  trust_signals: ["Most PPO insurance accepted", "Financing available", "No referral needed"],
  certifications: ["Board-Certified Dermatology", "Mohs Surgery Fellowship"],
  offerings: [
    { name: "Medical Dermatology", description: "Diagnosis and treatment for the full range of skin conditions.", duration_minutes: 30 },
    { name: "Cosmetic Consultation", description: "A personalized rejuvenation plan, tailored to your goals.", duration_minutes: 45 },
    { name: "Skin Cancer Screening", description: "A comprehensive, full-body dermatologic exam.", duration_minutes: 30 },
    { name: "Laser & Microneedling", description: "Advanced resurfacing for tone, texture, and clarity.", duration_minutes: 60 },
  ],
  faqs: [
    { q: "Do I need a referral?", a: "No referral is required. You can book directly and we'll coordinate with your physician as needed." },
    { q: "Do you accept insurance?", a: "We accept most PPO plans for medical visits. Cosmetic services are self-pay, with financing available." },
    { q: "How soon can I be seen?", a: "We hold same-week appointments for urgent skin concerns and screenings." },
    { q: "What should I bring to my first visit?", a: "Your insurance card, a list of medications, and notes on any concerns you'd like us to review." },
  ],
  testimonials: [
    { name: "Alicia M.", text: "The most thorough skin exam I've ever had. I finally feel in genuinely good hands." },
    { name: "Thomas B.", text: "Professional, warm, and the results speak for themselves. A truly elevated experience." },
  ],
  photos: [
    { url: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1500&q=72", role: "hero", alt: "Serene treatment room" },
    { url: "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?auto=format&fit=crop&w=1000&q=72", role: "service", alt: "Medical dermatology" },
    { url: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1000&q=72", role: "service", alt: "Cosmetic consultation" },
    { url: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=1000&q=72", role: "service", alt: "Skin cancer screening" },
    // service[3], role:"about" & role:"gallery" omitted → themed placeholder fallback
  ],
};

export const exampleCTAs: CTAs = {
  bookUrl: "/book",
  callHref: "tel:+15125550610",
  intakeUrl: "/intake",
};
