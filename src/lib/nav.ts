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
  Megaphone,
  Radar,
  Plug,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  to:
    | "/"
    | "/record"
    | "/patient"
    | "/clinician"
    | "/facility"
    | "/registry"
    | "/prevention"
    | "/detection"
    | "/interop"
    | "/dashboard"
    | "/consent"
    | "/access-log"
    | "/insurer"
    | "/activity"
    | "/settings";
  label: string;
  icon: LucideIcon;
  roles: string[];
  group: "Work" | "Account";
  keywords: string;
};

const ALL = ["patient", "clinician", "ministry", "insurer", "admin"];

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, roles: ALL, group: "Work", keywords: "home summary grid" },
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
    group: "Work",
    keywords: "whatsapp chat intake triage message",
  },
  {
    to: "/clinician",
    label: "Clinician console",
    icon: Stethoscope,
    roles: ["clinician", "ministry", "admin"],
    group: "Work",
    keywords: "queue risk patients teleconsult",
  },
  {
    to: "/facility",
    label: "Facility console",
    icon: Hospital,
    roles: ["clinician", "ministry", "admin"],
    group: "Work",
    keywords: "hospital clinic organisation staff encounters shared records",
  },
  {
    to: "/registry",
    label: "Registry & import",
    icon: Users,
    roles: ["clinician", "ministry", "admin"],
    group: "Work",
    keywords: "patients staff add csv import export onboarding roster bulk registry",
  },
  {
    to: "/prevention",
    label: "Prevention engine",
    icon: Megaphone,
    roles: ["clinician", "ministry", "admin"],
    group: "Work",
    keywords: "campaign cohort outreach screening prevention whatsapp sms",
  },
  {
    to: "/detection",
    label: "Early detection",
    icon: Radar,
    roles: ["clinician", "ministry", "admin"],
    group: "Work",
    keywords: "signals deterioration trend home readings early warning",
  },
  {
    to: "/interop",
    label: "Records & API",
    icon: Plug,
    roles: ["clinician", "ministry", "admin"],
    group: "Work",
    keywords: "paper scan digitise upload fhir api interoperability integration",
  },
  {
    to: "/dashboard",
    label: "Coordination",
    icon: Activity,
    roles: ["ministry", "clinician", "admin"],
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
    to: "/activity",
    label: "Activity",
    icon: History,
    roles: ALL,
    group: "Work",
    keywords: "feed events log timeline",
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
  "/activity": "My activity",
};

export function navFor(role: string): NavItem[] {
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));
  if (role !== "patient") return items;
  // Patients see their activity inside "My health", not as a separate page.
  return items
    .filter((item) => item.to !== "/activity")
    .map((item) => ({ ...item, label: PATIENT_LABELS[item.to] ?? item.label }));
}
