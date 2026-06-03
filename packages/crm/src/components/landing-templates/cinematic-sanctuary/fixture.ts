import type { CTAs, Soul } from "../_contract/types";

// Realistic holistic-sanctuary / osteopathy fixture. The About portrait, the
// 4th treatment photo, and two gallery slots are intentionally omitted to
// exercise the themed placeholder fallback.
export const stillwaterSanctuary: Soul = {
  business_name: "Stillwater",
  tagline: "A sanctuary for deep rest and renewal",
  soul_description:
    "An unhurried space for holistic care — osteopathy, craniosacral therapy, and restorative bodywork. We treat the whole person, gently and without rush, so your body can find its own way back to ease.",
  phone: "(512) 555-0733",
  email: "rest@stillwatersanctuary.com",
  address: "905 W 10th St, Austin, TX 78703",
  service_area: ["Austin", "Clarksville", "Tarrytown"],
  hours: [
    { day: "Tue–Fri", open: "9am", close: "7pm" },
    { day: "Sat", open: "9am", close: "4pm" },
    { day: "Sun–Mon", open: "Closed", close: "" },
  ],
  review_rating: 5.0,
  review_count: 142,
  trust_signals: ["By appointment", "Members & drop-in", "Gift cards available"],
  certifications: ["Registered Osteopath", "Certified Craniosacral Therapist"],
  offerings: [
    { name: "Osteopathy Session", description: "Whole-body assessment and gentle hands-on treatment.", price: 140, currency: "USD", duration_minutes: 60 },
    { name: "Craniosacral Therapy", description: "Subtle, deeply calming work for the nervous system.", price: 120, currency: "USD", duration_minutes: 60 },
    { name: "Deep Rest Massage", description: "Ninety unhurried minutes to fully let go.", price: 160, currency: "USD", duration_minutes: 90 },
    { name: "Infrared Sauna & Cold", description: "A restorative heat-and-cold contrast ritual.", price: 60, currency: "USD", duration_minutes: 45 },
  ],
  faqs: [
    { q: "What should I expect on a first visit?", a: "A calm, unhurried consultation, then a tailored treatment. Wear comfortable clothing and arrive a few minutes early to settle in." },
    { q: "Is osteopathy covered by insurance?", a: "Many extended-health plans reimburse osteopathy. We provide detailed receipts for you to submit." },
    { q: "How often should I come?", a: "It depends on your goals — many guests begin weekly and ease into a monthly maintenance rhythm." },
    { q: "Do you offer gift cards?", a: "Yes. Digital gift cards are available for any service or amount — a quiet, generous gesture." },
  ],
  testimonials: [
    { name: "Eleanor V.", text: "I left feeling lighter than I have in years. The space alone is a kind of medicine — I exhaled the moment I walked in." },
    { name: "Daniel R.", text: "The most attentive, unrushed care I've experienced. I've never felt so genuinely looked after." },
  ],
  photos: [
    { url: "https://images.unsplash.com/photo-1583416750470-965b2707b355?auto=format&fit=crop&w=1700&q=74", role: "hero", alt: "Sauna sanctuary" },
    { url: "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1100&q=72", role: "service", alt: "Osteopathy" },
    { url: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1100&q=72", role: "service", alt: "Craniosacral therapy" },
    { url: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1100&q=72", role: "service", alt: "Deep rest massage" },
    { url: "https://images.unsplash.com/photo-1556760544-74068565f05c?auto=format&fit=crop&w=1200&q=72", role: "gallery", alt: "Calm interior" },
    { url: "https://images.unsplash.com/photo-1532926381893-7542290edf1d?auto=format&fit=crop&w=1100&q=72", role: "gallery", alt: "Treatment room" },
    // service[3], gallery[2], gallery[3], role:"about" omitted → themed placeholder fallback
  ],
};

export const exampleCTAs: CTAs = {
  bookUrl: "/book",
  callHref: "tel:+15125550733",
  intakeUrl: "/intake",
};
