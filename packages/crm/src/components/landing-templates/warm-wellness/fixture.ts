import type { CTAs, Soul } from "../_contract/types";

// Realistic women's-wellness / prenatal personal-brand fixture. The About
// portrait and the last two class photos are intentionally omitted to exercise
// the themed placeholder fallback. `trust_signals` includes "First class free",
// which surfaces as the nav promo pill + hero note (graceful — hides if absent).
export const georgiaHart: Soul = {
  business_name: "Georgia Hart",
  tagline: "Fitness for every stage of motherhood",
  soul_description:
    "Pre & postnatal pilates and strength coaching for women — gentle, expert movement to help you feel strong, supported, and like yourself again. Small groups and 1:1 in the heart of Austin.",
  phone: "(512) 555-0294",
  email: "hello@movewithgeorgia.com",
  address: "1100 S Lamar Blvd, Studio 4, Austin, TX 78704",
  service_area: ["Austin", "South Congress", "Zilker", "Travis Heights"],
  hours: [
    { day: "Mon–Fri", open: "6am", close: "7pm" },
    { day: "Sat", open: "8am", close: "1pm" },
    { day: "Sun", open: "Closed", close: "" },
  ],
  review_rating: 4.9,
  review_count: 164,
  trust_signals: ["First class free", "Small-group & 1:1", "Mums welcome with babies"],
  certifications: ["Pre & Postnatal Certified", "STOTT Pilates Certified"],
  offerings: [
    { name: "Prenatal Pilates", description: "Safe, supportive movement for every trimester.", price: 28, currency: "USD", duration_minutes: 50 },
    { name: "Postnatal Recovery", description: "Rebuild core and pelvic-floor strength, gently.", price: 32, currency: "USD", duration_minutes: 50 },
    { name: "Strength for Mums", description: "Build real, functional strength for everyday life.", price: 30, currency: "USD", duration_minutes: 45 },
    { name: "1:1 Personal Coaching", description: "A program built entirely around you and your goals.", price: 75, currency: "USD", duration_minutes: 60 },
    { name: "Mum & Baby Class", description: "Move together — no childcare needed.", price: 24, currency: "USD", duration_minutes: 45 },
  ],
  faqs: [
    { q: "Is it safe during pregnancy?", a: "Absolutely. Every class is led by a certified pre/postnatal coach and tailored to your trimester and comfort." },
    { q: "When can I start postnatally?", a: "Most mums begin around 6 weeks (12 after a C-section) with clearance. We start gently and build from there." },
    { q: "Do I need any experience?", a: "None at all. Classes are beginner-friendly and every movement has options for your level." },
    { q: "Can I bring my baby?", a: "Yes — our Mum & Baby classes are designed for exactly that. Come as you are." },
  ],
  testimonials: [
    { name: "Hannah W.", text: "Georgia helped me feel strong and confident again after my second baby. I genuinely look forward to every class." },
    { name: "Priya S.", text: "The prenatal classes were the best thing I did for my pregnancy. So knowledgeable and so kind." },
    { name: "Mia L.", text: "Finally a space that gets it. Bringing my little one along made it actually possible to show up." },
  ],
  photos: [
    { url: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1100&q=72", role: "hero", alt: "Pilates class" },
    { url: "https://images.unsplash.com/photo-1599447421416-3414500d18a5?auto=format&fit=crop&w=1000&q=72", role: "service", alt: "Prenatal pilates" },
    { url: "https://images.unsplash.com/photo-1559599101-f09722fb4948?auto=format&fit=crop&w=1000&q=72", role: "service", alt: "Postnatal recovery" },
    { url: "https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=1000&q=72", role: "service", alt: "Strength class" },
    // service[3], service[4], role:"about" omitted → themed placeholder fallback
  ],
};

export const exampleCTAs: CTAs = {
  bookUrl: "/book",
  callHref: "tel:+15125550294",
  intakeUrl: "/intake",
};
