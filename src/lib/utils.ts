// src/lib/utils.ts
// Shared utility functions for member display

// ===== GRADE COLOR CONFIGURATION =====
// Single source of truth for all grade colors across the app
export const GRADE_COLORS = {
  A: "#30558C",  // dark blue
  B: "#93c5fd",  // light blue
  C: "#b6dfcc",  // mint green
  D: "#D4B870",  // tan/gold
  F: "#C38B32",  // bronze/gold
  default: "#94A3B8"  // gray for N/A or unknown
} as const;

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
  if (g.startsWith("A")) return GRADE_COLORS.A;
  if (g.startsWith("B")) return GRADE_COLORS.B;
  if (g.startsWith("C")) return GRADE_COLORS.C;
  if (g.startsWith("D")) return GRADE_COLORS.D;
  if (g.startsWith("F")) return GRADE_COLORS.F;
  return GRADE_COLORS.default;
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
  if (!meta) return "";

  const bn = (meta.bill_number || col || "").toString().trim();
  const chamberValue = meta.chamber;

  // If chamber is explicitly HOUSE or SENATE, use that
  if (chamberValue === "HOUSE") return "HOUSE";
  if (chamberValue === "SENATE") return "SENATE";

  // If chamber is explicitly empty string, it's multi-chamber
  // Papa Parse with header:true converts empty CSV fields to empty strings
  if (chamberValue === "") {
    return "";
  }

  // Fallback: infer from bill number prefix
  if (bn.startsWith("H")) return "HOUSE";
  if (bn.startsWith("S")) return "SENATE";

  return "";
}

export function formatDate(dateStr: string): string {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Check for ISO format: YYYY-MM-DD
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);

      if (month >= 1 && month <= 12) {
        return `${monthNames[month - 1]} ${day}, ${year}`;
      }
    }
  }

  // Parse dates in format: M/D/YY or M/D/YYYY or MM/DD/YY or MM/DD/YYYY
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);

    // Convert 2-digit year to 4-digit
    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }

    if (month >= 1 && month <= 12) {
      return `${monthNames[month - 1]} ${day}, ${year}`;
    }
  }

  return dateStr;
}

export function extractVoteInfo(meta: { description?: string; analysis?: string; introduced_date?: string } | undefined): { voteResult?: string; voteDate?: string; dateIntroduced?: string } {
  if (!meta) return {};

  const description = String(meta.description || '');
  const analysis = String(meta.analysis || '');
  const combinedText = `${description} ${analysis}`;

  // Extract vote results and dates
  // Patterns: "failed 6-422 in a vote on 7/10/25", "Vote fails 15-83 on 4/3/25", "Voted down 47-53 on 6/27/25"
  // "Passed 24-73 on 5/15/25", "passed the House 219-206 on 3/14/25"
  const votePattern = /(?:failed?|passed?|voted\s+down|vote\s+fails?)\s+(?:the\s+(?:House|Senate)\s+)?(\d+-\d+)(?:\s+in\s+a\s+vote)?\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i;
  const match = combinedText.match(votePattern);

  let voteResult: string | undefined;
  let voteDate: string | undefined;

  if (match) {
    const votes = match[1]; // e.g., "6-422"
    const date = match[2]; // e.g., "7/10/25"

    // Determine if it passed or failed based on context
    const isPassed = /passed?/i.test(match[0]);
    const isFailed = /failed?|voted\s+down|vote\s+fails?/i.test(match[0]);

    if (isPassed) {
      voteResult = `Passed ${votes}`;
    } else if (isFailed) {
      voteResult = `Failed ${votes}`;
    } else {
      voteResult = votes;
    }

    voteDate = formatDate(date);
  }

  // Get date introduced from metadata field
  const dateIntroduced = (meta as { introduced_date?: string }).introduced_date;
  const formattedIntroducedDate = dateIntroduced ? formatDate(dateIntroduced) : undefined;

  return { voteResult, voteDate, dateIntroduced: formattedIntroducedDate };
}
