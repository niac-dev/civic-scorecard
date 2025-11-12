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

  const monthNameToNumber: Record<string, number> = {
    'jan': 1, 'january': 1,
    'feb': 2, 'february': 2,
    'mar': 3, 'march': 3,
    'apr': 4, 'april': 4,
    'may': 5,
    'jun': 6, 'june': 6,
    'jul': 7, 'july': 7,
    'aug': 8, 'august': 8,
    'sep': 9, 'sept': 9, 'september': 9,
    'oct': 10, 'october': 10,
    'nov': 11, 'november': 11,
    'dec': 12, 'december': 12
  };

  // Check for formats with dashes
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      // Check if it's D-Mon-YYYY format (e.g., "9-Jan-2025")
      if (isNaN(Number(parts[1]))) {
        const day = parseInt(parts[0], 10);
        const monthNum = monthNameToNumber[parts[1].toLowerCase()];
        const year = parseInt(parts[2], 10);

        if (monthNum && !isNaN(day) && !isNaN(year)) {
          return `${monthNames[monthNum - 1]} ${day}, ${year}`;
        }
      } else {
        // ISO format: YYYY-MM-DD
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);

        if (month >= 1 && month <= 12) {
          return `${monthNames[month - 1]} ${day}, ${year}`;
        }
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

export function extractVoteInfo(meta: { vote_result?: string; vote_tallies?: string; vote_date?: string; introduced_date?: string } | undefined): { voteResult?: string; voteDate?: string; dateIntroduced?: string } {
  if (!meta) return {};

  let voteResult: string | undefined;
  let voteDate: string | undefined;

  // Use new dedicated vote fields if available
  const voteResultField = meta.vote_result;
  const voteTalliesField = meta.vote_tallies;
  const voteDateField = meta.vote_date;

  if (voteResultField && voteTalliesField && voteDateField) {
    // Extract vote counts from tallies
    // Format: "Failed Senate: Nay: 83, Not Voting: 1, Present: 1, Yea: 15"
    // or "Passed House: Nay: 138, Not Voting: 48, Present: 1, Yea: 242 | Passed Senate: ..."

    // For multi-chamber, just use the first one (or combine them)
    const firstVote = String(voteTalliesField).split('|')[0].trim();

    // Extract chamber, result, and vote counts
    // Match pattern: "(Passed|Failed) (House|Senate): ... Yea: 123 ... Nay: 456"
    const chamberMatch = firstVote.match(/(Passed|Failed)\s+(House|Senate):/i);
    const yeaMatch = firstVote.match(/Yea:\s*(\d+)/i);
    const nayMatch = firstVote.match(/Nay:\s*(\d+)/i);

    if (chamberMatch && yeaMatch && nayMatch) {
      const result = chamberMatch[1]; // "Passed" or "Failed"
      const chamber = chamberMatch[2]; // "House" or "Senate"
      const yeaCount = yeaMatch[1];
      const nayCount = nayMatch[1];

      voteResult = `${chamber} Vote: ${result} ${yeaCount}-${nayCount}`;
    }

    // Parse and format the date
    // Format: "Senate: April 3, 2025,  03:24 PM" or "House: 9-Jan-2025 | Senate: 9-Jan-2025"
    const firstDate = String(voteDateField).split('|')[0].trim();
    // Remove chamber prefix if present
    const dateOnly = firstDate.replace(/^(House|Senate):\s*/i, '').trim();

    // Check if it's already in a nice format (contains month name)
    if (/january|february|march|april|may|june|july|august|september|october|november|december/i.test(dateOnly)) {
      // Already formatted nicely, just remove time if present
      voteDate = dateOnly.replace(/,?\s*\d{1,2}:\d{2}\s*(AM|PM)?/i, '').trim();
    } else {
      // Try to parse and format it
      voteDate = formatDate(dateOnly);
    }
  }

  // Get date introduced from metadata field
  const dateIntroduced = (meta as { introduced_date?: string }).introduced_date;
  const formattedIntroducedDate = dateIntroduced ? formatDate(dateIntroduced) : undefined;

  return { voteResult, voteDate, dateIntroduced: formattedIntroducedDate };
}
