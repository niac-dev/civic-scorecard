// src/lib/utils.ts
// Shared utility functions for member display

const NAME_TO_CODE: Record<string, string> = {
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
  "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
  "district of columbia": "DC", "florida": "FL", "georgia": "GA", "hawaii": "HI",
  "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
  "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME",
  "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
  "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
  "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
  "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", "tennessee": "TN", "texas": "TX",
  "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
  "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY"
};

export function stateCodeOf(s: string | undefined): string {
  const raw = (s ?? "").trim();
  if (!raw) return "";
  const hit = NAME_TO_CODE[raw.toLowerCase()];
  return hit ?? raw.toUpperCase();
}

export function partyLabel(p?: string) {
  const raw = (p ?? "").trim();
  if (!raw) return "";
  const s = raw.toLowerCase();
  if (s.startsWith("democ")) return "Democrat";
  return raw
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function partyBadgeStyle(p?: string) {
  const label = partyLabel(p).toLowerCase();
  const base =
    label.startsWith("rep") ? "#EF4444" : // red
    label.startsWith("dem") ? "#3B82F6" : // blue
    label.startsWith("ind") ? "#10B981" : // green
    "#94A3B8";                            // slate fallback
  return {
    color: base,
    backgroundColor: `${base}1A`, // ~10% alpha
    borderColor: `${base}66`,     // ~40% alpha
  };
}

export function gradeColor(grade: string): string {
  const g = (grade || "").trim().toUpperCase();
  if (g.startsWith("A")) return "#30558C"; // dark blue (using CLAUDE.md color)
  if (g.startsWith("B")) return "#93c5fd"; // light blue
  if (g.startsWith("C")) return "#b6dfcc"; // mint green
  if (g.startsWith("D")) return "#D4B870"; // tan/gold
  if (g.startsWith("F")) return "#C38B32"; // bronze/gold
  return "#94A3B8"; // gray
}

export function gradeTextColor(grade: string): string {
  const g = (grade || "").trim().toUpperCase();
  if (g.startsWith("A")) return "#ffffff"; // white for dark blue
  return "#4b5563"; // dark gray for others
}

export function isTruthy(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  const s = String(val).toLowerCase().trim();
  return s === "true" || s === "yes" || s === "1";
}

export function isTrue(val: unknown): boolean {
  return isTruthy(val);
}

export function chamberColor(ch?: string): string {
  switch (ch) {
    case "HOUSE":
      return "#b2c74a";
    case "SENATE":
      return "#857eab";
    default:
      return "#94A3B8";
  }
}

export function inferChamber(meta: { bill_number?: string; chamber?: string } | undefined, col: string): "HOUSE" | "SENATE" | "" {
  const bn = (meta?.bill_number || col || "").toString().trim();
  const explicit = (meta?.chamber || "").toString().toUpperCase().trim();
  // If chamber is explicitly set to HOUSE or SENATE, use that
  if (explicit === "HOUSE" || explicit === "SENATE") return explicit as "HOUSE" | "SENATE";
  // Try to infer from bill number prefix
  if (bn.startsWith("H")) return "HOUSE";
  if (bn.startsWith("S")) return "SENATE";
  // If we still can't determine and chamber is explicitly empty in metadata, it's multi-chamber
  if (meta && meta.chamber !== undefined && explicit === "") return "";
  return "";
}
