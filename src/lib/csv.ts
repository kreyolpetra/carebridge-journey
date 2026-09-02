// CSV handling for the registry on-ramp.
//
// Most of the region's records are on paper or in spreadsheets, so bulk import
// is the realistic first step for onboarding a clinic — not an API. This parser
// is RFC 4180-shaped rather than a naive split(","): it handles quoted fields,
// commas and newlines inside quotes, escaped quotes, and both CRLF and LF, all
// of which appear in real exports from Excel and from ministry systems.

export type CsvRow = Record<string, string>;

export interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
}

/** Split raw CSV text into a header list and keyed rows. */
export function parseCsv(text: string): ParsedCsv {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  // Strip a UTF-8 BOM — Excel writes one and it corrupts the first header.
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\r") {
      // handled by the \n branch; bare \r is treated as a line break too
      if (src[i + 1] !== "\n") {
        record.push(field);
        records.push(record);
        record = [];
        field = "";
      }
    } else if (ch === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }

  // Flush the trailing field/record when the file has no final newline.
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows = nonEmpty.slice(1).map((cells) => {
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").trim();
    });
    return row;
  });

  return { headers, rows };
}

/** Quote a value only when it needs it, so diffs of exported files stay readable. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(","));
  return lines.join("\r\n");
}

/**
 * Hand the browser a file. Artifact viewers sandbox downloads, so callers
 * should offer the text on screen as well rather than relying on this alone.
 */
export function downloadCsv(filename: string, contents: string) {
  try {
    const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

export interface RowResult {
  line: number;
  ok: boolean;
  error?: string;
  value?: Record<string, unknown>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const PATIENT_TEMPLATE_HEADERS = [
  "mrn",
  "first_name",
  "last_name",
  "date_of_birth",
  "sex",
  "phone",
  "island_code",
  "parish",
  "language",
  "conditions",
];

export const STAFF_TEMPLATE_HEADERS = ["name", "email", "role", "island_code", "facility"];

export const STAFF_ROLES = ["clinician", "ministry", "insurer", "patient", "admin"];

/**
 * Validate one imported patient row. Errors are returned per row rather than
 * thrown, so a clerk importing 250 records sees exactly which lines failed and
 * why — and the good rows still land.
 */
export function validatePatientRow(row: CsvRow, line: number, knownIslands: Set<string>): RowResult {
  const mrn = row.mrn?.trim();
  const first = row.first_name?.trim();
  const last = row.last_name?.trim();
  const dob = row.date_of_birth?.trim();

  if (!mrn) return { line, ok: false, error: "mrn is required" };
  if (!first || !last) return { line, ok: false, error: "first_name and last_name are required" };
  if (!dob) return { line, ok: false, error: "date_of_birth is required" };
  if (!ISO_DATE.test(dob)) return { line, ok: false, error: `date_of_birth "${dob}" must be YYYY-MM-DD` };

  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return { line, ok: false, error: `date_of_birth "${dob}" is not a real date` };

  const age = Math.floor((Date.now() - parsed.getTime()) / (365.25 * 86400000));
  if (age < 0 || age > 120) return { line, ok: false, error: `date_of_birth "${dob}" gives an implausible age of ${age}` };

  const island = (row.island_code || "").trim().toUpperCase();
  if (island && !knownIslands.has(island)) {
    return { line, ok: false, error: `island_code "${island}" is not a country on the Grid` };
  }

  return {
    line,
    ok: true,
    value: {
      mrn,
      full_name: `${first} ${last}`,
      age,
      sex: (row.sex || "").trim().toUpperCase() === "M" ? "M" : "F",
      phone: row.phone?.trim() || "",
      island_code: island || "JM",
      parish: row.parish?.trim() || "Unknown",
      language: row.language?.trim() || "en",
      rural: false,
      km_to_facility: 5,
      insurer: null,
      conditions: (row.conditions || "")
        .split(/[;|]/)
        .map((c) => c.trim())
        .filter(Boolean),
    },
  };
}

export function validateStaffRow(row: CsvRow, line: number, knownIslands: Set<string>): RowResult {
  const name = row.name?.trim();
  const email = row.email?.trim();
  const role = (row.role || "").trim().toLowerCase();

  if (!name) return { line, ok: false, error: "name is required" };
  if (!email) return { line, ok: false, error: "email is required" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { line, ok: false, error: `"${email}" is not a valid email` };
  if (!role) return { line, ok: false, error: "role is required" };
  if (!STAFF_ROLES.includes(role)) {
    return { line, ok: false, error: `role "${role}" must be one of ${STAFF_ROLES.join(", ")}` };
  }

  const island = (row.island_code || "").trim().toUpperCase();
  if (island && !knownIslands.has(island)) {
    return { line, ok: false, error: `island_code "${island}" is not a country on the Grid` };
  }

  return {
    line,
    ok: true,
    value: {
      full_name: name,
      email,
      primary_role: role,
      island_code: island || null,
      organisation: row.facility?.trim() || "",
      is_demo: false,
      onboarded: false,
    },
  };
}
