import {
  LayoutDashboard,
  MessageSquareText,
  HeartPulse,
  Stethoscope,
  Activity,
  ShieldCheck,
  Coins,
  History,
  Hospital,
  Eye,
  Radar,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { STAFF_ROLE_TIER, type CareTier } from "@/lib/access";

export type NavItem = {
  to:
    | "/"
    | "/record"
    | "/patient"
    | "/patients"
    | "/facility"
    | "/detection"
    | "/dashboard"
    | "/consent"
    | "/access-log"
    | "/insurer"
    | "/settings";
  label: string;
  icon: LucideIcon;
  roles: string[];
  /**
   * Which care tiers may see this item, for users who are clinical staff.
   * Omitted means every tier. "clinician" is one role covering a consultant
   * cardiologist and a community nurse alike, so the role alone was never
   * enough to decide what belongs in someone's sidebar.
   */
  tiers?: CareTier[];
  group: "Work" | "Account";
  keywords: string;
};

const CLINICAL_TIERS: CareTier[] = ["attending", "consulting", "nursing"];

const ALL = ["patient", "clinician", "ministry", "insurer", "admin"];

export const NAV_ITEMS: NavItem[] = [
  {
    to: "/",
    label: "Overview",
    icon: LayoutDashboard,
    roles: ALL,
    group: "Work",
    keywords: "home summary grid",
  },
  {
    to: "/record",
    label: "My record",
    icon: HeartPulse,
    roles: ["patient", "admin"],
    group: "Work",
    keywords: "record vitals medications conditions history chart",
  },
  {
    to: "/patient",
    label: "Patient line",
    icon: MessageSquareText,
    roles: ["patient", "clinician", "admin"],
    tiers: CLINICAL_TIERS,
    group: "Work",
    keywords: "whatsapp chat intake triage message",
  },
  {
    to: "/patients",
    label: "Patients",
    icon: Users,
    roles: ["clinician", "admin"],
    // Front desk may look someone up to register them; the index is identity
    // only, and the chart behind it stays gated by tier like everywhere else.
    tiers: ["attending", "consulting", "nursing", "front_desk"],
    group: "Work",
    keywords: "patients worklist directory find search lookup panel roster chart record queue risk contact escalation console",
  },
  {
    to: "/facility",
    label: "Facility console",
    icon: Hospital,
    roles: ["clinician", "admin"],
    group: "Work",
    keywords:
      "hospital clinic organisation staff encounters shared records registry import csv roster fhir api interoperability paper scan",
  },
  {
    to: "/detection",
    label: "Surveillance & outreach",
    icon: Radar,
    roles: ["clinician", "ministry", "admin"],
    tiers: CLINICAL_TIERS,
    group: "Work",
    keywords:
      "signals deterioration trend home readings early warning prevention campaign cohort outreach screening",
  },
  {
    to: "/dashboard",
    label: "Coordination",
    icon: Activity,
    roles: ["ministry", "clinician", "admin"],
    tiers: ["attending", "consulting", "org_admin"],
    group: "Work",
    keywords: "heatmap capacity stockout island",
  },
  {
    to: "/consent",
    label: "Consent ledger",
    icon: ShieldCheck,
    roles: ALL,
    group: "Work",
    keywords: "privacy audit sharing records",
  },
  {
    to: "/access-log",
    label: "Access log",
    icon: Eye,
    roles: ALL,
    group: "Work",
    keywords: "who viewed my record transparency audit access log break glass",
  },
  {
    to: "/insurer",
    label: "Insurer engine",
    icon: Coins,
    roles: ["insurer", "ministry", "admin"],
    group: "Work",
    keywords: "premium credits adherence pricing",
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    roles: ALL,
    group: "Account",
    keywords: "profile account preferences sign out",
  },
];

const PATIENT_LABELS: Record<string, string> = {
  "/": "My health",
  "/patient": "My care line",
  "/record": "My record",
  "/consent": "Sharing & permissions",
  "/access-log": "Who has looked at my record",
};

export function navFor(role: string, staffRole?: string | null): NavItem[] {
  const tier = staffRole ? STAFF_ROLE_TIER[staffRole] : null;
  const items = NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(role)) return false;
    // A tier restriction only bites when we actually know the reader's tier.
    // Self-signed-up clinicians and the seeded admin have no facility staff
    // row, and they should not silently lose the whole sidebar.
    if (!tier || !item.tiers) return true;
    return item.tiers.includes(tier);
  });
  if (role !== "patient") return items;
  // Patients get plain-language labels; the activity feed lives on Overview for
  // every role, so it is no longer a nav item.
  return items.map((item) => ({ ...item, label: PATIENT_LABELS[item.to] ?? item.label }));
}
