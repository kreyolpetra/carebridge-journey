/**
 * What a facility has, and what a type is a guess at.
 *
 * "Hospital or clinic?" is the right question to ask somebody setting up, and
 * the wrong thing to branch on. It is easy to answer, which is why the wizard
 * asks it — but it is a guess about the inside of a building from the sign on
 * the front, and here that guess is often wrong. There are community clinics
 * with a working laboratory and district hospitals whose one has been down
 * since the last storm.
 *
 * So the type only ticks boxes, and the boxes are what features read. Getting
 * it wrong at setup then costs one click to correct, rather than making the
 * whole workspace the wrong shape for a year.
 */
export type FacilityCapabilities = {
  has_lab: boolean;
  has_imaging: boolean;
  has_pharmacy: boolean;
  beds_total: number;
  session_capacity: number;
};

export type FacilityKind = "hospital" | "clinic" | "health_centre";

export const KIND_LABEL: Record<FacilityKind, string> = {
  hospital: "Hospital",
  clinic: "Clinic",
  health_centre: "Rural health centre",
};

export const KIND_BLURB: Record<FacilityKind, string> = {
  hospital: "Beds, a laboratory, imaging and specialists on site",
  clinic: "Outpatients only, a dispensary, bloods sent away",
  health_centre: "A nurse or two, no laboratory, long distances",
};

/**
 * The opening guess. Every one of these is editable on the next step, and the
 * wizard says so — a default nobody can see is just a decision taken for them.
 */
export const KIND_PRESET: Record<FacilityKind, FacilityCapabilities> = {
  hospital: {
    has_lab: true,
    has_imaging: true,
    has_pharmacy: true,
    beds_total: 120,
    session_capacity: 12,
  },
  clinic: {
    has_lab: false,
    has_imaging: false,
    has_pharmacy: true,
    beds_total: 0,
    session_capacity: 8,
  },
  health_centre: {
    has_lab: false,
    has_imaging: false,
    has_pharmacy: false,
    beds_total: 0,
    session_capacity: 6,
  },
};

/** Read back with defaults, since older rows predate these columns. */
export function capabilitiesOf(f: {
  kind?: string;
  beds_total?: number;
  has_lab?: boolean;
  has_imaging?: boolean;
  has_pharmacy?: boolean;
  session_capacity?: number;
}): FacilityCapabilities {
  const preset = KIND_PRESET[(f.kind as FacilityKind) ?? "clinic"] ?? KIND_PRESET.clinic;
  return {
    has_lab: f.has_lab ?? preset.has_lab,
    has_imaging: f.has_imaging ?? preset.has_imaging,
    has_pharmacy: f.has_pharmacy ?? preset.has_pharmacy,
    beds_total: f.beds_total ?? preset.beds_total,
    session_capacity: f.session_capacity || preset.session_capacity,
  };
}
