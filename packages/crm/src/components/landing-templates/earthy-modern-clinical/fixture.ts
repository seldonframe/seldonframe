import type { CTAs, Soul } from "../_contract/types";

// Realistic health fixture for instant preview. Matches the data the
// SeldonFrame pipeline injects at build time â€” design against the shape, never
// hardcode these values into the template. The About portrait and CTA texture
// photos are intentionally omitted to exercise the themed-placeholder fallback.
export const austinFamilyChiropractic: Soul = {
  business_name: "Austin Family Chiropractic",
  tagline: "Gentle, expert chiropractic care for the whole family",
  soul_description:
    "A family-focused clinic serving every age â€” from infants to seniors. Dr. Sarah Mitchell and her team specialize in spinal adjustments, corrective care, and whole-body wellness to relieve pain and restore mobility.",
  phone: "(512) 555-0182",
  email: "hello@austinfamilychiro.com",
  address: "3204 Bee Caves Rd, Suite 102, Austin, TX 78746",
  service_area: ["Austin", "West Lake Hills", "Bee Cave", "Rollingwood"],
  hours: [
    { day: "Monâ€“Fri", open: "8am", close: "6pm" },
    { day: "Sat", open: "9am", close: "2pm" },
    { day: "Sun", open: "Closed", close: "" },
  ],
  review_rating: 4.9,
  review_count: 287,
  trust_signals: ["Licensed Doctors of Chiropractic", "Most insurance accepted", "Same-week appointments"],
  certifications: ["Doctor of Chiropractic (DC)", "Webster Technique Certified"],
  same_day: true,
  offerings: [
    { name: "Spinal Adjustment", description: "Restore motion and relieve nerve pressure", price: 65, currency: "USD", duration_minutes: 30 },
    { name: "Corrective Care Program", description: "A structured plan to fix the root cause", price: 120, currency: "USD", duration_minutes: 45 },
    { name: "Prenatal Chiropractic", description: "Gentle, Webster-certified care through pregnancy", price: 85, currency: "USD", duration_minutes: 40 },
    { name: "Pediatric Chiropractic", description: "Low-force adjustments for kids and infants", price: 55, currency: "USD", duration_minutes: 25 },
  ],
  faqs: [
    { q: "Do you accept insurance?", a: "We accept most major plans including BCBS, Aetna, Cigna, and United. We verify your benefits before your first visit." },
    { q: "Is chiropractic safe for children?", a: "Yes â€” pediatric adjustments use very gentle, low-force techniques appropriate for each age." },
    { q: "What happens on my first visit?", a: "A full exam and consultation, then a personalized care plan with a clear timeline and cost estimate." },
    { q: "Do I need a referral?", a: "No referral needed â€” you can book directly online or by phone, and we coordinate with your physician as required." },
  ],
  testimonials: [
    { name: "Jennifer K.", text: "Dr. Mitchell's prenatal adjustments made an enormous difference in my comfort. I brought my newborn in too!" },
    { name: "Marcus T.", text: "After 8 weeks my chronic back pain is virtually gone. They customize every single treatment." },
    { name: "The Rivera Family", text: "Our whole family comes here â€” kids included. So welcoming, every single visit." },
  ],
  photos: [
    { url: "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1300&q=72", role: "hero", alt: "Gentle hands-on chiropractic care" },
    { url: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=900&q=72", role: "service", alt: "Spinal adjustment" },
    { url: "https://images.unsplash.com/photo-1556760544-74068565f05c?auto=format&fit=crop&w=900&q=72", role: "service", alt: "Corrective care session" },
    { url: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=72", role: "service", alt: "Prenatal movement care" },
    // service[3] (pediatric), role:"about" & role:"gallery" omitted â†’ themed placeholder fallback
  ],
};

export const exampleCTAs: CTAs = {
  bookUrl: "/book",
  callHref: "tel:+15125550182",
  intakeUrl: "/intake",
};
