export type DemoPersona = "patient" | "clinic_staff" | "clinician" | "ministry" | "insurer";

export const DEMO_PASSWORD = "CariCareDemo!2026";

export const DEMO_ACCOUNTS: Record<
  DemoPersona,
  { email: string; name: string; role: string; blurb: string; org: string }
> = {
  patient: {
    email: "marlene@caricare.demo",
    name: "Marlene Campbell",
    role: "patient",
    org: "St. Elizabeth, Jamaica",
    blurb: "Rural hypertensive + diabetic patient on the WhatsApp line",
  },
  clinic_staff: {
    email: "clinic@caricare.demo",
    name: "Sister Yvette Marshall",
    role: "clinician",
    org: "Jamaica Community Clinic",
    blurb: "Clinic nurse — sees records captured at other hospitals",
  },
  clinician: {
    email: "clinician@caricare.demo",
    name: "Dr. Anand Rampersad",
    role: "clinician",
    org: "Trinidad and Tobago General Hospital",
    blurb: "Hospital cardiologist taking cross-island teleconsults",
  },
  ministry: {
    email: "ministry@caricare.demo",
    name: "Nadine Joseph",
    role: "ministry",
    org: "Regional NCD Coordination Unit",
    blurb: "Population risk, capacity and stockout oversight",
  },
  insurer: {
    email: "insurer@caricare.demo",
    name: "Kevon Charles",
    role: "insurer",
    org: "Caribbean Mutual Health",
    blurb: "Adherence-linked premium credits and risk pricing",
  },
};

export const ROLE_LABEL: Record<string, string> = {
  patient: "Patient",
  clinician: "Clinician",
  ministry: "Ministry / Public health",
  insurer: "Insurer",
  admin: "Administrator",
};

/** Facilities the demo staff personas work at. */
export const DEMO_FACILITY: Partial<Record<DemoPersona, { id: string; staffRole: string; title: string }>> = {
  clinic_staff: {
    id: "a0ce1541-1e9d-4cce-81a5-218002bddd9d",
    staffRole: "nurse",
    title: "Chronic care nurse",
  },
  clinician: {
    id: "2c65425d-ad09-4e50-a019-f8afa29a14b4",
    staffRole: "doctor",
    title: "Consultant cardiologist",
  },
};
