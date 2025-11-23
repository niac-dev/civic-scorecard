// src/lib/utils.ts
// Shared utility functions for member display

// ===== GRADE COLOR CONFIGURATION =====
// Single source of truth for all grade colors across the app
export const GRADE_COLORS = {
  A: "#0A6F7A",  // deep blue-emerald
  B: "#2DA0A2",  // aqua-teal
  C: "#9CCB99",  // soft warm green (new midpoint)
  D: "#ccb254",  // muted yellow-green (smooth transition)
  F: "#A96A63",  // pale apricot-grey (soft negative)
  default: "#94A3B8"  // gray for N/A or unknown
} as const;

// Comprehensive grade to color mapping (includes +/- modifiers)
// Single source of truth for all grade color mappings across the app
export const GRADE_COLOR_MAP: Record<string, string> = {
  'A+': GRADE_COLORS.A,
  'A': GRADE_COLORS.A,
  'A-': GRADE_COLORS.A,
  'B+': GRADE_COLORS.B,
  'B': GRADE_COLORS.B,
  'B-': GRADE_COLORS.B,
  'C+': GRADE_COLORS.C,
  'C': GRADE_COLORS.C,
  'C-': GRADE_COLORS.C,
  'D+': GRADE_COLORS.D,
  'D': GRADE_COLORS.D,
  'D-': GRADE_COLORS.D,
  'F': GRADE_COLORS.F,
  'N/A': GRADE_COLORS.default
};

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

  // Solid colors with white text for D/R
  if (label.startsWith("rep")) {
    return {
      color: "#FFFFFF",
      backgroundColor: "#DC2626", // red-600
      borderColor: "#DC2626",
    };
  }
  if (label.startsWith("dem")) {
    return {
      color: "#FFFFFF",
      backgroundColor: "#2563EB", // blue-600
      borderColor: "#2563EB",
    };
  }

  // Keep subtle styling for independents and others
  const base = label.startsWith("ind") ? "#10B981" : "#94A3B8";
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
  if (g.startsWith("A")) return "#ffffff"; // white for dark teal-green
  if (g.startsWith("B")) return "#ffffff"; // white for deep teal
  if (g.startsWith("C")) return "#4b5563"; // dark gray for medium green
  if (g.startsWith("D")) return "#4b5563"; // dark gray for light sage
  if (g.startsWith("F")) return "#4b5563"; // dark gray for pale sage-beige
  return "#4b5563"; // dark gray for unknown
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

export function inferChamber(meta: { bill_number?: string; chamber?: string; display_name?: string; short_title?: string; vote_tallies?: string } | undefined, col: string): "HOUSE" | "SENATE" | "" {
  if (!meta) return "";

  const chamberValue = (meta.chamber || "").toString().trim().toUpperCase();

  // If chamber is explicitly HOUSE or SENATE, use that
  if (chamberValue === "HOUSE") return "HOUSE";
  if (chamberValue === "SENATE") return "SENATE";

  // Infer from bill number prefix first (check multiple fields)
  // This ensures H.R. bills are always HOUSE and S. bills are always SENATE,
  // even if they were voted on in both chambers
  const bn = (meta.bill_number || meta.display_name || meta.short_title || col || "").toString().trim();
  if (bn.startsWith("H.R.") || bn.startsWith("H.") || bn.startsWith("H ")) return "HOUSE";
  if (bn.startsWith("S.") || bn.startsWith("S ")) return "SENATE";

  // Check vote_tallies to see if both chambers voted
  const voteTallies = (meta.vote_tallies || "").toLowerCase();
  const hasHouseVote = voteTallies.includes("house");
  const hasSenateVote = voteTallies.includes("senate");

  // If both chambers voted, treat as multi-chamber (return empty string)
  if (hasHouseVote && hasSenateVote) {
    return "";
  }

  // If chamber was explicitly empty and we couldn't infer, treat as multi-chamber
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

  // Use the exact language from vote_tallies as the status
  const voteResult = meta.vote_tallies ? String(meta.vote_tallies).trim() : undefined;

  // Get date introduced from metadata field
  const dateIntroduced = meta.introduced_date;
  const formattedIntroducedDate = dateIntroduced ? formatDate(dateIntroduced) : undefined;

  return { voteResult, voteDate: undefined, dateIntroduced: formattedIntroducedDate };
}
