// Synthetic in-memory dataset standing in for the Supabase-backed backend this
// project was built against. Shapes and generation logic mirror the SQL
// migrations under supabase/migrations/ (same islands, same provider mix,
// same patient-generation weights) so the app renders exactly as designed
// without needing a live database. Fixed UUIDs below match the ones the app
// code references directly (HERO_PATIENT_ID, DEMO_FACILITY, etc).
import { makeRng, pick, int, chance, uuid, type Rng } from "./rng";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";

/**
 * Bump whenever the generated dataset changes in a way a stale browser copy
 * would misrepresent — new tables, new cohorts, different volumes.
 *
 * The persisted store used a fixed key, so a browser that had opened the app
 * once kept its original seed forever: the app would run new code against an
 * old dataset and show, for example, a consultant with three patients because
 * the hospital roster that fills his panel did not exist yet. Nothing surfaced
 * the mismatch. The key now carries this version, so an old copy is simply not
 * found and the seed is rebuilt.
 */
export const SEED_VERSION = 8;

export const HERO_PATIENT_ID = "11111111-1111-4111-8111-111111111111";
export const JM_CLINIC_ID = "a0ce1541-1e9d-4cce-81a5-218002bddd9d";
export const TT_HOSPITAL_ID = "2c65425d-ad09-4e50-a019-f8afa29a14b4";
export const JM_HOSPITAL_ID = "5e722b4d-9d67-4664-a8ad-59e47896c391";
export const AG_CLINIC_ID = "cbbbc668-51f2-4f5d-a67e-57076dbbebd4";
export const ATTENDING_PROVIDER_ID = "74796b4d-c546-4ee6-bfa1-4212bc07cac1";

// Fixed auth-user / profile ids for the five demo personas in demo-accounts.ts.
export const DEMO_USER_IDS = {
  patient: "d1000000-0000-4000-8000-000000000001",
  clinic_staff: "d1000000-0000-4000-8000-000000000002",
  clinician: "d1000000-0000-4000-8000-000000000003",
  ministry: "d1000000-0000-4000-8000-000000000004",
  insurer: "d1000000-0000-4000-8000-000000000005",
} as const;

const nowMs = () => Date.now();
const daysAgo = (d: number) => new Date(nowMs() - d * 86400000).toISOString();
const daysAhead = (d: number) => new Date(nowMs() + d * 86400000).toISOString();
const minutesAgo = (m: number) => new Date(nowMs() - m * 60000).toISOString();
const dateDaysAgo = (d: number) => new Date(nowMs() - d * 86400000).toISOString().slice(0, 10);
const dateDaysAhead = (d: number) => new Date(nowMs() + d * 86400000).toISOString().slice(0, 10);

/**
 * A record number scoped to the country that issued it, and a birth date
 * consistent with the age already on the record. Two identifiers a clinician
 * can read back to a patient — a name on its own is not one.
 */
function identifiersFor(rng: Rng, islandCode: string, age: number) {
  const born = new Date(nowMs() - age * 365.25 * 86400000 - int(rng, 0, 364) * 86400000);
  return {
    mrn: `${islandCode}-${String(int(rng, 100000, 999999))}`,
    date_of_birth: born.toISOString().slice(0, 10),
  };
}

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

// Resource profiles are what let the Grid reason about an unequal region rather
// than a uniform one. Figures are ILLUSTRATIVE — right order of magnitude, drawn
// from public WHO / World Bank / PAHO country indicators of varying years. They
// exist to make the asymmetry real, not to be cited as a harmonised dataset.
//
//   tier          how much specialist capacity the island can offer its own people
//   physPer1k     physicians per 1,000 population
//   connectivity  what the patient channel may assume (data / SMS / offline-first)
//   payment       who pays at the point of care
//
// The three additions below are deliberate. Haiti and Cuba are the two ends of
// the region's spectrum and neither resembles the CARICOM middle: Haiti has the
// hemisphere's thinnest clinical workforce, Cuba one of the world's densest —
// alongside severe medicine supply constraints. The Dominican Republic sits
// between them and shares a land border with Haiti, which is where cross-border
// care in this region actually happens.
const ISLANDS = [
  {
    code: "JM",
    name: "Jamaica",
    country: "Jamaica",
    population: 2825000,
    lat: 18.1096,
    lng: -77.2975,
    tier: "middle",
    physPer1k: 1.3,
    bedsPer1k: 1.7,
    connectivity: "good",
    payment: "mixed",
  },
  {
    code: "TT",
    name: "Trinidad and Tobago",
    country: "Trinidad and Tobago",
    population: 1531000,
    lat: 10.6918,
    lng: -61.2225,
    tier: "well_resourced",
    physPer1k: 2.7,
    bedsPer1k: 3.0,
    connectivity: "good",
    payment: "insured",
  },
  {
    code: "BB",
    name: "Barbados",
    country: "Barbados",
    population: 281000,
    lat: 13.1939,
    lng: -59.5432,
    tier: "well_resourced",
    physPer1k: 2.5,
    bedsPer1k: 5.8,
    connectivity: "good",
    payment: "insured",
  },
  {
    code: "GD",
    name: "Grenada",
    country: "Grenada",
    population: 125000,
    lat: 12.1165,
    lng: -61.679,
    tier: "middle",
    physPer1k: 1.4,
    bedsPer1k: 3.6,
    connectivity: "good",
    payment: "mixed",
  },
  {
    code: "LC",
    name: "Saint Lucia",
    country: "Saint Lucia",
    population: 180000,
    lat: 13.9094,
    lng: -60.9789,
    tier: "middle",
    physPer1k: 0.6,
    bedsPer1k: 1.3,
    connectivity: "good",
    payment: "mixed",
  },
  {
    code: "VC",
    name: "Saint Vincent",
    country: "Saint Vincent and the Grenadines",
    population: 111000,
    lat: 13.2528,
    lng: -61.1971,
    tier: "middle",
    physPer1k: 0.7,
    bedsPer1k: 2.6,
    connectivity: "patchy",
    payment: "mixed",
  },
  {
    code: "DM",
    name: "Dominica",
    country: "Dominica",
    population: 72000,
    lat: 15.415,
    lng: -61.371,
    tier: "middle",
    physPer1k: 1.1,
    bedsPer1k: 3.8,
    connectivity: "patchy",
    payment: "mixed",
  },
  {
    code: "AG",
    name: "Antigua",
    country: "Antigua and Barbuda",
    population: 98000,
    lat: 17.0608,
    lng: -61.7964,
    tier: "middle",
    physPer1k: 2.9,
    bedsPer1k: 2.9,
    connectivity: "good",
    payment: "mixed",
  },
  {
    code: "HT",
    name: "Haiti",
    country: "Haiti",
    population: 11700000,
    lat: 18.9712,
    lng: -72.2852,
    tier: "under_resourced",
    physPer1k: 0.23,
    bedsPer1k: 0.7,
    connectivity: "poor",
    payment: "out_of_pocket",
  },
  {
    code: "DO",
    name: "Dominican Republic",
    country: "Dominican Republic",
    population: 11330000,
    lat: 18.7357,
    lng: -70.1627,
    tier: "middle",
    physPer1k: 1.5,
    bedsPer1k: 1.6,
    connectivity: "patchy",
    payment: "mixed",
  },
  {
    code: "CU",
    name: "Cuba",
    country: "Cuba",
    population: 11190000,
    lat: 21.5218,
    lng: -77.7812,
    tier: "clinician_rich",
    physPer1k: 8.4,
    bedsPer1k: 5.3,
    connectivity: "poor",
    payment: "state",
  },
] as const;

export const TIER_LABEL: Record<string, string> = {
  well_resourced: "Well resourced",
  middle: "Middle",
  clinician_rich: "Clinician-rich, supply-constrained",
  under_resourced: "Under-resourced",
};

const FACILITY_KINDS = [
  { suffix: "General Hospital", kind: "hospital", beds: 180 },
  { suffix: "Community Clinic", kind: "clinic", beds: 14 },
  { suffix: "Rural Health Centre", kind: "clinic", beds: 8 },
] as const;

const PROVIDER_MIX: { island: string; specialty: string; cnt: number; wait: number }[] = [
  { island: "JM", specialty: "General Practice", cnt: 6, wait: 9 },
  { island: "JM", specialty: "Internal Medicine", cnt: 3, wait: 16 },
  { island: "JM", specialty: "Endocrinology", cnt: 1, wait: 38 },
  { island: "JM", specialty: "Nephrology", cnt: 1, wait: 34 },
  { island: "JM", specialty: "Ophthalmology", cnt: 1, wait: 29 },
  { island: "TT", specialty: "General Practice", cnt: 5, wait: 7 },
  { island: "TT", specialty: "Cardiology", cnt: 3, wait: 12 },
  { island: "TT", specialty: "Endocrinology", cnt: 2, wait: 15 },
  { island: "TT", specialty: "Nephrology", cnt: 2, wait: 18 },
  { island: "TT", specialty: "Psychiatry", cnt: 1, wait: 21 },
  { island: "BB", specialty: "General Practice", cnt: 4, wait: 6 },
  { island: "BB", specialty: "Cardiology", cnt: 2, wait: 11 },
  { island: "BB", specialty: "Endocrinology", cnt: 1, wait: 14 },
  { island: "BB", specialty: "Nephrology", cnt: 1, wait: 17 },
  { island: "BB", specialty: "Ophthalmology", cnt: 1, wait: 20 },
  { island: "GD", specialty: "General Practice", cnt: 3, wait: 10 },
  { island: "GD", specialty: "Internal Medicine", cnt: 1, wait: 24 },
  { island: "LC", specialty: "General Practice", cnt: 3, wait: 11 },
  { island: "LC", specialty: "Internal Medicine", cnt: 1, wait: 22 },
  { island: "LC", specialty: "Endocrinology", cnt: 1, wait: 26 },
  { island: "VC", specialty: "General Practice", cnt: 2, wait: 13 },
  { island: "VC", specialty: "Internal Medicine", cnt: 1, wait: 27 },
  { island: "DM", specialty: "General Practice", cnt: 2, wait: 15 },
  { island: "AG", specialty: "General Practice", cnt: 3, wait: 8 },
  { island: "AG", specialty: "Cardiology", cnt: 1, wait: 19 },
  { island: "AG", specialty: "Psychiatry", cnt: 1, wait: 23 },

  // Haiti: 11.7M people, essentially no on-island specialist capacity for NCDs
  // and long primary-care waits. Every specialist referral here has to leave the
  // country — which is exactly the case the routing engine has to handle fairly.
  { island: "HT", specialty: "General Practice", cnt: 4, wait: 45 },
  { island: "HT", specialty: "Internal Medicine", cnt: 1, wait: 70 },

  // Dominican Republic: shares a land border with Haiti; the realistic first
  // destination for Haitian cross-border referrals.
  { island: "DO", specialty: "General Practice", cnt: 6, wait: 8 },
  { island: "DO", specialty: "Internal Medicine", cnt: 3, wait: 14 },
  { island: "DO", specialty: "Cardiology", cnt: 2, wait: 17 },
  { island: "DO", specialty: "Endocrinology", cnt: 1, wait: 24 },
  { island: "DO", specialty: "Nephrology", cnt: 1, wait: 26 },

  // Cuba: the region's deepest clinical bench and shortest waits. Its constraint
  // is medicine supply, not clinicians — modelled in stock levels, not here.
  { island: "CU", specialty: "General Practice", cnt: 8, wait: 3 },
  { island: "CU", specialty: "Internal Medicine", cnt: 4, wait: 6 },
  { island: "CU", specialty: "Cardiology", cnt: 3, wait: 9 },
  { island: "CU", specialty: "Endocrinology", cnt: 2, wait: 11 },
  { island: "CU", specialty: "Nephrology", cnt: 2, wait: 12 },
  { island: "CU", specialty: "Ophthalmology", cnt: 2, wait: 10 },
];

const FIRST_NAMES_DR = [
  "Andre",
  "Camille",
  "Devon",
  "Simone",
  "Rohan",
  "Anika",
  "Kwame",
  "Nadia",
  "Trevor",
  "Shanice",
  "Errol",
  "Yolande",
  "Dwight",
  "Marsha",
  "Rajiv",
  "Petra",
  "Colin",
  "Jodi-Ann",
  "Leon",
  "Cheryl",
];
const LAST_NAMES_DR = [
  "Bailey",
  "Ramsingh",
  "Clarke",
  "Joseph",
  "Providence",
  "Grant",
  "Alleyne",
  "Sinanan",
  "Charles",
  "Boyce",
  "Prescod",
  "Frederick",
  "Baptiste",
  "Henriques",
  "Maharaj",
  "Cadogan",
  "Simmons",
  "Toussaint",
  "Beckles",
  "Marshall",
];

// Name pools by cultural tradition, not one Anglo-Caribbean list for all eleven
// countries. The Grid covers Haiti, Cuba and the Dominican Republic, and a
// Haitian patient called "Winston Campbell" or a Cuban called "Delroy Weekes"
// reads as a placeholder the moment a Caribbean clinician looks at the screen.
// Trinidad is split because roughly a third of the population is Indo-
// Trinidadian, which the surname distribution should show.
//
// Given names are also split by sex, because the previous version picked a name
// and a sex independently and produced patients like "Delroy Isaac · 69F".
const ANGLO_F = [
  "Marlene",
  "Sharon",
  "Althea",
  "Beverley",
  "Icilda",
  "Merlene",
  "Pearline",
  "Grace",
  "Doreen",
  "Hyacinth",
  "Yvette",
  "Monica",
  "Verona",
  "Claudette",
  "Sandra",
  "Cynthia",
  "Novelette",
  "Paulette",
  "Enid",
  "Millicent",
  "Joyce",
  "Carmen",
  "Eulalee",
  "Jacintha",
  "Dorette",
  "Lurline",
  "Icylin",
  "Berthlyn",
  "Marva",
  "Sonia",
];
const ANGLO_M = [
  "Delroy",
  "Winston",
  "Junior",
  "Clement",
  "Everton",
  "Rupert",
  "Lloyd",
  "Neville",
  "Sylvester",
  "Barrington",
  "Fitzroy",
  "Desmond",
  "Linton",
  "Egbert",
  "Owen",
  "Errol",
  "Vincent",
  "Horace",
  "Cuthbert",
  "Leroy",
  "Devon",
  "Cleveland",
  "Adrian",
  "Wendell",
  "Osbourne",
  "Trevor",
  "Colin",
  "Garfield",
  "Hopeton",
  "Dwight",
];
const ANGLO_LAST = [
  "Campbell",
  "Bramble",
  "Gilkes",
  "Charles",
  "Edwards",
  "Providence",
  "Isaac",
  "Belgrave",
  "Phillip",
  "Stewart",
  "Blackman",
  "Anthony",
  "Peters",
  "Lewis",
  "Weekes",
  "Douglas",
  "Samuel",
  "Browne",
  "Clarke",
  "Grant",
  "Hinds",
  "Joseph",
  "Alleyne",
  "Cumberbatch",
  "Springer",
  "Bailey",
  "Thompson",
  "Walters",
  "Sealy",
  "Nurse",
];

const INDO_F = [
  "Savitri",
  "Radica",
  "Kamla",
  "Indira",
  "Anita",
  "Reshma",
  "Sunita",
  "Drupatee",
  "Parbatee",
  "Seeta",
  "Rani",
  "Sharmila",
  "Bhagwantee",
  "Devika",
  "Roopnarine",
];
const INDO_M = [
  "Anand",
  "Rajesh",
  "Vishnu",
  "Deodath",
  "Ramesh",
  "Krishna",
  "Sunil",
  "Harold",
  "Ravi",
  "Bissoondath",
  "Dinesh",
  "Chandra",
  "Prakash",
  "Mahendra",
  "Suresh",
];
const INDO_LAST = [
  "Ramkissoon",
  "Mohammed",
  "Hosein",
  "Persad",
  "Maharaj",
  "Singh",
  "Sookdeo",
  "Ramnarine",
  "Bissessar",
  "Ali",
  "Khan",
  "Rampersad",
  "Balgobin",
  "Seepersad",
  "Boodoo",
];

const HAITI_F = [
  "Marie-Ange",
  "Nadège",
  "Fabiola",
  "Guerline",
  "Roseline",
  "Mirlande",
  "Darline",
  "Yveline",
  "Sherline",
  "Manouchka",
  "Islande",
  "Rosemène",
  "Jesula",
  "Wideline",
  "Magalie",
];
const HAITI_M = [
  "Jean-Baptiste",
  "Wilner",
  "Fritznel",
  "Édouard",
  "Renel",
  "Dieuseul",
  "Josué",
  "Wilkens",
  "Emmanuel",
  "Ronald",
  "Yvenel",
  "Kesnel",
  "Mackenson",
  "Jocelyn",
  "Berthony",
];
const HAITI_LAST = [
  "Pierre",
  "Jean",
  "Charles",
  "Joseph",
  "Louis",
  "Baptiste",
  "Toussaint",
  "Désir",
  "Étienne",
  "Alexis",
  "Célestin",
  "Fils-Aimé",
  "Dorvil",
  "Saint-Fleur",
  "Beauvoir",
];

const HISP_F = [
  "María",
  "Yolanda",
  "Caridad",
  "Milagros",
  "Dulce",
  "Xiomara",
  "Altagracia",
  "Yanet",
  "Marisol",
  "Idalia",
  "Zoraida",
  "Damaris",
  "Aracelis",
  "Odalys",
  "Belkis",
];
const HISP_M = [
  "José",
  "Ramón",
  "Orlando",
  "Eduardo",
  "Reinaldo",
  "Ernesto",
  "Wilfredo",
  "Aníbal",
  "Radhamés",
  "Osvaldo",
  "Ovidio",
  "Elpidio",
  "Rigoberto",
  "Yoandri",
  "Lázaro",
];
const HISP_LAST = [
  "Rodríguez",
  "Fernández",
  "Gómez",
  "Peña",
  "Herrera",
  "Cabrera",
  "Batista",
  "Ureña",
  "Almonte",
  "Guerrero",
  "Valdés",
  "Betancourt",
  "Sarmiento",
  "Cepeda",
  "Mejía",
];

/** A name drawn from the tradition that fits the patient's country and sex. */
function nameFor(rng: Rng, code: string, sex: string): string {
  const female = sex === "F";
  if (code === "HT") return `${pick(rng, female ? HAITI_F : HAITI_M)} ${pick(rng, HAITI_LAST)}`;
  if (code === "DO" || code === "CU")
    return `${pick(rng, female ? HISP_F : HISP_M)} ${pick(rng, HISP_LAST)}`;
  // Trinidad and Tobago: roughly a third of the population is Indo-Trinidadian.
  if (code === "TT" && chance(rng, 0.36))
    return `${pick(rng, female ? INDO_F : INDO_M)} ${pick(rng, INDO_LAST)}`;
  return `${pick(rng, female ? ANGLO_F : ANGLO_M)} ${pick(rng, ANGLO_LAST)}`;
}

const PARISHES: Record<string, string[]> = {
  JM: [
    "St. Elizabeth",
    "Clarendon",
    "St. Thomas",
    "Portland",
    "Westmoreland",
    "Kingston",
    "St. Ann",
  ],
  TT: ["Sangre Grande", "Mayaro", "Point Fortin", "Chaguanas", "Tobago East", "Siparia"],
  BB: ["St. Lucy", "St. Andrew", "St. Philip", "Christ Church", "St. John"],
  GD: ["St. Patrick", "St. David", "Carriacou", "St. Andrew"],
  LC: ["Soufriere", "Micoud", "Dennery", "Choiseul", "Gros Islet"],
  VC: ["Union Island", "Georgetown", "Bequia", "Barrouallie"],
  DM: ["Portsmouth", "Grand Bay", "Marigot", "La Plaine"],
  AG: ["Barbuda", "St. Philip", "St. Mary", "Bolans"],
  HT: ["Ouest", "Artibonite", "Nord", "Sud", "Centre", "Grand'Anse"],
  DO: ["Distrito Nacional", "Santiago", "La Altagracia", "San Cristóbal", "Barahona"],
  CU: ["La Habana", "Santiago de Cuba", "Camagüey", "Holguín", "Villa Clara"],
};

// Scaled down from the original ~290-patient migration seed for a snappier
// browser-only demo; proportions preserved.
// Registered patients per country. Trinidad carries the largest roster not
// because it has the most people — Haiti alone has seven times its population —
// but because Trinidad and Tobago General is the deployment site: the hospital
// actually running the Grid registers its whole catchment, while other
// countries are still onboarding through referrals and clinics.
const PATIENT_WEIGHTS: Record<string, number> = {
  JM: 140,
  TT: 200,
  BB: 55,
  GD: 28,
  LC: 34,
  VC: 24,
  DM: 18,
  AG: 24,
  // Weighted up to reflect population: these three hold roughly 34M of the
  // region's people between them, and a demo that under-represents them would
  // hide the exact inequity this build exists to surface.
  HT: 110,
  DO: 80,
  CU: 62,
};

const CONDITION_PROB: [string, number][] = [
  ["Type 2 Diabetes", 0.42],
  ["Hypertension", 0.58],
  ["Chronic Kidney Disease", 0.09],
  ["Obesity", 0.31],
  ["Heart Failure", 0.06],
];

const MED_FOR_COND: Record<string, { name: string; dose: string }> = {
  "Type 2 Diabetes": { name: "Metformin", dose: "500mg" },
  Hypertension: { name: "Amlodipine", dose: "10mg" },
  "Chronic Kidney Disease": { name: "Furosemide", dose: "40mg" },
  "Heart Failure": { name: "Carvedilol", dose: "12.5mg" },
};

const INSURERS = ["Sagicor", "Guardian Life", "Beacon", "National Health Fund", "Uninsured"];
const STOCK_MEDS = [
  "Metformin 500mg",
  "Amlodipine 10mg",
  "Lisinopril 20mg",
  "Insulin glargine",
  "Furosemide 40mg",
];

function computeRisk(
  rng: Rng,
  age: number,
  kmToFacility: number,
  conditionCount: number,
  avgAdherence: number,
  avgSys: number,
  avgGlu: number,
  prevSys: number,
) {
  const sBp = Math.min(32, Math.max(0, (avgSys - 120) * 0.95));
  const sGlu = Math.min(20, Math.max(0, (avgGlu - 6.0) * 6));
  const sAdh = Math.min(18, Math.max(0, (100 - avgAdherence) * 0.28));
  const sAge = Math.min(12, Math.max(0, (age - 40) * 0.3));
  const sCond = Math.min(12, conditionCount * 4);
  const sAcc = Math.min(6, kmToFacility * 0.12);
  const total = Math.round(sBp + sGlu + sAdh + sAge + sCond + sAcc);
  const band = total >= 68 ? "critical" : total >= 50 ? "high" : total >= 32 ? "moderate" : "low";
  const trend = avgSys - prevSys > 4 ? "rising" : prevSys - avgSys > 4 ? "improving" : "stable";
  const drivers = [
    { label: `Blood pressure (14d avg ${Math.round(avgSys)} mmHg)`, points: Math.round(sBp) },
    { label: `Glucose (14d avg ${avgGlu.toFixed(1)} mmol/L)`, points: Math.round(sGlu) },
    { label: `Medication adherence ${Math.round(avgAdherence)}%`, points: Math.round(sAdh) },
    { label: `Age ${age}`, points: Math.round(sAge) },
    { label: `${conditionCount} chronic condition(s)`, points: Math.round(sCond) },
    { label: `Distance to care ${kmToFacility} km`, points: Math.round(sAcc) },
  ];
  void rng;
  return { score: total, band, trend, drivers };
}

export function buildSeed(): Tables {
  const rng = makeRng(0x4242);
  const t: Tables = {
    islands: [],
    facilities: [],
    providers: [],
    availability_slots: [],
    patients: [],
    conditions: [],
    medications: [],
    vitals: [],
    messages: [],
    triage_events: [],
    referrals: [],
    consultations: [],
    consent_grants: [],
    consent_access_log: [],
    risk_scores: [],
    alerts: [],
    stock_items: [],
    profiles: [],
    user_roles: [],
    facility_staff: [],
    encounters: [],
    treating_window_policies: [],
    data_sharing_agreements: [],
    sensitive_grants: [],
    care_team_members: [],
    break_glass_events: [],
    screening_campaigns: [],
    campaign_targets: [],
    detection_signals: [],
    clinical_documents: [],
    api_clients: [],
    workflow_events: [],
    cooperative_members: [],
    data_requests: [],
  };

  // ---- islands ----
  for (const i of ISLANDS) t.islands.push({ ...i });

  // ---- facilities ----
  // Facilities are sized like real buildings, not like a country. The three-per-
  // island model used to divide a nation's entire bed capacity between them,
  // which put 4,093 beds inside Trinidad and Tobago General and 11,000 inside a
  // single Cuban hospital. National capacity is now read from the island's own
  // population and bed density on the coordination dashboard, which frees these
  // rows to describe actual hospitals — and lets populous countries carry the
  // district hospitals they would really have.
  const facilitiesByIsland: Record<string, Row[]> = {};
  for (const i of ISLANDS) {
    facilitiesByIsland[i.code] = [];
    const big = i.population > 1_000_000;
    const districtCount = Math.max(0, Math.min(8, Math.round(i.population / 500_000)));
    const districtParishes = [...(PARISHES[i.code] ?? [])].slice(0, districtCount);
    const specs: { name: string; kind: string; beds: number }[] = [
      {
        name: `${i.name} General Hospital`,
        kind: "hospital",
        beds: big ? int(rng, 520, 880) : int(rng, 120, 340),
      },
      { name: `${i.name} Community Clinic`, kind: "clinic", beds: int(rng, 10, 26) },
      { name: `${i.name} Rural Health Centre`, kind: "clinic", beds: int(rng, 5, 14) },
      ...districtParishes.map((parish) => ({
        name: `${parish} District Hospital`,
        kind: "hospital",
        beds: int(rng, 90, 260),
      })),
    ];
    for (const f of specs) {
      const occRatio = 0.58 + rng() * 0.38;
      const row: Row = {
        id: uuid(rng),
        name: f.name,
        island_code: i.code,
        kind: f.kind,
        beds_total: f.beds,
        beds_occupied: Math.max(0, Math.round(f.beds * occRatio)),
        created_at: daysAgo(400),
      };
      t.facilities.push(row);
      facilitiesByIsland[i.code].push(row);
    }
  }
  // Overwrite specific slots with the fixed IDs the app code references directly.
  const jmClinic = facilitiesByIsland.JM.find((f) => f.kind === "clinic")!;
  jmClinic.id = JM_CLINIC_ID;
  const jmHospital = facilitiesByIsland.JM.find((f) => f.kind === "hospital")!;
  jmHospital.id = JM_HOSPITAL_ID;
  const ttHospital = facilitiesByIsland.TT.find((f) => f.kind === "hospital")!;
  ttHospital.id = TT_HOSPITAL_ID;
  const agClinic = facilitiesByIsland.AG.find((f) => f.kind === "clinic")!;
  agClinic.id = AG_CLINIC_ID;

  // ---- providers ----
  const providersByIslandSpecialty: Record<string, Row[]> = {};
  for (const m of PROVIDER_MIX) {
    for (let n = 0; n < m.cnt; n++) {
      const facility = pick(rng, facilitiesByIsland[m.island]);
      // Who can actually consult with a Haitian Kreyòl speaker is the binding
      // constraint on Haitian referrals: Haiti's own clinicians, some Dominican
      // border-province clinicians, and Cuban clinicians (many have served in
      // Haiti). Nobody else in the region can, which the router must respect.
      const languages = ["LC", "DM"].includes(m.island)
        ? ["en", "fr-cr"]
        : m.island === "TT"
          ? ["en", "es"]
          : m.island === "HT"
            ? ["ht", "fr"]
            : m.island === "DO"
              ? chance(rng, 0.35)
                ? ["es", "ht"]
                : ["es"]
              : m.island === "CU"
                ? chance(rng, 0.3)
                  ? ["es", "ht"]
                  : ["es"]
                : ["en"];
      const rate =
        m.specialty === "General Practice" ? 25 : m.specialty === "Internal Medicine" ? 45 : 70;
      const row: Row = {
        id: uuid(rng),
        full_name: `Dr. ${pick(rng, FIRST_NAMES_DR)} ${pick(rng, LAST_NAMES_DR)}`,
        specialty: m.specialty,
        island_code: m.island,
        facility_id: facility.id,
        languages,
        teleconsult_rate_usd: rate,
        next_local_wait_days: m.wait,
        created_at: daysAgo(300),
      };
      t.providers.push(row);
      const key = `${m.island}|${m.specialty}`;
      (providersByIslandSpecialty[key] ??= []).push(row);
    }
  }
  // Fixed attending physician for the hero patient's care team (JM General Practice, at the JM clinic).
  const attending = providersByIslandSpecialty["JM|General Practice"][0];
  attending.id = ATTENDING_PROVIDER_ID;
  attending.full_name = "Dr. Marcia Fenwick";
  attending.facility_id = JM_CLINIC_ID;

  // ---- availability slots ----
  for (const p of t.providers) {
    for (let d = 1; d <= 6; d++) {
      for (let s = 0; s < 6; s++) {
        if (!chance(rng, 0.35)) continue;
        const startsAt = new Date();
        startsAt.setHours(0, 0, 0, 0);
        startsAt.setDate(startsAt.getDate() + d);
        startsAt.setHours(8 + s);
        t.availability_slots.push({
          id: uuid(rng),
          provider_id: p.id,
          starts_at: startsAt.toISOString(),
          minutes: p.specialty === "General Practice" ? 15 : 25,
          status: chance(rng, 0.45) ? "booked" : "open",
        });
      }
    }
  }

  // ---- patients ----
  for (const [code, n] of Object.entries(PATIENT_WEIGHTS)) {
    for (let k = 0; k < n; k++) {
      const parish = pick(rng, PARISHES[code]);
      // Haitian Kreyòl is its own language, not a dialect of the Lesser
      // Antillean Kwéyòl spoken in St. Lucia and Dominica. Nearly everyone in
      // Haiti speaks it; French is a minority written language. Treating them
      // as one bucket would mean routing a Haitian patient to a Kwéyòl speaker
      // and calling it a language match.
      const language =
        code === "HT"
          ? chance(rng, 0.94)
            ? "ht"
            : "fr"
          : ["DO", "CU"].includes(code)
            ? "es"
            : ["LC", "DM"].includes(code) && chance(rng, 0.5)
              ? "fr-cr"
              : code === "JM" && chance(rng, 0.45)
                ? "jam"
                : code === "TT" && chance(rng, 0.15)
                  ? "es"
                  : "en";
      const sex = chance(rng, 0.56) ? "F" : "M";
      const age = int(rng, 34, 79);
      t.patients.push({
        id: uuid(rng),
        ...identifiersFor(rng, code, age),
        full_name: nameFor(rng, code, sex),
        phone: `+1${int(rng, 200, 899)}${int(rng, 1000000, 9999999)}`,
        age,
        sex,
        island_code: code,
        parish,
        language,
        rural: chance(rng, 0.52),
        km_to_facility: int(rng, 2, 49),
        insurer: pick(rng, INSURERS),
        created_at: daysAgo(int(rng, 30, 500)),
      });
    }
  }
  // Hero patient — Marlene Campbell, referenced directly by id throughout the app.
  t.patients.push({
    id: HERO_PATIENT_ID,
    mrn: "JM-284016",
    date_of_birth: "1968-03-14",
    full_name: "Marlene Campbell",
    phone: "+18765550142",
    age: 58,
    sex: "F",
    island_code: "JM",
    parish: "St. Elizabeth",
    language: "jam",
    rural: true,
    km_to_facility: 38,
    insurer: "National Health Fund",
    created_at: daysAgo(700),
  });

  // ---- the deployment site ----
  // Trinidad and Tobago General is the hospital using the Grid day to day, so
  // its own catchment is modelled properly: a registered roster, a ward, clinic
  // lists and named care teams. Everyone else on the Grid arrives through a
  // referral or a clinic, and is deliberately thinner.
  const ttGeneralRoster = t.patients.filter((p) => p.island_code === "TT").slice(0, 220);
  const ttGeneralIds = new Set(ttGeneralRoster.map((p) => p.id as string));
  // The Jamaican community clinic is the other staffed site in the demo. It is
  // a clinic, not a hospital, so its roster is smaller and entirely outpatient —
  // but a chronic-care nurse with one patient on her list is not a clinic
  // either.
  const jmClinicRoster = t.patients.filter((p) => p.island_code === "JM").slice(0, 58);
  const jmClinicIds = new Set(jmClinicRoster.map((p) => p.id as string));

  // Home-monitoring history is expensive to carry and only meaningful where
  // someone actually opens the chart. The hospital's own patients get a full
  // three-day cadence; everyone else gets a weekly one, which still spans both
  // windows the risk score compares (0-14 days against 14-28) so nobody is
  // scored off a fallback value.
  const denseVitals = new Set<string>([...ttGeneralIds, ...jmClinicIds]);
  for (const p of t.patients) {
    if (!ttGeneralIds.has(p.id as string) && chance(rng, 0.12)) denseVitals.add(p.id as string);
  }

  // ---- conditions + medications ----
  for (const p of t.patients) {
    const isHero = p.id === HERO_PATIENT_ID;
    const conds = isHero
      ? ["Hypertension", "Type 2 Diabetes"]
      : CONDITION_PROB.filter(([, prob]) => chance(rng, prob)).map(([name]) => name);
    for (const name of conds) {
      const cond: Row = {
        id: uuid(rng),
        patient_id: p.id,
        name,
        diagnosed_on: isHero
          ? name === "Hypertension"
            ? dateDaysAgo(2900)
            : dateDaysAgo(1400)
          : dateDaysAgo(int(rng, 200, 2800)),
        facility_id:
          p.island_code === "JM"
            ? JM_HOSPITAL_ID
            : facilitiesByIsland[p.island_code as string]?.[0]?.id,
        sensitivity: "standard",
      };
      t.conditions.push(cond);
      const med = MED_FOR_COND[name];
      if (med && (isHero || chance(rng, 0.85))) {
        t.medications.push({
          id: uuid(rng),
          patient_id: p.id,
          name: isHero && name === "Type 2 Diabetes" ? "Metformin" : med.name,
          dosage: isHero && name === "Type 2 Diabetes" ? "500mg" : med.dose,
          frequency: isHero && name === "Type 2 Diabetes" ? "twice daily" : "daily",
          adherence_pct: isHero ? (name === "Hypertension" ? 48 : 62) : int(rng, 55, 100),
          last_refill_on: dateDaysAgo(
            isHero ? (name === "Hypertension" ? 47 : 31) : int(rng, 0, 40),
          ),
          days_supply_left: isHero
            ? name === "Hypertension"
              ? 0
              : 3
            : Math.max(0, int(rng, -2, 30)),
          facility_id:
            p.island_code === "JM"
              ? JM_CLINIC_ID
              : facilitiesByIsland[p.island_code as string]?.[0]?.id,
          sensitivity: "standard",
        });
      }
    }
  }

  // ---- vitals ----
  for (const p of t.patients) {
    if (p.id === HERO_PATIENT_ID) continue; // handled separately below with a deliberate worsening trend
    const dense = denseVitals.has(p.id as string);
    const span = dense ? 45 : 35;
    const step = dense ? 3 : 7;
    for (let d = 0; d <= span; d += step) {
      if (!chance(rng, 0.9)) continue;
      t.vitals.push({
        id: uuid(rng),
        patient_id: p.id,
        measured_at: daysAgo(d),
        systolic: 118 + int(rng, 0, 45) + Math.round(d * -0.06),
        diastolic: 74 + int(rng, 0, 23),
        glucose_mmol: Number((5.2 + rng() * 5.4).toFixed(1)),
        pulse: 66 + int(rng, 0, 29),
        weight_kg: Number((62 + rng() * 48).toFixed(1)),
        source: chance(rng, 0.82) ? "whatsapp" : "clinic",
        reported_by: "clinic",
      });
    }
  }
  // Marlene: 60 days of a steadily worsening trend, then 3 recent home readings.
  for (let d = 0; d <= 59; d++) {
    t.vitals.push({
      id: uuid(rng),
      patient_id: HERO_PATIENT_ID,
      measured_at: daysAgo(d),
      systolic: Math.round(196 - d * 0.75 + (rng() * 6 - 3)),
      diastolic: Math.round(104 - d * 0.25 + (rng() * 4 - 2)),
      glucose_mmol: Number((9.4 - d * 0.03 + rng() * 0.6).toFixed(1)),
      pulse: Math.round(84 + rng() * 10),
      weight_kg: 92.4,
      source: "whatsapp",
      facility_id: JM_CLINIC_ID,
      reported_by: "clinic",
    });
  }
  const heroHomeReadings: [number, number, number, number][] = [
    [6 / 24, 168, 104, 92],
    [3, 158, 98, 88],
    [6, 152, 96, 84],
  ];
  for (const [d, sys, dia, pulse] of heroHomeReadings) {
    t.vitals.push({
      id: uuid(rng),
      patient_id: HERO_PATIENT_ID,
      measured_at: daysAgo(d),
      systolic: sys,
      diastolic: dia,
      glucose_mmol: null,
      pulse,
      weight_kg: null,
      source: "home",
      reported_by: "patient",
      device: "Omron home cuff",
    });
  }

  // ---- risk scores (mirrors compute_risk()) ----
  const conditionsByPatient = new Map<string, Row[]>();
  for (const c of t.conditions)
    (
      conditionsByPatient.get(c.patient_id as string) ??
      conditionsByPatient.set(c.patient_id as string, []).get(c.patient_id as string)!
    ).push(c);
  const medsByPatient = new Map<string, Row[]>();
  for (const m of t.medications)
    (
      medsByPatient.get(m.patient_id as string) ??
      medsByPatient.set(m.patient_id as string, []).get(m.patient_id as string)!
    ).push(m);
  const vitalsByPatient = new Map<string, Row[]>();
  for (const v of t.vitals)
    (
      vitalsByPatient.get(v.patient_id as string) ??
      vitalsByPatient.set(v.patient_id as string, []).get(v.patient_id as string)!
    ).push(v);

  for (const p of t.patients) {
    const pid = p.id as string;
    const conds = conditionsByPatient.get(pid) ?? [];
    const meds = medsByPatient.get(pid) ?? [];
    const vitals = (vitalsByPatient.get(pid) ?? [])
      .slice()
      .sort(
        (a, b) =>
          new Date(b.measured_at as string).getTime() - new Date(a.measured_at as string).getTime(),
      );
    const recent = vitals.filter(
      (v) => new Date(v.measured_at as string).getTime() > nowMs() - 14 * 86400000,
    );
    const prevWindow = vitals.filter((v) => {
      const age = nowMs() - new Date(v.measured_at as string).getTime();
      return age > 14 * 86400000 && age <= 28 * 86400000;
    });
    const avg = (rows: Row[], key: string, fallback: number) => {
      const vals = rows.map((r) => r[key]).filter((v): v is number => typeof v === "number");
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : fallback;
    };
    const avgSys = avg(recent, "systolic", 120);
    const avgGlu = avg(recent, "glucose_mmol", 5.5);
    const prevSys = avg(prevWindow, "systolic", avgSys);
    const avgAdh = meds.length
      ? meds.reduce((a, m) => a + ((m.adherence_pct as number) ?? 100), 0) / meds.length
      : 100;
    const risk = computeRisk(
      rng,
      p.age as number,
      p.km_to_facility as number,
      conds.length,
      avgAdh,
      avgSys,
      avgGlu,
      prevSys,
    );
    t.risk_scores.push({
      id: uuid(rng),
      patient_id: pid,
      score: risk.score,
      band: risk.band,
      trend: risk.trend,
      drivers: risk.drivers,
      computed_at: daysAgo(0),
    });
  }

  // ---- referrals + consultations (completed cross-island history) ----
  const highRisk = t.risk_scores.filter(
    (r) => (r.score as number) > 45 && r.patient_id !== HERO_PATIENT_ID,
  );
  // Historical referral rates deliberately encode the real-world access gap:
  // a patient in Barbados has historically been far more likely to reach a
  // specialist than one in Haiti, at equal clinical risk. This is the baseline
  // the equity view is meant to expose — not a flattering starting point.
  const HISTORIC_ACCESS: Record<string, number> = {
    well_resourced: 0.44,
    middle: 0.33,
    clinician_rich: 0.28,
    under_resourced: 0.16,
  };
  for (const r of highRisk) {
    const rPatient = t.patients.find((p) => p.id === r.patient_id);
    const rIsland = ISLANDS.find((i) => i.code === rPatient?.island_code);
    if (!chance(rng, HISTORIC_ACCESS[rIsland?.tier ?? "middle"] ?? 0.33)) continue;
    const patient = t.patients.find((p) => p.id === r.patient_id)!;
    const specialty = pick(rng, ["Cardiology", "Endocrinology", "Nephrology"]);
    const candidates = t.providers.filter(
      (pr) => pr.specialty === specialty && pr.island_code !== patient.island_code,
    );
    if (!candidates.length) continue;
    const provider = pick(rng, candidates);
    const daysAgoCreated = int(rng, 0, 55);
    // Need reflects the patient's own country: no local capacity in that
    // specialty, a thin workforce, and out-of-pocket payment all raise it.
    const island = ISLANDS.find((i) => i.code === patient.island_code);
    const hasLocal = PROVIDER_MIX.some(
      (m) => m.island === patient.island_code && m.specialty === specialty,
    );
    let needScore = hasLocal ? int(rng, 5, 30) : 55;
    if (island?.tier === "under_resourced") needScore += 20;
    if (island?.tier === "clinician_rich") needScore -= 10;
    if (island?.payment === "out_of_pocket") needScore += 12;
    if (island?.connectivity === "poor") needScore += 6;
    needScore = Math.max(0, Math.min(100, needScore));

    // A dataset of nothing but finished referrals has no queue to monitor, and
    // module 06 of the brief asks for exactly that. So a slice of the recent
    // ones are still in flight: routed and waiting for a slot, or scheduled
    // and not yet held. High need is routed faster, which is the promise the
    // engine makes — the queue view exists to show when it is not kept.
    const lifecycle: "routed" | "scheduled" | "completed" =
      daysAgoCreated <= 24 && chance(rng, needScore >= 40 ? 0.42 : 0.6)
        ? chance(rng, 0.5)
          ? "routed"
          : "scheduled"
        : "completed";

    const referral: Row = {
      id: uuid(rng),
      patient_id: patient.id,
      triage_event_id: null,
      to_provider_id: provider.id,
      specialty,
      status: lifecycle,
      cross_island: true,
      reason: hasLocal
        ? `Capacity-aware routing: no local ${specialty} slot within the clinical window`
        : `No ${specialty} capacity in ${patient.island_code} — routed on need`,
      // No local clinician means the realistic local alternative is the next
      // visiting-specialist mission, not "never" — bounded so it can be
      // reasoned about arithmetically instead of poisoning every average.
      wait_days_local: hasLocal ? int(rng, 28, 61) : int(rng, 150, 210),
      wait_days_routed: int(rng, 1, 6),
      retained_value_usd: int(rng, 2400, 11600),
      need_score: needScore,
      prioritised_on_need: needScore >= 40,
      patient_island: patient.island_code,
      created_at: daysAgo(daysAgoCreated),
    };
    t.referrals.push(referral);
    // A routed referral has no appointment yet — that is what makes it a queue.
    if (lifecycle === "routed") continue;
    t.consultations.push({
      id: uuid(rng),
      referral_id: referral.id,
      patient_id: patient.id,
      provider_id: provider.id,
      facility_id: provider.facility_id,
      scheduled_at:
        lifecycle === "scheduled"
          ? daysAhead(int(rng, 1, 16) * 0.6)
          : daysAgo(daysAgoCreated - 3 < 0 ? 0 : daysAgoCreated - 3),
      kind: "teleconsult",
      status: lifecycle === "scheduled" ? "scheduled" : "completed",
      notes:
        lifecycle === "scheduled"
          ? "Cross-island teleconsult booked, awaiting the appointment."
          : "Teleconsult completed via CariCare Grid.",
      plan:
        lifecycle === "scheduled"
          ? ""
          : "Continue titration, remote monitoring cadence increased to daily.",
      sensitivity: "standard",
      created_at: daysAgo(daysAgoCreated),
    });
  }

  // ---- stock + alerts ----
  for (const f of t.facilities) {
    for (const name of STOCK_MEDS) {
      const cover = int(rng, 2, 49);
      const status = cover < 7 ? "critical" : cover < 18 ? "low" : "ok";
      t.stock_items.push({
        id: uuid(rng),
        facility_id: f.id,
        medication_name: name,
        on_hand: int(rng, 0, 899),
        days_cover: cover,
        status,
      });
      if (status !== "ok") {
        t.alerts.push({
          id: uuid(rng),
          kind: "supply",
          severity: status === "critical" ? "high" : "medium",
          island_code: f.island_code,
          patient_id: null,
          title: `${name} shortage at ${f.name}`,
          detail: `${cover} days of cover remaining.`,
          resolved: false,
          created_at: daysAgo(int(rng, 0, 20)),
        });
      }
    }
  }

  // ---- treating window policies (static reference table) ----
  t.treating_window_policies = [
    {
      facility_kind: "emergency",
      label: "ED / A&E",
      days: 7,
      rationale: "Short handover and re-presentation window",
    },
    {
      facility_kind: "hospital",
      label: "Acute inpatient hospital",
      days: 30,
      rationale: "Discharge summary, readmission and complications",
    },
    {
      facility_kind: "specialist",
      label: "Outpatient / specialist clinic",
      days: 90,
      rationale: "Standard follow-up cycle",
    },
    {
      facility_kind: "clinic",
      label: "Primary care / community clinic",
      days: 365,
      rationale: "Continuous longitudinal relationship",
    },
    { facility_kind: "pharmacy", label: "Pharmacy", days: 30, rationale: "Refill window" },
    { facility_kind: "lab", label: "Lab / imaging", days: 14, rationale: "Result review window" },
  ];

  // ---- data sharing agreements (fixed, matches the app's referenced facilities) ----
  t.data_sharing_agreements = [
    {
      id: uuid(rng),
      reference: "DSA-JM-TT-2026-001",
      from_facility_id: JM_CLINIC_ID,
      to_facility_id: TT_HOSPITAL_ID,
      purpose:
        "Standing cardiology and endocrinology referral pipeline (Kingston community clinic to Trinidad General)",
      scope: [
        "demographics",
        "vitals",
        "conditions",
        "medications",
        "referrals",
        "encounter summaries",
      ],
      status: "active",
      executed_on: dateDaysAgo(120),
      expires_at: dateDaysAhead(490),
      review_due_on: dateDaysAhead(130),
      patient_opt_out_allowed: true,
      created_at: daysAgo(120),
    },
    {
      id: uuid(rng),
      reference: "DSA-JM-TT-2026-004",
      from_facility_id: JM_HOSPITAL_ID,
      to_facility_id: TT_HOSPITAL_ID,
      purpose: "Tertiary escalation and inpatient transfer pathway",
      scope: ["demographics", "vitals", "conditions", "medications", "encounter summaries", "labs"],
      status: "active",
      executed_on: dateDaysAgo(60),
      expires_at: dateDaysAhead(540),
      review_due_on: dateDaysAhead(180),
      patient_opt_out_allowed: true,
      created_at: daysAgo(60),
    },
    {
      id: uuid(rng),
      reference: "DSA-JM-AG-2025-011",
      from_facility_id: JM_CLINIC_ID,
      to_facility_id: AG_CLINIC_ID,
      purpose: "Diaspora continuity of care for seasonal workers",
      scope: ["demographics", "medications", "conditions"],
      status: "expiring",
      executed_on: dateDaysAgo(700),
      expires_at: dateDaysAhead(20),
      review_due_on: dateDaysAgo(5),
      patient_opt_out_allowed: true,
      created_at: daysAgo(700),
    },
  ];

  // ---- sensitive grants (one illustrative pending example) ----
  const cardiologyTT = t.providers.find(
    (p) => p.island_code === "TT" && p.specialty === "Cardiology",
  )!;
  // The demo clinician profile points at this provider row, so they are the same
  // person and must carry the same name. They did not: the console showed
  // referrals routed to "Dr. Cheryl Boyce" while the user was signed in as
  // Dr. Anand Rampersad. Harmless while no referral was ever visible; wrong the
  // moment one is.
  cardiologyTT.full_name = DEMO_ACCOUNTS.clinician.name;
  // ...and at the hospital his profile says he works at. The generator had put
  // him at whichever TT facility came first, so his own appointments listed a
  // district hospital he has no staff row for.
  cardiologyTT.facility_id = TT_HOSPITAL_ID;
  t.sensitive_grants = [
    {
      id: uuid(rng),
      patient_id: HERO_PATIENT_ID,
      category: "mental_health",
      provider_id: cardiologyTT.id,
      facility_id: TT_HOSPITAL_ID,
      status: "pending",
      purpose: "Cross-island teleconsult review of full chart, including sensitive history",
      granted_at: null,
      expires_at: null,
      created_at: daysAgo(2),
    },
  ];

  // A sensitive entry the consent model can gate on. It must be a genuinely
  // sensitive diagnosis of its own — an earlier version re-tagged Marlene's
  // oldest chronic condition instead, which labelled her hypertension as
  // mental-health data and then hid it from clinicians who needed it. That
  // both misrepresents the category and corrupts any downstream reasoning
  // about which specialty she should be referred to.
  const heroSensitive: Row = {
    id: uuid(rng),
    patient_id: HERO_PATIENT_ID,
    name: "Depression",
    diagnosed_on: dateDaysAgo(600),
    facility_id: JM_CLINIC_ID,
    sensitivity: "mental_health",
  };
  t.conditions.push(heroSensitive);
  (conditionsByPatient.get(HERO_PATIENT_ID) ?? []).push(heroSensitive);

  // ---- care team + break-glass (fixed, hero patient) ----
  t.care_team_members = [
    {
      id: uuid(rng),
      patient_id: HERO_PATIENT_ID,
      facility_id: JM_CLINIC_ID,
      provider_id: ATTENDING_PROVIDER_ID,
      user_id: null,
      tier: "attending",
      encounter_id: null,
      active_from: daysAgo(200),
      active_until: null,
      created_at: daysAgo(200),
    },
    {
      id: uuid(rng),
      patient_id: HERO_PATIENT_ID,
      facility_id: JM_CLINIC_ID,
      provider_id: null,
      user_id: null,
      tier: "nursing",
      encounter_id: null,
      active_from: daysAgo(200),
      active_until: null,
      created_at: daysAgo(200),
    },
    {
      id: uuid(rng),
      patient_id: HERO_PATIENT_ID,
      facility_id: TT_HOSPITAL_ID,
      provider_id: cardiologyTT.id,
      user_id: null,
      tier: "consulting",
      encounter_id: null,
      active_from: daysAgo(20),
      active_until: null,
      created_at: daysAgo(20),
    },
  ];
  t.break_glass_events = [
    {
      id: uuid(rng),
      patient_id: HERO_PATIENT_ID,
      facility_id: JM_HOSPITAL_ID,
      provider_id: null,
      user_id: null,
      actor_name: "Dr. Simone Baptiste",
      actor_tier: "attending",
      reason:
        "Unresponsive on arrival to A&E; medication and allergy history required immediately.",
      started_at: daysAgo(9),
      expires_at: daysAgo(8),
      patient_notified_at: daysAgo(9),
      review_status: "cleared",
      reviewed_at: daysAgo(8),
      reviewer_note: "",
    },
  ];

  // ---- encounters (backfilled from consultations + hero-specific story) ----
  for (const c of t.consultations) {
    t.encounters.push({
      id: uuid(rng),
      patient_id: c.patient_id,
      facility_id: c.facility_id,
      provider_id: c.provider_id,
      consultation_id: c.id,
      kind: "clinic_visit",
      reason: "Chronic care visit",
      summary: c.plan,
      status: "closed",
      started_at: c.scheduled_at,
      ended_at: new Date(new Date(c.scheduled_at as string).getTime() + 35 * 60000).toISOString(),
      created_at: c.created_at,
      sensitivity: "standard",
    });
  }
  t.encounters.push(
    {
      id: uuid(rng),
      patient_id: HERO_PATIENT_ID,
      facility_id: JM_CLINIC_ID,
      provider_id: null,
      consultation_id: null,
      kind: "clinic_visit",
      reason: "Walk-in: headaches and blurred vision",
      summary:
        "BP 168/104 at the clinic. Started on amlodipine, referred into the Grid for cardiology.",
      status: "closed",
      started_at: daysAgo(21),
      ended_at: new Date(nowMs() - 21 * 86400000 + 40 * 60000).toISOString(),
      created_at: daysAgo(21),
      sensitivity: "standard",
    },
    {
      id: uuid(rng),
      patient_id: HERO_PATIENT_ID,
      facility_id: JM_HOSPITAL_ID,
      provider_id: null,
      consultation_id: null,
      kind: "emergency",
      reason: "A&E presentation: chest tightness",
      summary:
        "ECG normal sinus rhythm, troponin negative. Observed 6 hours, discharged with cardiology follow-up.",
      status: "closed",
      started_at: daysAgo(9),
      ended_at: new Date(nowMs() - 9 * 86400000 + 6 * 3600000).toISOString(),
      created_at: daysAgo(9),
      sensitivity: "standard",
    },
    {
      id: uuid(rng),
      patient_id: HERO_PATIENT_ID,
      facility_id: TT_HOSPITAL_ID,
      provider_id: null,
      consultation_id: null,
      kind: "teleconsult",
      reason: "Cross-island cardiology teleconsult",
      summary: "",
      status: "open",
      started_at: daysAhead(1),
      ended_at: null,
      created_at: daysAgo(0),
      sensitivity: "standard",
    },
  );

  // ---- Trinidad and Tobago General: a hospital in the middle of its day ----
  // Everything above describes a region. This describes one hospital actually
  // running on the Grid — who is on the ward right now, who is in clinic today,
  // and which consultant carries which patient. Without it the deployment site
  // looked like a pilot with three patients on it, because a clinician's panel
  // is built from care-team rows and episodes, not from the patient table.
  const ttProviders = t.providers.filter((pr) => pr.facility_id === TT_HOSPITAL_ID);
  const ttOtherProviders = ttProviders.filter((pr) => pr.id !== cardiologyTT.id);
  const wardCohort = ttGeneralRoster.slice(0, 54);
  const clinicCohort = ttGeneralRoster.slice(54, 150);
  const dischargedCohort = ttGeneralRoster.slice(150);

  // On the ward now: open episodes, no discharge date.
  for (const [i, patient] of wardCohort.entries()) {
    const emergency = i % 5 === 0;
    const admittedDaysAgo = int(rng, 0, 11);
    t.encounters.push({
      id: uuid(rng),
      patient_id: patient.id,
      facility_id: TT_HOSPITAL_ID,
      provider_id: pick(rng, ttProviders).id,
      consultation_id: null,
      kind: emergency ? "emergency" : "admission",
      reason: emergency
        ? pick(rng, [
            "A&E: chest pain, rule out acute coronary syndrome",
            "A&E: hypertensive urgency, systolic above 200",
            "A&E: hypoglycaemic episode at home",
            "A&E: breathlessness on exertion, suspected fluid overload",
          ])
        : pick(rng, [
            "Decompensated heart failure — IV diuresis",
            "Poorly controlled type 2 diabetes — insulin stabilisation",
            "Hypertensive emergency — inpatient titration",
            "Diabetic foot infection — IV antibiotics",
            "Chronic kidney disease, stage 4 — fluid and electrolyte management",
          ]),
      summary: "",
      status: "open",
      started_at: daysAgo(admittedDaysAgo),
      ended_at: null,
      created_at: daysAgo(admittedDaysAgo),
      sensitivity: "standard",
    });
  }

  // In clinic: mostly closed visits over the last quarter, a handful running now.
  for (const patient of clinicCohort) {
    const visits = int(rng, 1, 3);
    for (let v = 0; v < visits; v++) {
      const startedDaysAgo = int(rng, 0, 88);
      const runningNow = startedDaysAgo === 0 && chance(rng, 0.5);
      t.encounters.push({
        id: uuid(rng),
        patient_id: patient.id,
        facility_id: TT_HOSPITAL_ID,
        provider_id: pick(rng, ttProviders).id,
        consultation_id: null,
        kind: "clinic_visit",
        reason: pick(rng, [
          "Cardiology outpatient review",
          "Diabetes clinic — quarterly review",
          "Hypertension follow-up and medication titration",
          "Renal clinic — eGFR trend review",
          "Post-discharge review",
        ]),
        summary: runningNow ? "" : "Reviewed, medication adjusted, follow-up arranged.",
        status: runningNow ? "open" : "closed",
        started_at: daysAgo(startedDaysAgo),
        ended_at: runningNow
          ? null
          : new Date(nowMs() - startedDaysAgo * 86400000 + 30 * 60000).toISOString(),
        created_at: daysAgo(startedDaysAgo),
        sensitivity: "standard",
      });
    }
  }

  // Today's clinic list. Leaving "in clinic now" to a random draw over a 90-day
  // window produced one or two patients, which is not what a hospital looks
  // like at eleven in the morning.
  for (const patient of clinicCohort.slice(0, 22)) {
    const startedHoursAgo = int(rng, 0, 5);
    t.encounters.push({
      id: uuid(rng),
      patient_id: patient.id,
      facility_id: TT_HOSPITAL_ID,
      provider_id: pick(rng, ttProviders).id,
      consultation_id: null,
      kind: "clinic_visit",
      reason: pick(rng, [
        "Cardiology clinic — today's list",
        "Diabetes clinic — today's list",
        "Hypertension clinic — today's list",
        "Renal clinic — today's list",
      ]),
      summary: "",
      status: "open",
      started_at: new Date(nowMs() - startedHoursAgo * 3600000).toISOString(),
      ended_at: null,
      created_at: new Date(nowMs() - startedHoursAgo * 3600000).toISOString(),
      sensitivity: "standard",
    });
  }

  // Discharged, but inside the 30-day hospital window, so the record is still
  // lawfully open to the team that treated them.
  for (const patient of dischargedCohort) {
    const endedDaysAgo = int(rng, 1, 26);
    t.encounters.push({
      id: uuid(rng),
      patient_id: patient.id,
      facility_id: TT_HOSPITAL_ID,
      provider_id: pick(rng, ttProviders).id,
      consultation_id: null,
      kind: "admission",
      reason: "Inpatient episode — chronic disease stabilisation",
      summary: "Discharged on adjusted regimen with community follow-up.",
      status: "closed",
      started_at: daysAgo(endedDaysAgo + int(rng, 2, 8)),
      ended_at: daysAgo(endedDaysAgo),
      created_at: daysAgo(endedDaysAgo + 8),
      sensitivity: "standard",
    });
  }

  // Care teams. Membership is explicit — spec §4 is clear that employment at a
  // facility is not membership — so every roster patient gets a named attending
  // and a facility-level nursing team, and the cardiology caseload is carried by
  // the consultant the demo signs in as.
  const cardiologyCaseload = ttGeneralRoster.filter((_, i) => i % 5 < 2).slice(0, 62);
  const cardiologyIds = new Set(cardiologyCaseload.map((pt) => pt.id as string));
  for (const patient of ttGeneralRoster) {
    const onCardiology = cardiologyIds.has(patient.id as string);
    t.care_team_members.push({
      id: uuid(rng),
      patient_id: patient.id,
      facility_id: TT_HOSPITAL_ID,
      provider_id: onCardiology ? cardiologyTT.id : pick(rng, ttOtherProviders).id,
      user_id: null,
      tier: "attending",
      encounter_id: null,
      active_from: daysAgo(int(rng, 20, 400)),
      active_until: null,
      created_at: daysAgo(int(rng, 20, 400)),
    });
    t.care_team_members.push({
      id: uuid(rng),
      patient_id: patient.id,
      facility_id: TT_HOSPITAL_ID,
      provider_id: null,
      user_id: null,
      tier: "nursing",
      encounter_id: null,
      active_from: daysAgo(int(rng, 1, 60)),
      active_until: null,
      created_at: daysAgo(int(rng, 1, 60)),
    });
  }

  // Jamaica Community Clinic: rolling outpatient chronic-disease care. A primary
  // care facility carries a 365-day treating window, so these episodes keep the
  // clinic's own nursing team lawfully on the record between visits.
  const jmAttending = t.providers.find((pr) => pr.id === ATTENDING_PROVIDER_ID);
  for (const patient of jmClinicRoster) {
    const visits = int(rng, 1, 4);
    for (let v = 0; v < visits; v++) {
      const startedDaysAgo = int(rng, 0, 300);
      t.encounters.push({
        id: uuid(rng),
        patient_id: patient.id,
        facility_id: JM_CLINIC_ID,
        provider_id: ATTENDING_PROVIDER_ID,
        consultation_id: null,
        kind: "clinic_visit",
        reason: pick(rng, [
          "Chronic disease check — blood pressure and glucose",
          "Medication refill and adherence review",
          "Nurse-led hypertension review",
          "Diabetes foot check",
          "Home-reading review from the care line",
        ]),
        summary: "Readings reviewed, refill issued, next check scheduled.",
        status: "closed",
        started_at: daysAgo(startedDaysAgo),
        ended_at: new Date(nowMs() - startedDaysAgo * 86400000 + 25 * 60000).toISOString(),
        created_at: daysAgo(startedDaysAgo),
        sensitivity: "standard",
      });
    }
    t.care_team_members.push(
      {
        id: uuid(rng),
        patient_id: patient.id,
        facility_id: JM_CLINIC_ID,
        provider_id: jmAttending ? ATTENDING_PROVIDER_ID : null,
        user_id: null,
        tier: "attending",
        encounter_id: null,
        active_from: daysAgo(int(rng, 30, 500)),
        active_until: null,
        created_at: daysAgo(int(rng, 30, 500)),
      },
      {
        id: uuid(rng),
        patient_id: patient.id,
        facility_id: JM_CLINIC_ID,
        provider_id: null,
        user_id: null,
        tier: "nursing",
        encounter_id: null,
        active_from: daysAgo(int(rng, 5, 200)),
        active_until: null,
        created_at: daysAgo(int(rng, 5, 200)),
      },
    );
  }

  // Beds occupied should agree with the ward rather than being an unrelated
  // number sitting next to a list of admitted patients.
  const ttFacility = t.facilities.find((f) => f.id === TT_HOSPITAL_ID);
  if (ttFacility) {
    // Occupancy should agree with the ward list sitting next to it: the modelled
    // admissions plus the surgical, maternity and paediatric beds the Grid does
    // not track.
    const untracked = Math.round((ttFacility["beds_total"] as number) * 0.62);
    ttFacility["beds_occupied"] = Math.min(
      ttFacility["beds_total"] as number,
      wardCohort.length + untracked,
    );
  }

  // ---- hero patient: triage event, consent grants, access log, messages ----
  const heroTriageId = uuid(rng);
  t.triage_events.push({
    id: heroTriageId,
    patient_id: HERO_PATIENT_ID,
    message_id: null,
    severity: "urgent",
    category: "Hypertensive crisis risk",
    recommended_level: "specialist",
    rationale:
      "Home reading 168/104 with headache and blurred vision, 26 mmHg above her 30-day baseline.",
    red_flags: ["Systolic 168 mmHg", "Symptomatic presentation"],
    confidence: 0.82,
    created_at: daysAgo(0.25),
  });
  const heroGrant: Row = {
    id: uuid(rng),
    patient_id: HERO_PATIENT_ID,
    provider_id: cardiologyTT.id,
    scope: ["vitals", "medications", "conditions"],
    purpose: "teleconsult",
    status: "active",
    granted_at: daysAgo(0.2),
    expires_at: daysAhead(30),
    created_at: daysAgo(0.25),
  };
  t.consent_grants.push(heroGrant);
  t.consent_access_log.push({
    id: uuid(rng),
    patient_id: HERO_PATIENT_ID,
    provider_id: cardiologyTT.id,
    grant_id: heroGrant.id,
    resource: "vitals",
    allowed: true,
    accessed_at: daysAgo(0.15),
    basis: "consent",
    tier: "attending",
    facility_id: TT_HOSPITAL_ID,
    sensitive_category: null,
    actor_name: cardiologyTT.full_name,
    break_glass_id: null,
  });
  // ---- referrals waiting on the demo cardiologist -------------------------
  // Every historical referral seeded above closes as `completed`, which left a
  // consultant's inbox structurally empty: the home surface filters referrals
  // for status !== completed, so "Referrals routed to me" could only ever read
  // 0 and the average-local-wait-bypassed tile beside it could only ever read
  // "—". The routing engine's whole output is a queue on a specialist's desk.
  //
  // `routed` is the pre-acceptance state: visible to the clinician, but under
  // the access model it opens no record until they accept it.
  const routedReferral = (
    patient: Row,
    opts: {
      reason: string;
      waitLocal: number;
      waitRouted: number;
      need: number;
      retained: number;
      ageDays: number;
      triageId?: string;
    },
  ): Row => ({
    id: uuid(rng),
    patient_id: patient.id,
    triage_event_id: opts.triageId ?? null,
    to_provider_id: cardiologyTT.id,
    specialty: "Cardiology",
    status: "routed",
    cross_island: patient.island_code !== "TT",
    reason: opts.reason,
    wait_days_local: opts.waitLocal,
    wait_days_routed: opts.waitRouted,
    retained_value_usd: opts.retained,
    need_score: opts.need,
    prioritised_on_need: opts.need >= 40,
    patient_island: patient.island_code,
    created_at: daysAgo(opts.ageDays),
  });

  const heroPatient = t.patients.find((p) => p.id === HERO_PATIENT_ID)!;
  t.referrals.push(
    routedReferral(heroPatient, {
      reason:
        "Hypertensive crisis pattern on the 60-day trend; no cardiology slot in JM inside the clinical window",
      waitLocal: 42,
      waitRouted: 1,
      need: 78,
      retained: 8400,
      ageDays: 0.2,
      triageId: heroTriageId,
    }),
  );

  // Three more, so the queue reads as a regional allocation problem rather than
  // one hero patient.
  const seenPending = new Set<string>([HERO_PATIENT_ID]);
  const pendingCandidates: Row[] = [];
  for (const r of [...(t.risk_scores ?? [])].sort(
    (a, b) => (b.score as number) - (a.score as number),
  )) {
    if (pendingCandidates.length >= 3) break;
    if (seenPending.has(r.patient_id as string)) continue;
    const p = t.patients.find((x) => x.id === r.patient_id);
    if (!p || p.island_code === "TT") continue;
    seenPending.add(p.id as string);
    pendingCandidates.push(p);
  }
  for (const [i, p] of pendingCandidates.entries()) {
    const island = ISLANDS.find((isl) => isl.code === p.island_code);
    const scarce = island?.tier === "under_resourced";
    t.referrals.push(
      routedReferral(p, {
        reason: scarce
          ? `No cardiology capacity in ${p.island_code} — routed on need`
          : "Capacity-aware routing: next local cardiology slot falls outside the clinical window",
        waitLocal: scarce ? 168 : 39,
        waitRouted: 2 + i,
        need: scarce ? 71 : 46,
        retained: 3200 + i * 1900,
        ageDays: 0.5 + i,
      }),
    );
  }

  t.messages.push(
    {
      id: uuid(rng),
      patient_id: HERO_PATIENT_ID,
      direction: "in",
      body: "Mi head a hurt mi bad and mi nuh see clear. Mi pressure high?",
      kind: "text",
      language: "jam",
      channel: "whatsapp",
      queued_offline: false,
      delivered_at: daysAgo(0.26),
      created_at: daysAgo(0.26),
    },
    {
      id: uuid(rng),
      patient_id: HERO_PATIENT_ID,
      direction: "out",
      body: "Thank you for the message. We have your readings and a care team member is reviewing them now. Please rest, drink water, and do not take any extra tablets until we come back to you.\n\nWould you like to speak to someone now?",
      // Outbound messages can carry WhatsApp interactive buttons. The care line
      // is the front door for people whose only assumption is WhatsApp, so
      // tapping a button has to be a first-class way in — including the one
      // that puts them on a call.
      actions: [
        { label: "Call the care line", action: "call" },
        { label: "Mi cyaan talk now", action: "reply" },
        { label: "Mi feel worse", action: "reply" },
      ],
      kind: "text",
      language: "jam",
      channel: "whatsapp",
      queued_offline: false,
      delivered_at: daysAgo(0.25),
      created_at: daysAgo(0.25),
    },
  );

  // ---- the appointment book ----
  // Every seeded consultation until now was completed and in the past, so a
  // schedule would have opened on an empty week. Module 01 of the brief asks
  // for capacity-aware scheduling, and the demo thread turns on a booked
  // cross-island teleconsult, so the clinicians who carry the demo need a
  // diary with something in it.
  const bookableSlots = t.availability_slots
    .filter((sl) => sl["status"] === "open")
    .slice()
    .sort((a, b) => (a["starts_at"] as string).localeCompare(b["starts_at"] as string));

  const bookFor = (
    patient: Row,
    provider: Row,
    kind: string,
    status: string,
    startsAt: string,
    reason: string,
  ) => {
    t.consultations.push({
      id: uuid(rng),
      referral_id: null,
      patient_id: patient.id,
      provider_id: provider.id,
      facility_id: provider.facility_id,
      scheduled_at: startsAt,
      kind,
      status,
      notes: reason,
      plan: "",
      sensitivity: "standard",
      created_at: daysAgo(int(rng, 1, 20)),
    });
  };

  // The demo consultant's diary: cross-island teleconsults for patients routed
  // to him, plus clinic appointments for his own hospital's cohort.
  const ttUpcoming = ttGeneralRoster.slice(0, 9);
  for (const [i, patient] of ttUpcoming.entries()) {
    const slot = bookableSlots.find((sl) => sl.provider_id === cardiologyTT.id);
    const startsAt = slot ? (slot["starts_at"] as string) : daysAhead(1 + i * 0.4 + (i % 3) * 0.15);
    if (slot) slot["status"] = "booked";
    bookFor(
      patient,
      cardiologyTT,
      i % 3 === 0 ? "teleconsult" : "in_person",
      "scheduled",
      startsAt,
      i % 3 === 0
        ? "Cross-island cardiology teleconsult"
        : "Cardiology clinic — blood pressure review",
    );
  }

  // A couple already done this week, so "past" is not empty either.
  for (const [i, patient] of ttGeneralRoster.slice(9, 13).entries()) {
    bookFor(
      patient,
      cardiologyTT,
      "teleconsult",
      "completed",
      daysAgo(1 + i),
      "Teleconsult completed — titration reviewed",
    );
  }

  // The community clinic nurse's list, so the second staffed persona has one too.
  const jmAttendingProvider = t.providers.find((pr) => pr.id === ATTENDING_PROVIDER_ID);
  if (jmAttendingProvider) {
    for (const [i, patient] of jmClinicRoster.slice(0, 7).entries()) {
      bookFor(
        patient,
        jmAttendingProvider,
        i % 4 === 0 ? "teleconsult" : "in_person",
        "scheduled",
        daysAhead(0.2 + i * 0.5),
        i % 4 === 0 ? "Follow-up teleconsult" : "Chronic care clinic — refill and review",
      );
    }
  }

  // Marlene's is the one the demo thread produces: booked, cross-island, soon.
  bookFor(
    heroPatient,
    cardiologyTT,
    "teleconsult",
    "scheduled",
    daysAhead(1),
    "Cross-island cardiology teleconsult — hypertensive crisis pattern",
  );

  // Consults happening right now. Without these the queue monitor's "in progress"
  // column is permanently zero, which reads as a broken panel rather than a quiet
  // afternoon — and a regional view whose whole point is live load should show
  // load. Started within the hour, so they are genuinely in session.
  const liveNowProviders = (t["providers"] ?? [])
    .filter((pr) => pr["specialty"] === "Cardiology" || pr["specialty"] === "Endocrinology")
    .slice(0, 6);
  for (const pr of liveNowProviders) {
    if (!chance(rng, 0.55)) continue;
    const candidate = (t["patients"] ?? []).find(
      (p) => p["island_code"] !== pr["island_code"] && p["id"] !== HERO_PATIENT_ID,
    );
    if (!candidate) continue;
    bookFor(
      candidate,
      pr,
      "teleconsult",
      "in_progress",
      minutesAgo(int(rng, 4, 38)),
      `${String(pr["specialty"])} teleconsult in session`,
    );
  }

  // ---- care-line conversations ----
  // The care line is the product's front door, and exactly one patient had ever
  // sent a message — which made a clinician's inbox a list of one. Threads are
  // written in the patient's own language, because a Kreyòl speaker messaging in
  // Patois would give away that the language field is decoration.
  const LINE_IN: Record<string, string[]> = {
    en: [
      "Good morning, my pressure was 152 over 94 today.",
      "I finished my tablets last week and the pharmacy had none.",
      "Sugar was 12.4 after lunch. Is that too high?",
      "I feel dizzy when I stand up quickly.",
      "Can I get a refill for the metformin please?",
      "My ankles are swelling again in the evenings.",
    ],
    jam: [
      "Mi pressure read 148 over 92 dis mawnin.",
      "Mi tablet dem done and di clinic neva have none.",
      "Mi sugar test seh 11.8 after lunch.",
      "Mi feel dizzy when mi stan up too quick.",
      "Mi foot dem a swell up inna di evening.",
    ],
    ht: [
      "Bonjou, tansyon mwen se 154 sou 96 maten an.",
      "Mwen fini ak grenn yo, famasi a pa genyen.",
      "Sik mwen te 12.1 apre mwen manje.",
      "Mwen santi tèt mwen vire lè mwen kanpe.",
      "Pye m ap anfle chak aswè.",
    ],
    es: [
      "Buenos días, mi presión fue 150 sobre 95 esta mañana.",
      "Se me acabaron las pastillas y en la farmacia no había.",
      "El azúcar salió en 12.6 después de comer.",
      "Me siento mareada al levantarme.",
      "Se me hinchan los tobillos por las noches.",
    ],
  };
  const LINE_OUT: Record<string, string[]> = {
    en: [
      "Thank you. A nurse is reviewing that reading today — keep taking your tablets as normal.",
      "We have requested your refill at your clinic. You should hear from them today.",
      "Noted. Please rest, drink water, and message us again if it gets worse.",
    ],
    jam: [
      "Thank you. A nurse a look pon di reading today — keep tek yuh tablet same way.",
      "Wi request di refill at yuh clinic. Dem should call yuh today.",
      "Wi get it. Res up, drink water, and message wi back if it get worse.",
    ],
    ht: [
      "Mèsi. Yon enfimyè ap gade lekti a jodi a — kontinye pran grenn ou yo.",
      "Nou mande renouvèlman an nan klinik ou a. Y ap rele w jodi a.",
      "Nou note sa. Repoze w, bwè dlo, epi ekri nou si li vin pi mal.",
    ],
    es: [
      "Gracias. Una enfermera revisará esa lectura hoy — siga tomando sus pastillas.",
      "Hemos pedido su reposición en la clínica. Deberían llamarle hoy.",
      "Anotado. Descanse, tome agua y escríbanos si empeora.",
    ],
  };
  const CALL_LABEL: Record<string, string[]> = {
    en: ["Call the care line", "Speak to a nurse now"],
    jam: ["Call di care line", "Talk to a nurse now"],
    ht: ["Rele liy swen an", "Pale ak yon enfimyè"],
    es: ["Llamar a la línea de salud", "Hablar con una enfermera"],
  };
  const LATER_LABEL: Record<string, string[]> = {
    en: ["Not right now", "I am okay for now"],
    jam: ["Nuh right now", "Mi awright fi now"],
    ht: ["Pa kounye a", "Mwen byen pou kounye a"],
    es: ["Ahora no", "Estoy bien por ahora"],
  };
  const lineFor = (pool: Record<string, string[]>, language: string) =>
    pool[language] ?? pool["en"]!;

  const conversationPatients = [
    ...ttGeneralRoster.slice(0, 30),
    ...jmClinicRoster.slice(0, 16),
    ...t.patients
      .filter((p) => !ttGeneralIds.has(p.id as string) && !jmClinicIds.has(p.id as string))
      .slice(0, 10),
  ].filter((p) => p.id !== HERO_PATIENT_ID);

  for (const patient of conversationPatients) {
    const language = patient["language"] as string;
    const openedDaysAgo = rng() * 13;
    const inBody = pick(rng, lineFor(LINE_IN, language));
    t.messages.push({
      id: uuid(rng),
      patient_id: patient.id,
      direction: "in",
      body: inBody,
      kind: chance(rng, 0.12) ? "voice" : "text",
      language,
      channel: "whatsapp",
      queued_offline: chance(rng, 0.08),
      delivered_at: daysAgo(openedDaysAgo),
      created_at: daysAgo(openedDaysAgo),
    });

    // Roughly a third of threads are still waiting on the clinic. Those are the
    // ones an inbox exists to surface, so they are not a rounding error.
    if (chance(rng, 0.66)) {
      const repliedDaysAgo = Math.max(0, openedDaysAgo - (0.02 + rng() * 0.3));
      t.messages.push({
        id: uuid(rng),
        patient_id: patient.id,
        direction: "out",
        body: pick(rng, lineFor(LINE_OUT, language)),
        kind: "text",
        language,
        channel: "whatsapp",
        queued_offline: false,
        // Not every reply offers buttons — a line that always did would read as
        // a menu tree rather than a conversation.
        actions: chance(rng, 0.45)
          ? [
              { label: pick(rng, lineFor(CALL_LABEL, language)), action: "call" },
              { label: pick(rng, lineFor(LATER_LABEL, language)), action: "reply" },
            ]
          : null,
        delivered_at: daysAgo(repliedDaysAgo),
        created_at: daysAgo(repliedDaysAgo),
      });
      // Some come back with a follow-up, which puts them back in the queue.
      if (chance(rng, 0.3)) {
        const followUpDaysAgo = Math.max(0, repliedDaysAgo - (0.01 + rng() * 0.2));
        t.messages.push({
          id: uuid(rng),
          patient_id: patient.id,
          direction: "in",
          body: pick(rng, lineFor(LINE_IN, language)),
          kind: "text",
          language,
          channel: "whatsapp",
          queued_offline: false,
          delivered_at: daysAgo(followUpDaysAgo),
          created_at: daysAgo(followUpDaysAgo),
        });
      }
    }
  }

  // ---- screening campaigns + targets ----
  const CAMPAIGN_1 = "c1000000-0000-4000-8000-000000000001";
  const CAMPAIGN_2 = "c1000000-0000-4000-8000-000000000002";
  const CAMPAIGN_3 = "c1000000-0000-4000-8000-000000000003";
  t.screening_campaigns = [
    {
      id: CAMPAIGN_1,
      name: "Kingston hypertension sweep",
      description:
        "Every hypertensive patient in Jamaica with no blood-pressure reading in 30 days gets a home-reading request.",
      condition_focus: "hypertension",
      island_code: "JM",
      facility_id: null,
      cohort_rule: { condition: "Hypertension", no_reading_days: 30, risk_min: 30 },
      message_template:
        "Hi {name}, this is your CariCare care team. It has been a while since your last blood pressure check. Reply with your reading (e.g. 148/92) or type CHECK and we will find you a free check nearby.",
      channel: "whatsapp",
      status: "running",
      starts_on: dateDaysAgo(9),
      created_at: daysAgo(9),
      updated_at: daysAgo(9),
    },
    {
      id: CAMPAIGN_2,
      name: "Diabetes refill rescue",
      description:
        "Patients with under 10 days of medication left, or adherence under 70%, before they run out.",
      condition_focus: "diabetes",
      island_code: null,
      facility_id: null,
      cohort_rule: { days_supply_max: 10, adherence_max: 70 },
      message_template:
        "Hi {name}, our records show your medication is running low. Reply REFILL and we will confirm stock at your nearest clinic and hold it for you.",
      channel: "whatsapp",
      status: "running",
      starts_on: dateDaysAgo(4),
      created_at: daysAgo(4),
      updated_at: daysAgo(4),
    },
    {
      id: CAMPAIGN_3,
      name: "Rural undiagnosed screening drive",
      description:
        "Rural patients over 40 with no recorded conditions — first-time screening offer with a community health worker.",
      condition_focus: "screening",
      island_code: null,
      facility_id: null,
      cohort_rule: { rural: true, age_min: 40, conditions_max: 0 },
      message_template:
        "Hi {name}, free blood pressure and sugar testing is coming to your area this week. Reply YES to reserve a slot — it takes 10 minutes and it is free.",
      channel: "sms",
      status: "draft",
      starts_on: dateDaysAhead(3),
      created_at: daysAgo(0),
      updated_at: daysAgo(0),
    },
  ];
  const jmPatients = t.patients
    .filter((p) => p.island_code === "JM" && p.id !== HERO_PATIENT_ID)
    .slice(0, 60);
  jmPatients.forEach((p, i) => {
    const n = i + 1;
    const status =
      n % 5 === 0 ? "booked" : n % 3 === 0 ? "responded" : n % 7 === 0 ? "queued" : "sent";
    t.campaign_targets.push({
      id: uuid(rng),
      campaign_id: CAMPAIGN_1,
      patient_id: p.id,
      status,
      reason: "Hypertension on file, no reading in 30 days",
      sent_at: daysAgo(8),
      responded_at: n % 3 === 0 ? daysAgo(7) : null,
      reading_captured: n % 3 === 0,
      outcome: n % 5 === 0 ? "Teleconsult booked" : "",
      created_at: daysAgo(8),
    });
  });
  t.campaign_targets.push({
    id: uuid(rng),
    campaign_id: CAMPAIGN_1,
    patient_id: HERO_PATIENT_ID,
    status: "responded",
    reason: "Hypertension on file, reading overdue",
    sent_at: daysAgo(8),
    responded_at: daysAgo(8),
    reading_captured: true,
    outcome: "Home reading 168/104 returned — escalated to triage",
    created_at: daysAgo(8),
  });
  const lowSupplyMeds = t.medications
    .filter((m) => (m.days_supply_left as number) <= 10)
    .slice(0, 40);
  lowSupplyMeds.forEach((m, i) => {
    const n = i + 1;
    t.campaign_targets.push({
      id: uuid(rng),
      campaign_id: CAMPAIGN_2,
      patient_id: m.patient_id,
      status: n % 4 === 0 ? "responded" : "sent",
      reason: `Only ${m.days_supply_left} days of ${m.name} left`,
      sent_at: daysAgo(3),
      responded_at: n % 4 === 0 ? daysAgo(2) : null,
      reading_captured: false,
      outcome: n % 4 === 0 ? "Refill confirmed" : "",
      created_at: daysAgo(3),
    });
  });

  // ---- detection signals (mirrors detect_trend() for the highest-risk patients) ----
  const topRisk = t.risk_scores
    .filter((r) => r.patient_id !== HERO_PATIENT_ID)
    .slice()
    .sort((a, b) => (b.score as number) - (a.score as number))
    .slice(0, 20);
  for (const r of topRisk) {
    const pid = r.patient_id as string;
    const vitals = (vitalsByPatient.get(pid) ?? [])
      .slice()
      .sort(
        (a, b) =>
          new Date(b.measured_at as string).getTime() - new Date(a.measured_at as string).getTime(),
      );
    const recent = vitals.filter(
      (v) => nowMs() - new Date(v.measured_at as string).getTime() <= 10 * 86400000,
    );
    const baseline = vitals.filter((v) => {
      const age = nowMs() - new Date(v.measured_at as string).getTime();
      return age > 10 * 86400000 && age <= 40 * 86400000;
    });
    const avg = (rows: Row[], key: string) => {
      const vals = rows.map((r2) => r2[key]).filter((v): v is number => typeof v === "number");
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const cSys = avg(recent, "systolic");
    const bSys = avg(baseline, "systolic");
    if (cSys != null && bSys != null && cSys - bSys > 6) {
      t.detection_signals.push({
        id: uuid(rng),
        patient_id: pid,
        facility_id: null,
        kind: "trend",
        metric: "systolic_bp",
        current_value: Math.round(cSys),
        baseline_value: Math.round(bSys),
        delta_pct: Number((((cSys - bSys) / bSys) * 100).toFixed(1)),
        severity: cSys >= 160 ? "urgent" : cSys >= 145 ? "elevated" : "watch",
        narrative: `Blood pressure has climbed from ${Math.round(bSys)} to ${Math.round(cSys)} mmHg over the last 10 days.`,
        recommended_action:
          cSys >= 160
            ? "Call today; consider same-week teleconsult and medication review."
            : "Send a home-reading request and review adherence.",
        status: "open",
        detected_at: daysAgo(rng() * 6),
        acknowledged_by: null,
        acknowledged_at: null,
        campaign_id: null,
      });
    }
  }
  t.detection_signals.push({
    id: uuid(rng),
    patient_id: HERO_PATIENT_ID,
    facility_id: null,
    kind: "home_reading",
    metric: "systolic_bp",
    current_value: 168,
    baseline_value: 142,
    delta_pct: 18.3,
    severity: "urgent",
    narrative:
      "Home cuff reading of 168/104 returned through the care line, 26 mmHg above her 30-day baseline.",
    recommended_action: "Same-day teleconsult; cross-island cardiology route if unresolved.",
    status: "open",
    detected_at: daysAgo(0.25),
    acknowledged_by: null,
    acknowledged_at: null,
    campaign_id: CAMPAIGN_1,
  });

  // ---- clinical documents (hero patient paper on-ramp) ----
  t.clinical_documents = [
    {
      id: uuid(rng),
      patient_id: HERO_PATIENT_ID,
      facility_id: JM_CLINIC_ID,
      title: "Kingston clinic card — handwritten, 2023-2025",
      doc_type: "clinic_card",
      source: "paper_scan",
      storage_path: null,
      original_text:
        "MARLENE CAMPBELL  DOB 14/03/1968\nHTN dx 2019  T2DM dx 2021\nBP 156/96 (14/02/25)  BP 148/92 (09/05/25)\nAmlodipine 10mg od; Metformin 1g bd\nNKDA",
      extraction_status: "complete",
      extracted: {
        conditions: [
          { name: "Hypertension", diagnosed: "2019" },
          { name: "Type 2 diabetes", diagnosed: "2021" },
        ],
        medications: [
          { name: "Amlodipine", dosage: "10mg", frequency: "once daily" },
          { name: "Metformin", dosage: "1g", frequency: "twice daily" },
        ],
        vitals: [
          { systolic: 156, diastolic: 96, measured_at: "2025-02-14" },
          { systolic: 148, diastolic: 92, measured_at: "2025-05-09" },
        ],
        allergies: "NKDA",
      },
      extraction_note:
        "High confidence. Two readings and two medications matched existing records; no conflicts.",
      committed: true,
      uploaded_by: "Sister Yvette Marshall",
      created_at: daysAgo(11),
      updated_at: daysAgo(11),
    },
    {
      id: uuid(rng),
      patient_id: HERO_PATIENT_ID,
      facility_id: JM_HOSPITAL_ID,
      title: "Lipid panel + HbA1c — faxed lab report",
      doc_type: "lab_report",
      source: "fax",
      storage_path: null,
      original_text:
        "LAB: Kingston Path Services\nHbA1c 8.9%\nTotal chol 6.2 mmol/L  LDL 4.1  HDL 1.0\nCollected 02/08/2026",
      extraction_status: "complete",
      extracted: {
        labs: [
          { name: "HbA1c", value: "8.9", unit: "%" },
          { name: "Total cholesterol", value: "6.2", unit: "mmol/L" },
          { name: "LDL", value: "4.1", unit: "mmol/L" },
          { name: "HDL", value: "1.0", unit: "mmol/L" },
        ],
        collected: "2026-08-02",
      },
      extraction_note: "HbA1c above target — flagged to the attending clinician.",
      committed: true,
      uploaded_by: "Dr. Anika Cadogan",
      created_at: daysAgo(4),
      updated_at: daysAgo(4),
    },
  ];

  // ---- api clients (interoperability surface) ----
  t.api_clients = [
    {
      id: uuid(rng),
      name: "Trinidad General EMR bridge",
      organisation: "Trinidad and Tobago General Hospital",
      island_code: "TT",
      scopes: ["patient.read", "observation.read", "condition.read", "encounter.write"],
      status: "active",
      token_prefix: "ccg_live_tt7f",
      system_kind: "emr",
      last_used_at: daysAgo(20 / 1440),
      calls_30d: 4820,
      created_at: daysAgo(300),
    },
    {
      id: uuid(rng),
      name: "Jamaica MOH surveillance feed",
      organisation: "Ministry of Health & Wellness, Jamaica",
      island_code: "JM",
      scopes: ["population.read"],
      status: "active",
      token_prefix: "ccg_live_jmoh",
      system_kind: "ministry",
      last_used_at: daysAgo(2 / 24),
      calls_30d: 640,
      created_at: daysAgo(300),
    },
  ];

  // ---- demo persona profiles / roles / facility postings ----
  t.profiles = [
    {
      id: DEMO_USER_IDS.patient,
      full_name: "Marlene Campbell",
      primary_role: "patient",
      island_code: "JM",
      patient_id: HERO_PATIENT_ID,
      provider_id: null,
      organisation: "St. Elizabeth, Jamaica",
      facility_id: null,
      staff_role: null,
      is_demo: true,
      onboarded: true,
      verification_status: "verified",
      created_at: daysAgo(365),
      updated_at: daysAgo(0),
    },
    {
      id: DEMO_USER_IDS.clinic_staff,
      full_name: "Sister Yvette Marshall",
      primary_role: "clinician",
      island_code: "JM",
      patient_id: null,
      provider_id: null,
      organisation: "Jamaica Community Clinic",
      facility_id: JM_CLINIC_ID,
      staff_role: "nurse",
      licence_no: "NCJ-2014-08822",
      is_demo: true,
      onboarded: true,
      verification_status: "verified",
      created_at: daysAgo(365),
      updated_at: daysAgo(0),
    },
    {
      id: DEMO_USER_IDS.clinician,
      full_name: "Dr. Anand Rampersad",
      primary_role: "clinician",
      island_code: "TT",
      patient_id: null,
      provider_id: cardiologyTT.id,
      organisation: "Trinidad and Tobago General Hospital",
      facility_id: TT_HOSPITAL_ID,
      staff_role: "doctor",
      licence_no: "MCTT-2009-01173",
      is_demo: true,
      onboarded: true,
      verification_status: "verified",
      created_at: daysAgo(365),
      updated_at: daysAgo(0),
    },
    {
      id: DEMO_USER_IDS.ministry,
      full_name: "Nadine Joseph",
      primary_role: "ministry",
      island_code: null,
      patient_id: null,
      provider_id: null,
      organisation: "Regional NCD Coordination Unit",
      facility_id: null,
      staff_role: null,
      is_demo: true,
      onboarded: true,
      verification_status: "verified",
      created_at: daysAgo(365),
      updated_at: daysAgo(0),
    },
    {
      id: DEMO_USER_IDS.insurer,
      full_name: "Kevon Charles",
      primary_role: "insurer",
      island_code: null,
      patient_id: null,
      provider_id: null,
      organisation: "Caribbean Mutual Health",
      facility_id: null,
      staff_role: null,
      is_demo: true,
      onboarded: true,
      verification_status: "verified",
      created_at: daysAgo(365),
      updated_at: daysAgo(0),
    },
  ];
  t.user_roles = Object.entries(DEMO_USER_IDS).map(([persona, id]) => ({
    id: uuid(rng),
    user_id: id,
    role: persona === "clinic_staff" ? "clinician" : persona,
  }));
  // A hospital's Grid accounts are people, not job titles. The roster carries
  // names so the facility console reads like a staff list rather than a list of
  // anonymous "Grid account" rows.
  const TTGH_STAFF: [string, string, string][] = [
    ["Dr. Anjali Seepersad", "doctor", "Consultant endocrinologist"],
    ["Dr. Roger Alleyne", "doctor", "Consultant nephrologist"],
    ["Dr. Kwame Providence", "doctor", "Registrar, general medicine"],
    ["Dr. Sarita Balgobin", "doctor", "Registrar, cardiology"],
    ["Sister Paulette Grant", "nurse", "Ward sister, medical ward"],
    ["Sister Indira Maharaj", "nurse", "Ward sister, coronary care"],
    ["Nurse Kevon Alleyne", "nurse", "Staff nurse, diabetes clinic"],
    ["Nurse Denise Sookdeo", "nurse", "Staff nurse, outpatients"],
    ["Camille Boodoo", "front_desk", "Patient registration"],
    ["Terrence Ali", "front_desk", "Clinic reception"],
    ["Marva Cumberbatch", "org_admin", "Health records manager"],
  ];
  const JM_CLINIC_STAFF: [string, string, string][] = [
    ["Dr. Marcia Fenwick", "doctor", "Attending, chronic disease clinic"],
    ["Nurse Hyacinth Bailey", "nurse", "Community outreach nurse"],
    ["Owen Walters", "front_desk", "Clinic reception"],
  ];
  t.facility_staff = [
    {
      id: uuid(rng),
      user_id: DEMO_USER_IDS.clinic_staff,
      facility_id: JM_CLINIC_ID,
      staff_role: "nurse",
      title: "Chronic care nurse",
      full_name: "Sister Yvette Marshall",
      created_at: daysAgo(365),
    },
    {
      id: uuid(rng),
      user_id: DEMO_USER_IDS.clinician,
      facility_id: TT_HOSPITAL_ID,
      staff_role: "doctor",
      title: "Consultant cardiologist",
      full_name: "Dr. Anand Rampersad",
      created_at: daysAgo(365),
    },
    ...TTGH_STAFF.map(([full_name, staff_role, title]) => ({
      id: uuid(rng),
      user_id: null,
      facility_id: TT_HOSPITAL_ID,
      staff_role,
      title,
      full_name,
      created_at: daysAgo(int(rng, 40, 900)),
    })),
    ...JM_CLINIC_STAFF.map(([full_name, staff_role, title]) => ({
      id: uuid(rng),
      user_id: null,
      facility_id: JM_CLINIC_ID,
      staff_role,
      title,
      full_name,
      created_at: daysAgo(int(rng, 40, 900)),
    })),
  ];

  // ---- the health data cooperative ----
  // Module 07 of the brief. The distinguishing word is "cooperative": the
  // people whose data it is are members, not sources. So membership is opted
  // into and revocable, the pool holds only members, releases are governed by
  // a minimum cohort size, and the money comes back. A version of this that
  // simply sold regional health data would be the thing the region already
  // has reason to distrust.
  const MEMBER_RATE: Record<string, number> = {
    well_resourced: 0.72,
    clinician_rich: 0.68,
    middle: 0.61,
    under_resourced: 0.47,
  };
  for (const patient of t["patients"] ?? []) {
    const island = ISLANDS.find((i) => i.code === patient["island_code"]);
    if (!chance(rng, MEMBER_RATE[island?.tier ?? "middle"] ?? 0.6)) continue;
    // A few people joined and then left. Withdrawal has to be visible in the
    // data or the consent story is decorative.
    const withdrawn = chance(rng, 0.05);
    const joined = int(rng, 20, 400);
    (t["cooperative_members"] ??= []).push({
      id: uuid(rng),
      patient_id: patient["id"],
      status: withdrawn ? "withdrawn" : "active",
      scope: ["vitals", "conditions", "medications", "outcomes"],
      joined_at: daysAgo(joined),
      withdrawn_at: withdrawn ? daysAgo(int(rng, 1, joined - 1 > 1 ? joined - 1 : 2)) : null,
      created_at: daysAgo(joined),
    });
  }

  const REQUESTS: [string, string, string, string, string[], string, string, number][] = [
    [
      "University of the West Indies",
      "Faculty of Medical Sciences",
      "Hypertension control rates in adults over 50 across the Anglophone Caribbean",
      "Home blood pressure series, 90 days, with medication adherence",
      ["JM", "TT", "BB", "AG", "DM", "GD", "LC", "VC"],
      "approved",
      "Cohort well above the minimum. Purpose is public-health research, results published open access.",
      18000,
    ],
    [
      "Caribbean Public Health Agency",
      "CARPHA Surveillance Division",
      "Regional diabetes prevalence and glycaemic control benchmarking",
      "Glucose series and diagnosis dates, all member islands",
      ["JM", "TT", "BB", "HT", "DO", "CU", "AG", "DM", "GD", "LC", "VC"],
      "approved",
      "Regional public-health mandate. No fee — CARPHA returns the analysis to member states.",
      0,
    ],
    [
      "Novara Therapeutics",
      "Real-world evidence group",
      "Adherence patterns for fixed-dose combination antihypertensives",
      "Medication adherence and BP outcomes, members on combination therapy",
      ["JM", "TT", "BB"],
      "approved",
      "Commercial research. Fee set at the cooperative's commercial rate; no re-identification permitted; no onward transfer.",
      64000,
    ],
    [
      "Atlantic Health Analytics",
      "Data acquisition",
      "Bulk acquisition of longitudinal Caribbean patient records for resale",
      "Full record export, all patients",
      ["JM", "TT", "BB", "HT", "DO", "CU"],
      "declined",
      "Declined. Onward resale is incompatible with the terms members agreed to, and the request covers non-members.",
      0,
    ],
    [
      "Kingston Renal Institute",
      "Nephrology research unit",
      "Progression to dialysis among diabetic patients in Dominica",
      "Renal outcomes, Dominica members only",
      ["DM"],
      "pending",
      "",
      12000,
    ],
    [
      "PAHO / WHO",
      "Regional NCD programme",
      "Effect of teleconsultation access on blood pressure control",
      "Referral and consultation history against BP outcomes",
      ["JM", "TT", "HT", "DO", "LC"],
      "pending",
      "",
      0,
    ],
    [
      "Global NCD Alliance",
      "Policy research",
      "Cost of untreated hypertension in small island developing states",
      "Aggregate risk and outcome counts by island",
      ["JM", "TT", "BB", "HT", "DO", "AG", "DM", "GD", "LC", "VC", "CU"],
      "pending",
      "",
      9500,
    ],
  ];
  for (const [inst, unit, purpose, cohort, islandCodes, status, note, fee] of REQUESTS) {
    const created = int(rng, 2, 90);
    (t["data_requests"] ??= []).push({
      id: uuid(rng),
      institution: inst,
      requester_unit: unit,
      purpose,
      cohort,
      islands: islandCodes,
      status,
      fee_usd: fee,
      decided_at:
        status === "pending" ? null : daysAgo(int(rng, 1, created - 1 > 1 ? created - 1 : 2)),
      decided_by: status === "pending" ? null : "Regional NCD Coordination Unit",
      decision_note: note,
      created_at: daysAgo(created),
    });
  }

  return t;
}
