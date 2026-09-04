/**
 * Getting a clinic's staff onto the Grid without typing them in one at a time.
 *
 * The first version of this asked for a name and a job, one person per click,
 * and promised them an invitation it had no way to send — it collected no
 * phone number and no email. A clinic with eight staff meant eight rounds of
 * type, choose, click, at the end of which nobody had been contacted.
 *
 * Two decisions fix it.
 *
 * First, paste. Whoever is setting this up already has the list somewhere —
 * a WhatsApp message, a duty roster, the same spreadsheet everything else
 * arrives in. The product already has this idiom on the other side of the
 * building ("or paste what the card says" when digitising paper), so the
 * clinic can hand over the mess it actually has instead of retyping it.
 *
 * Second, a phone number counts as a contact. Reaching staff by email is a
 * habit from places where everyone has a work address; a nurse at a rural
 * health centre very often does not, and every one of them has WhatsApp. This
 * is the same reasoning that put the patient care line on WhatsApp, applied to
 * the people on the other end of it. Either will do, and the row says which.
 *
 * The role guess is rules over the words people actually write — "Sister",
 * "Dr.", "reception" — for the same reason the agents are rules: a reviewer
 * can see why it guessed, and a wrong guess is one click to fix.
 */
export type StaffRole = "doctor" | "nurse" | "front_desk" | "org_admin";

export type InviteRow = {
  name: string;
  /** A phone number or an email address. Empty is allowed — see `channel`. */
  contact: string;
  role: StaffRole;
};

export const ROLE_LABEL: Record<StaffRole, string> = {
  doctor: "Doctor",
  nurse: "Nurse",
  front_desk: "Front desk",
  org_admin: "Administrator",
};

/** What each role can reach, said in the words a manager would use. */
export const ROLE_BLURB: Record<StaffRole, string> = {
  doctor: "Full chart, prescribing, referrals",
  nurse: "Full chart, observations, referrals",
  front_desk: "Look someone up and register them — no chart",
  org_admin: "Staff and facility settings — no chart",
};

const EMAIL = /[^\s,;<>]+@[^\s,;<>]+\.[a-z]{2,}/i;
/** Seven digits or more, allowing the separators people actually type. */
const PHONE = /(\+?\d[\d\s\-().]{5,}\d)/;

export type Channel = "whatsapp" | "email" | "none";

export function channelFor(contact: string): Channel {
  const c = contact.trim();
  if (!c) return "none";
  if (EMAIL.test(c)) return "email";
  return digitsOf(c).length >= 7 ? "whatsapp" : "none";
}

function digitsOf(s: string) {
  return s.replace(/\D/g, "");
}

/**
 * Role from how somebody is written down.
 *
 * Ordered so the more specific title wins: "nurse practitioner" is nursing,
 * and a "registrar" is a doctor here rather than a clerk, which is exactly the
 * kind of thing a keyword list gets wrong if the order is careless.
 */
const ROLE_HINTS: [RegExp, StaffRole][] = [
  [/\b(front[\s-]?desk|reception|registration|clerk|greeter)\b/i, "front_desk"],
  [/\b(admin|administrator|manager|matron in charge|it)\b/i, "org_admin"],
  [/\b(sister|nurse|midwife|rn\b|staff nurse|nursing)\b/i, "nurse"],
  [/\b(dr\.?|doctor|consultant|registrar|physician|surgeon|md\b|specialist)\b/i, "doctor"],
];

export function guessRole(line: string): StaffRole {
  for (const [re, role] of ROLE_HINTS) if (re.test(line)) return role;
  // Nurses outnumber everybody else in the places this is built for.
  return "nurse";
}

/** Words that describe the job rather than name the person. */
const TITLE_NOISE =
  /\b(front[\s-]?desk|reception(ist)?|registration|clerk|administrator|admin|manager|nurse practitioner|staff nurse|nursing|midwife|consultant|physician|surgeon|specialist|registrar|doctor)\b/gi;

function cleanName(raw: string) {
  return raw
    .replace(TITLE_NOISE, " ")
    .replace(/[,;|\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—:·•*]+|[\s\-–—:·•*]+$/g, "")
    .trim();
}

/**
 * Read a pasted list into rows.
 *
 * One person per line, in whatever order the line happens to be in: the
 * contact is found wherever it sits, the job is inferred from the words
 * around it, and whatever is left over is the name. Lines with nothing usable
 * on them are dropped rather than turned into a blank row somebody has to
 * notice and delete.
 */
export function parseStaffList(text: string): InviteRow[] {
  const rows: InviteRow[] = [];
  for (const rawLine of text.split(/[\r\n]+/)) {
    const line = rawLine.trim();
    if (!line) continue;

    let rest = line;
    let contact = "";

    const email = EMAIL.exec(rest);
    if (email) {
      contact = email[0];
      rest = rest.replace(email[0], " ");
    } else {
      const phone = PHONE.exec(rest);
      if (phone && digitsOf(phone[1]!).length >= 7) {
        contact = phone[1]!.trim();
        rest = rest.replace(phone[1]!, " ");
      }
    }

    // The role is read from the whole original line: a title can sit either
    // side of the number, and removing it first would lose the hint.
    const role = guessRole(line);
    const name = cleanName(rest);
    if (!name && !contact) continue;
    rows.push({ name: name || "(no name)", contact, role });
  }
  return dedupe(rows);
}

/** The same person pasted twice — from two overlapping lists — is one person. */
function dedupe(rows: InviteRow[]) {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = (
      r.contact ? digitsOf(r.contact) || r.contact.toLowerCase() : r.name.toLowerCase()
    ).trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** For the summary line under the table. */
export function countChannels(rows: InviteRow[]) {
  let whatsapp = 0;
  let email = 0;
  let none = 0;
  for (const r of rows) {
    const c = channelFor(r.contact);
    if (c === "whatsapp") whatsapp += 1;
    else if (c === "email") email += 1;
    else none += 1;
  }
  return { whatsapp, email, none };
}
