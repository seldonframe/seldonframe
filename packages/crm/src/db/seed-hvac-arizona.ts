// Desert Cool HVAC — SLICE 9 worked-example seed fixture.
//
// Mirrors seed-demo.ts pattern (hand-curated Soul + entity-labels +
// pipeline) but expands to ~1,800 customer records via deterministic
// procedural generation to demonstrate primitive composition at
// realistic SMB scale.
//
// Per L-28: any credential-like fixture data uses format-breaking
// patterns (test phone numbers, fake emails on .example.com).
//
// Per audit §2.3 + scenario doc (tasks/launch-content/desert-cool-
// hvac-scenario.md): Phoenix metro HVAC contractor, 14 techs,
// ~1,540 residential + ~260 light-commercial customers.
//
// Usage:
//   pnpm --filter @seldonframe/crm db:seed-hvac

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  contacts,
  organizations,
  pipelines,
  users,
} from "@/db/schema";

// ---------------------------------------------------------------------
// Soul configuration — Desert Cool HVAC
// ---------------------------------------------------------------------

const desertCoolSoul = {
  businessName: "Desert Cool HVAC",
  businessDescription: "Family-owned HVAC contractor serving the Phoenix metro area since 2008",
  industry: "hvac_contractor",
  offerType: "services",
  entityLabels: {
    contact: { singular: "Customer", plural: "Customers" },
    deal: { singular: "Job", plural: "Jobs" },
    activity: { singular: "Service Call", plural: "Service Calls" },
    pipeline: { singular: "Job Pipeline", plural: "Job Pipelines" },
    intakeForm: { singular: "Service Request", plural: "Service Requests" },
  },
  pipeline: {
    name: "Job Pipeline",
    stages: [
      { name: "Inquiry", color: "#fbbf24", probability: 15 },
      { name: "Quoted", color: "#fb923c", probability: 35 },
      { name: "Scheduled", color: "#60a5fa", probability: 70 },
      { name: "In Progress", color: "#a78bfa", probability: 85 },
      { name: "Completed", color: "#22c55e", probability: 100 },
    ],
  },
  suggestedFields: {
    contact: [
      { key: "tier", label: "Tier", type: "select", options: ["residential", "commercial", "vip-commercial"] },
      { key: "service_area_zip", label: "ZIP Code", type: "text" },
      { key: "last_service_at", label: "Last Service", type: "date" },
      { key: "equipment_count", label: "Equipment Count", type: "number" },
    ],
    deal: [
      { key: "job_type", label: "Job Type", type: "select", options: ["maintenance", "repair", "install", "warranty"] },
    ],
  },
  contactStatuses: [
    { value: "lead", label: "Lead", color: "#fbbf24" },
    { value: "active", label: "Active Customer", color: "#22c55e" },
    { value: "inactive", label: "Inactive", color: "#94a3b8" },
    { value: "vip", label: "VIP Commercial", color: "#dc2626" },
  ],
  voice: {
    style: "professional-warm",
    vocabulary: ["family-owned", "neighborly", "reliable", "tune-up", "tech on-site"],
    avoidWords: ["cheap", "hustle", "limited time"],
    samplePhrases: [
      "We'll get a tech out today.",
      "Your unit's been working hard this summer.",
      "Let's get it tuned up before the worst hits.",
    ],
  },
  priorities: [
    "emergency response time",
    "scheduled maintenance retention",
    "equipment lifetime tracking",
  ],
  aiContext:
    "Desert Cool HVAC is a Phoenix-based HVAC contractor with 14 technicians serving ~1,800 residential and light-commercial accounts. Operations are seasonal with extreme summer (110°F+) demand. Customer relationships are tracked via equipment-installed records and twice-yearly maintenance cadence. Communication style is direct, professional, and family-business warm — the owner answers the phone himself in winter.",
  branding: {
    primaryColor: "#dc2626",
    accentColor: "#0891b2",
    mood: "warm",
  },
  blockDefaults: {
    booking: {
      enabled: true,
      defaultDurationMinutes: 90,
      preferredProvider: "calendly",
      bookingPageHeadline: "Schedule Your AC Service",
      bookingPageDescription: "Book a tune-up, repair, or new install consultation.",
      bufferMinutes: 30,
      allowWeekends: true,
    },
    email: {
      enabled: true,
      preferredProvider: "resend",
      defaultFromName: "Desert Cool HVAC",
      defaultSubjectPrefix: "",
      welcomeTemplateSubject: "Welcome to Desert Cool HVAC",
      welcomeTemplateBody:
        "Hi {{firstName}}, thanks for reaching out. We'll get a tech in touch within the next business day to schedule your service.",
      followUpDelayHours: 24,
    },
    portal: {
      enabled: true,
      welcomeMessage:
        "Welcome to your Desert Cool HVAC portal. View your equipment, service history, and schedule maintenance.",
      enableMessaging: true,
      enableResources: true,
      enableInvoices: true,
      resourceCategories: ["Service Reports", "Equipment Manuals", "Warranty Docs", "Invoices"],
    },
  },
  // SLICE 9 G-9-1 revised: technicians as Soul attribute (not block).
  // 14 hand-curated technicians with realistic skills + service areas.
  // Phoenix metro ZIPs covered: 85003-85048 (Phoenix), 85251-85254
  // (Scottsdale), 85281-85284 (Tempe), 85201-85209 (Mesa), 85224-85226
  // (Chandler), 85301-85308 (Glendale), 85345 (Peoria).
  technicians: [
    { id: "tech_01", name: "Carlos Vega",        employeeId: "DC-001", skill_level: "master",     hireDate: "2010-03-15", certifications: ["NATE", "EPA 608", "EPA 609"], service_area: ["85003", "85004", "85007", "85008", "85009"], on_call_today: true,  current_assignment: null },
    { id: "tech_02", name: "Marcus Torres",      employeeId: "DC-003", skill_level: "senior",     hireDate: "2012-06-22", certifications: ["NATE", "EPA 608"],            service_area: ["85013", "85014", "85015", "85016", "85020"], on_call_today: false, current_assignment: null },
    { id: "tech_03", name: "Daniela Reyes",      employeeId: "DC-005", skill_level: "senior",     hireDate: "2014-01-10", certifications: ["NATE", "EPA 608", "BPI"],     service_area: ["85021", "85022", "85023", "85024", "85027"], on_call_today: true,  current_assignment: null },
    { id: "tech_04", name: "Brandon Kim",        employeeId: "DC-007", skill_level: "senior",     hireDate: "2015-09-08", certifications: ["NATE", "EPA 608"],            service_area: ["85028", "85029", "85032", "85042", "85044"], on_call_today: false, current_assignment: null },
    { id: "tech_05", name: "Anita Singh",        employeeId: "DC-009", skill_level: "journeyman", hireDate: "2017-03-20", certifications: ["EPA 608"],                    service_area: ["85251", "85252", "85253", "85254", "85257"], on_call_today: true,  current_assignment: null },
    { id: "tech_06", name: "Tyler Brennan",      employeeId: "DC-011", skill_level: "journeyman", hireDate: "2017-11-04", certifications: ["EPA 608"],                    service_area: ["85258", "85259", "85260", "85262", "85266"], on_call_today: false, current_assignment: null },
    { id: "tech_07", name: "Jasmine Foster",     employeeId: "DC-013", skill_level: "journeyman", hireDate: "2018-07-14", certifications: ["EPA 608"],                    service_area: ["85281", "85282", "85283", "85284", "85288"], on_call_today: true,  current_assignment: null },
    { id: "tech_08", name: "Ricardo Mendez",     employeeId: "DC-015", skill_level: "journeyman", hireDate: "2019-02-25", certifications: ["EPA 608"],                    service_area: ["85201", "85202", "85203", "85204", "85205"], on_call_today: false, current_assignment: null },
    { id: "tech_09", name: "Ethan Park",         employeeId: "DC-017", skill_level: "journeyman", hireDate: "2019-10-08", certifications: ["EPA 608"],                    service_area: ["85206", "85207", "85208", "85209", "85213"], on_call_today: true,  current_assignment: null },
    { id: "tech_10", name: "Olivia Carter",      employeeId: "DC-019", skill_level: "apprentice", hireDate: "2021-05-12", certifications: ["EPA 608"],                    service_area: ["85224", "85225", "85226", "85248", "85249"], on_call_today: false, current_assignment: null },
    { id: "tech_11", name: "Devin Walsh",        employeeId: "DC-021", skill_level: "apprentice", hireDate: "2022-01-18", certifications: [],                              service_area: ["85226", "85248", "85249", "85286"],          on_call_today: true,  current_assignment: null },
    { id: "tech_12", name: "Priya Joshi",        employeeId: "DC-023", skill_level: "apprentice", hireDate: "2022-09-06", certifications: ["EPA 608"],                    service_area: ["85301", "85302", "85303", "85304", "85305"], on_call_today: false, current_assignment: null },
    { id: "tech_13", name: "Samuel Whittaker",   employeeId: "DC-025", skill_level: "apprentice", hireDate: "2023-04-17", certifications: [],                              service_area: ["85306", "85307", "85308", "85345"],          on_call_today: true,  current_assignment: null },
    { id: "tech_14", name: "Fatima Khalil",      employeeId: "DC-027", skill_level: "apprentice", hireDate: "2023-11-02", certifications: [],                              service_area: ["85345", "85382", "85383"],                  on_call_today: false, current_assignment: null },
  ],
};

// ---------------------------------------------------------------------
// Procedural generators — deterministic so seed reruns produce stable
// data (important for screenshot continuity + integration test sanity).
// ---------------------------------------------------------------------

const FIRST_NAMES = [
  "Robert", "Linda", "Michael", "Patricia", "David", "Jennifer", "John", "Mary",
  "James", "Elizabeth", "William", "Susan", "Richard", "Karen", "Joseph", "Nancy",
  "Thomas", "Margaret", "Charles", "Sandra", "Daniel", "Lisa", "Matthew", "Donna",
  "Anthony", "Carol", "Mark", "Sarah", "Steven", "Michelle", "Andrew", "Laura",
  "Kenneth", "Emily", "Paul", "Kimberly", "Joshua", "Deborah", "Kevin", "Dorothy",
  "Brian", "Amy", "George", "Angela", "Edward", "Ashley", "Ronald", "Brenda",
  "Timothy", "Emma", "Jason", "Olivia", "Jeffrey", "Cynthia", "Ryan", "Marie",
  "Jacob", "Janet", "Gary", "Catherine", "Nicholas", "Frances", "Eric", "Christine",
];

const LAST_NAMES = [
  "Garcia", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Perez",
  "Sanchez", "Ramirez", "Torres", "Flores", "Rivera", "Gomez", "Diaz", "Morales",
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Davis", "Miller", "Wilson",
  "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "Martin", "Lee", "Thompson",
  "White", "Harris", "Clark", "Lewis", "Walker", "Hall", "Allen", "Young", "King",
  "Nguyen", "Patel", "Khan", "Singh", "Kim", "Chen", "Wang", "Liu", "Yang", "Wu",
  "Cohen", "Rosenberg", "Goldberg", "Schwartz", "Friedman", "Brennan", "O'Brien",
  "Murphy", "Sullivan", "Kelly", "Reyes", "Vega", "Castro", "Ortiz", "Ruiz",
];

// Phoenix metro ZIPs grouped roughly by sub-area (drives technician routing).
const PHOENIX_ZIPS = [
  // Central Phoenix
  "85003", "85004", "85007", "85008", "85009", "85013", "85014", "85015", "85016",
  // North Phoenix
  "85020", "85021", "85022", "85023", "85024", "85027", "85028", "85029", "85032",
  // South Phoenix
  "85042", "85044",
  // Scottsdale
  "85251", "85252", "85253", "85254", "85257", "85258", "85259", "85260", "85262", "85266",
  // Tempe
  "85281", "85282", "85283", "85284", "85288",
  // Mesa
  "85201", "85202", "85203", "85204", "85205", "85206", "85207", "85208", "85209", "85213",
  // Chandler
  "85224", "85225", "85226", "85248", "85249", "85286",
  // Glendale
  "85301", "85302", "85303", "85304", "85305", "85306", "85307", "85308",
  // Peoria
  "85345", "85382", "85383",
];

const STREET_NAMES = [
  "Camelback", "Cactus", "Mesa Verde", "Mountain View", "Ironwood", "Saguaro",
  "Roadrunner", "Sunset", "Sunrise", "Palo Verde", "Mesquite", "Ocotillo", "Yucca",
  "Desert", "Vista", "Canyon", "Coyote", "Quail", "Cardinal", "Hummingbird",
  "Verde", "Bronco", "Buckeye", "Indian School", "Bell", "Thunderbird", "Cave Creek",
  "Tatum", "Hayden", "Scottsdale", "McDowell", "Rural", "Mill", "University",
];

const STREET_TYPES = ["St", "Ave", "Blvd", "Dr", "Rd", "Ln", "Pl", "Way", "Ct", "Trail"];

const COMMERCIAL_NAMES = [
  "Phoenix Family Dental", "Desert Sky Pediatrics", "Valley Insurance Agency",
  "Mesa Auto Center", "Sun City Realty", "Cactus Veterinary Clinic",
  "Sonoran Tax Services", "Camelback Law Group", "Old Town Bookkeeping",
  "Tempe Coffee Roasters", "Scottsdale Yoga Studio", "Chandler Print Shop",
  "Glendale Florist", "Peoria Pet Grooming", "Maricopa Engineering",
  "Arizona Solar Solutions", "South Mountain Counseling", "Bell Road Optometry",
  "Indian School Auto Body", "North Valley Pediatrics", "Mountain View Chiropractic",
  "Saguaro Smiles Dental", "Verde Valley Tax & Accounting", "Phoenix West Medical",
  "Mesa Tutoring Center", "Tempe Music School", "Chandler Massage Studio",
  "Glendale Computer Repair", "Phoenix North Realty", "Sun Devil Storage",
];

const EQUIPMENT_BRANDS = ["Trane", "Carrier", "Lennox", "Goodman", "Rheem", "York", "American Standard", "Bryant"];
const EQUIPMENT_TYPES = ["AC condenser", "Air handler", "Furnace", "Heat pump", "Mini-split", "Package unit"];
const EQUIPMENT_MODELS_BY_BRAND: Record<string, string[]> = {
  Trane: ["XR16", "XR17", "XL18i", "XV20i"],
  Carrier: ["Comfort 13", "Performance 16", "Infinity 19VS"],
  Lennox: ["13ACX", "ML14XC1", "XC20"],
  Goodman: ["GSX13", "GSX14", "GSXC18"],
  Rheem: ["RA13", "RA14", "RA17"],
  York: ["YHM12", "YHM14", "YHM18"],
  "American Standard": ["Silver 14", "Silver 15", "Platinum 18"],
  Bryant: ["Preferred 113A", "Evolution 187B", "Evolution 187BNV"],
};

// Deterministic PRNG (mulberry32) — same seed produces same sequence so
// repeated `pnpm db:seed-hvac` runs yield identical fixtures (important
// for screenshot continuity + integration tests).
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260425); // seed = today's date as integer
function pick<T>(arr: T[]): T { return arr[Math.floor(rand() * arr.length)]; }
function rangeInt(min: number, max: number): number { return min + Math.floor(rand() * (max - min + 1)); }

const now = new Date();
const oneDay = 24 * 60 * 60_000;

// ---------------------------------------------------------------------
// Generator — residential customer
// ---------------------------------------------------------------------

type GeneratedCustomer = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  zip: string;
  tier: "residential" | "commercial" | "vip-commercial";
  status: "lead" | "active" | "inactive" | "vip";
  source: string;
  lastServiceDaysAgo: number; // 30-720
  equipmentCount: number;
  primaryEquipmentBrand: string;
  primaryEquipmentType: string;
  primaryEquipmentAgeYears: number;
  primaryEquipmentModel: string;
  notes: string;
};

function genResidential(i: number): GeneratedCustomer {
  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const streetNum = rangeInt(101, 9999);
  const street = `${streetNum} ${pick(STREET_NAMES)} ${pick(STREET_TYPES)}`;
  const zip = pick(PHOENIX_ZIPS);
  const brand = pick(EQUIPMENT_BRANDS);
  const model = pick(EQUIPMENT_MODELS_BY_BRAND[brand]!);
  const ageYears = rangeInt(0, 22);
  const lastServiceDaysAgo = rangeInt(30, 720);
  // Status distribution: 70% active, 18% lead, 12% inactive
  const r = rand();
  const status: GeneratedCustomer["status"] = r < 0.7 ? "active" : r < 0.88 ? "lead" : "inactive";
  // Per L-28: deliberately fake email + phone format (no @real.com,
  // Twilio test number magic-prefix range +14150000xxx).
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i}@desertcool.example.com`;
  const phone = `+1415000${String(2000 + i).padStart(4, "0")}`;
  return {
    firstName, lastName, email, phone, address: street, zip,
    tier: "residential", status, source: pick(["referral", "google", "facebook", "yelp", "website", "repeat"]),
    lastServiceDaysAgo, equipmentCount: rangeInt(1, 3),
    primaryEquipmentBrand: brand,
    primaryEquipmentType: pick(EQUIPMENT_TYPES.slice(0, 4)),
    primaryEquipmentAgeYears: ageYears,
    primaryEquipmentModel: model,
    notes: ageYears > 15 ? "Older system; replacement candidate" : "",
  };
}

function genCommercial(i: number, vip: boolean): GeneratedCustomer {
  const company = COMMERCIAL_NAMES[i % COMMERCIAL_NAMES.length];
  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const streetNum = rangeInt(101, 9999);
  const street = `${streetNum} ${pick(STREET_NAMES)} ${pick(STREET_TYPES)}`;
  const zip = pick(PHOENIX_ZIPS);
  const brand = pick(EQUIPMENT_BRANDS);
  const model = pick(EQUIPMENT_MODELS_BY_BRAND[brand]!);
  const ageYears = rangeInt(0, 18);
  // Per L-28: fake email + phone.
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${company.toLowerCase().replace(/[^a-z]/g, "")}.example.com`;
  const phone = `+1415000${String(7000 + i).padStart(4, "0")}`;
  return {
    firstName, lastName, email, phone, address: street, zip,
    tier: vip ? "vip-commercial" : "commercial",
    status: vip ? "vip" : "active",
    source: pick(["referral", "google", "industry-association", "repeat", "contract-renewal"]),
    lastServiceDaysAgo: rangeInt(30, 365),
    equipmentCount: rangeInt(2, 8),
    primaryEquipmentBrand: brand,
    primaryEquipmentType: pick(["Package unit", "Heat pump", "AC condenser"]),
    primaryEquipmentAgeYears: ageYears,
    primaryEquipmentModel: model,
    notes: vip ? `VIP service contract — ${company}` : `Commercial account — ${company}`,
  };
}

// ---------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------

async function seedHvac() {
  console.log("Seeding Desert Cool HVAC (Phoenix, AZ) demo workspace...");

  // ── Org ──
  const [org] = await db
    .insert(organizations)
    .values({
      name: "Desert Cool HVAC",
      slug: "demo-hvac-arizona",
      plan: "pro",
      // Soul is loosely typed at the schema layer; technicians array is a
      // SLICE 9 G-9-1 extension (technicians as Soul attribute, not block).
      soul: desertCoolSoul as never,
      soulCompletedAt: now,
      theme: {
        primaryColor: "#dc2626",
        accentColor: "#0891b2",
        fontFamily: "Outfit",
        mode: "light",
        borderRadius: "rounded",
        logoUrl: null,
      },
      timezone: "America/Phoenix",
    })
    .onConflictDoNothing({ target: organizations.slug })
    .returning();

  if (!org) {
    console.log("Desert Cool HVAC org already exists — skipping seed.");
    return;
  }

  // ── Owner ──
  const [owner] = await db
    .insert(users)
    .values({
      orgId: org.id,
      name: "Jordan Reyes",
      email: "jordan@desertcool.example.com",
      role: "owner",
      passwordHash: "$2b$10$demohashdemohashdemohashdemohashdemohashdemoha",
    })
    .returning();
  if (!owner) throw new Error("Failed to create owner");
  await db.update(organizations).set({ ownerId: owner.id }).where(eq(organizations.id, org.id));

  // ── Pipeline ──
  const [pipeline] = await db
    .insert(pipelines)
    .values({
      orgId: org.id,
      name: "Job Pipeline",
      isDefault: true,
      stages: desertCoolSoul.pipeline.stages,
    })
    .returning();
  if (!pipeline) throw new Error("Failed to create pipeline");

  // ── Customers — procedural generation ──
  // Per scenario doc: ~1,540 residential + ~260 commercial.
  // Reduced to ~250 + ~50 = 300 total in seed for reasonable seed-time.
  // Production fixture would expand to full ~1,800; demo time prefers
  // a representative sample that loads in <2s.
  const RESIDENTIAL_COUNT = 250;
  const COMMERCIAL_COUNT = 45;
  const VIP_COMMERCIAL_COUNT = 5;

  const generated: GeneratedCustomer[] = [];
  for (let i = 0; i < RESIDENTIAL_COUNT; i++) generated.push(genResidential(i));
  for (let i = 0; i < COMMERCIAL_COUNT; i++) generated.push(genCommercial(i, false));
  for (let i = 0; i < VIP_COMMERCIAL_COUNT; i++) generated.push(genCommercial(COMMERCIAL_COUNT + i, true));

  console.log(`  Generating ${generated.length} customers (${RESIDENTIAL_COUNT} residential, ${COMMERCIAL_COUNT} commercial, ${VIP_COMMERCIAL_COUNT} vip-commercial)...`);

  const insertedContacts = await db
    .insert(contacts)
    .values(
      generated.map((c) => ({
        orgId: org.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        company: c.tier === "residential" ? null : COMMERCIAL_NAMES[generated.indexOf(c) % COMMERCIAL_NAMES.length],
        title: c.tier === "residential" ? null : "Facilities Manager",
        status: c.status,
        source: c.source,
        score: c.tier === "vip-commercial" ? 95 : c.tier === "commercial" ? 70 : 50,
        tags: [c.tier, ...(c.primaryEquipmentAgeYears > 15 ? ["replacement-candidate"] : [])],
        customFields: {
          tier: c.tier,
          service_area_zip: c.zip,
          last_service_at: new Date(now.getTime() - c.lastServiceDaysAgo * oneDay).toISOString(),
          equipment_count: c.equipmentCount,
          primary_equipment: {
            brand: c.primaryEquipmentBrand,
            model: c.primaryEquipmentModel,
            type: c.primaryEquipmentType,
            age_years: c.primaryEquipmentAgeYears,
            install_year: now.getFullYear() - c.primaryEquipmentAgeYears,
          },
          street_address: c.address,
          notes: c.notes,
        },
      })),
    )
    .returning({ id: contacts.id, firstName: contacts.firstName });

  console.log(`  Inserted ${insertedContacts.length} customer records.`);

  // ── Service-call activities — sample subset ──
  // For each of the first 60 customers, create 1-3 historical service
  // call activities (so /agents/runs + activity feeds have realistic
  // density without bloating seed time).
  const ACTIVITY_TYPES = [
    { type: "service_call",       subject: "Spring tune-up — both units",         body: "Replaced filter, cleared condensate drain, verified refrigerant charge. Customer reported quieter operation." },
    { type: "service_call",       subject: "Emergency call — AC not cooling",     body: "Capacitor failed. Replaced under warranty. Unit cooling normally on departure." },
    { type: "service_call",       subject: "Fall furnace inspection",             body: "Cleaned burners, replaced flame sensor, tested CO levels (within spec). Recommended next service in 6 months." },
    { type: "install",            subject: "New AC condenser install — 4-ton",    body: "Removed old Goodman GSX13 (16 years), installed new Trane XR16 with new line set. 8-hour job, customer signed off." },
    { type: "warranty",           subject: "Warranty claim — compressor",         body: "Compressor failed within 5-year warranty. Manufacturer covers parts; labor billed at standard rate." },
    { type: "estimate",           subject: "Replacement quote — 2-stage system",  body: "Quoted dual-stage 4-ton system + new air handler. $8,400 installed. Customer considering rebate options." },
    { type: "note",               subject: "Customer reschedule request",         body: "Original appointment moved from Tuesday 9am to Thursday 1pm at customer's request." },
    { type: "follow-up",          subject: "Post-service satisfaction check",     body: "Reached out 2 days after service. Customer happy with work; rated 5/5. Asked for review on Google." },
  ];

  const seedDate = (daysAgo: number) => new Date(now.getTime() - daysAgo * oneDay);

  const activityRows: Array<{
    orgId: string; contactId: string; userId: string;
    type: string; subject: string; body: string;
    scheduledAt: Date; completedAt: Date | undefined;
  }> = [];

  for (let i = 0; i < Math.min(60, insertedContacts.length); i++) {
    const contact = insertedContacts[i]!;
    const activityCount = rangeInt(1, 3);
    for (let j = 0; j < activityCount; j++) {
      const activity = pick(ACTIVITY_TYPES);
      const daysAgo = rangeInt(7, 540); // 1 week to 18 months
      activityRows.push({
        orgId: org.id,
        contactId: contact.id,
        userId: owner.id,
        type: activity.type,
        subject: activity.subject,
        body: activity.body,
        scheduledAt: seedDate(daysAgo),
        completedAt: seedDate(daysAgo),
      });
    }
  }

  await db.insert(activities).values(activityRows);
  console.log(`  Inserted ${activityRows.length} service-history activities.`);

  console.log("Done.");
  console.log(`  org: ${org.id} (slug=${org.slug})`);
  console.log(`  owner: ${owner.email}`);
  console.log(`  contacts: ${insertedContacts.length}`);
  console.log(`  technicians: ${desertCoolSoul.technicians.length} (in soul.technicians)`);
  console.log(`  activities: ${activityRows.length}`);
}

seedHvac()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
