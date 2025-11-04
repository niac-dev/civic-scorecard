/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { loadData } from "@/lib/loadCsv";
import { useFilters } from "@/lib/store";
import type { Row, Meta } from "@/lib/types";
import USMap from "@/components/USMap";
import Papa from "papaparse";
import { MemberModal } from "@/components/MemberModal";

import clsx from "clsx";

// --- States helper (dropdown + normalization) ---
const STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
  { code: "AS", name: "American Samoa" }, { code: "GU", name: "Guam" },
  { code: "MP", name: "Northern Mariana Islands" }, { code: "PR", name: "Puerto Rico" },
  { code: "VI", name: "U.S. Virgin Islands" },
];

const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  STATES.flatMap(({ code, name }) => [
    [name.toLowerCase(), code],
    [code.toLowerCase(), code],
  ])
);

// Normalize whatever is in the CSV to a 2-letter code when possible
function stateCodeOf(s: string | undefined): string {
  const raw = (s ?? "").trim();
  if (!raw) return "";
  const hit = NAME_TO_CODE[raw.toLowerCase()];
  return hit ?? raw.toUpperCase(); // fall back to original
}

function partyLabel(p?: string) {
  const raw = (p ?? "").trim();
  if (!raw) return "";
  const s = raw.toLowerCase();
  // normalize any form of Democratic/Democrat -> "Democrat"
  if (s.startsWith("democ")) return "Democrat";
  // Capitalize each word for other parties (e.g., "republican" -> "Republican")
  return raw
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function inferChamber(meta: Meta | undefined, col: string): "HOUSE" | "SENATE" | "" {
  const bn = (meta?.bill_number || col || "").toString().trim();
  const explicit = (meta?.chamber || "").toString().toUpperCase().trim();
  // If chamber is explicitly set to HOUSE or SENATE, use that
  if (explicit === "HOUSE" || explicit === "SENATE") return explicit as any;
  // Try to infer from bill number prefix
  if (bn.startsWith("H")) return "HOUSE";
  if (bn.startsWith("S")) return "SENATE";
  // If we still can't determine and chamber is explicitly empty in metadata, it's multi-chamber
  if (meta && meta.chamber !== undefined && explicit === "") return "";
  return "";
}

function formatPositionTooltip(meta: Meta | undefined): string {
  const position = (meta?.position_to_score || '').toUpperCase();
  const actionType = (meta as { action_types?: string })?.action_types || '';
  const isCosponsor = actionType.includes('cosponsor');
  const isSupport = position === 'SUPPORT';
  const pointsValue = meta?.points ? Number(meta.points).toFixed(0) : '';

  // For cosponsor bills, check no_cosponsor_benefit flag
  const noCosponsorBenefit = meta?.no_cosponsor_benefit === true ||
                             meta?.no_cosponsor_benefit === 1 ||
                             meta?.no_cosponsor_benefit === '1';

  let points = '';
  if (pointsValue) {
    if (isCosponsor && !noCosponsorBenefit) {
      // Cosponsors can get points either way
      points = ` (+/- ${pointsValue})`;
    } else if (isCosponsor && noCosponsorBenefit) {
      // Cosponsors can only lose points
      points = ` (- ${pointsValue})`;
    } else {
      // Regular points display
      points = ` (+${pointsValue})`;
    }
  }

  if (isCosponsor) {
    return isSupport ? `Support Cosponsorship${points}` : `Oppose Cosponsorship${points}`;
  } else {
    return isSupport ? `Vote in Favor${points}` : `Vote Against${points}`;
  }
}

function formatDate(dateStr: string): string {
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

function extractVoteInfo(meta: Meta | undefined): { voteResult?: string; voteDate?: string; dateIntroduced?: string } {
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

function lastName(full?: string) {
  const s = (full || "").trim();
  if (!s) return "";
  // If "Last, First" use the part before comma
  const comma = s.indexOf(",");
  if (comma > -1) {
    return s.slice(0, comma).trim().toLowerCase();
  }
  // Else take last token, ignoring suffixes
  const parts = s.split(/\s+/);
  const maybe = parts[parts.length - 1] || "";
  // strip common suffix punctuation
  return maybe.replace(/[.,]/g, "").toLowerCase();
}

function gradeRank(g?: string): number {
  const s = String(g || "").toUpperCase().trim();
  const order = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];
  const idx = order.indexOf(s);
  return idx === -1 ? order.length : idx; // unknown grades go to the end
}

function isTrue(v: unknown): boolean {
  return String(v).toLowerCase() === "true";
}

function isTruthy(v: unknown): boolean {
  if (v === 1 || v === '1' || v === true) return true;
  if (typeof v === 'number' && v > 0) return true;
  if (typeof v === 'string') {
    if (v.toLowerCase() === "true") return true;
    const num = parseFloat(v);
    if (!isNaN(num) && num > 0) return true;
  }
  return false;
}

// Check if member is endorsed by AIPAC based on PAC data (any election cycle)
function isAipacEndorsed(pacData: PacData | undefined): boolean {
  if (!pacData) return false;
  return (
    pacData.aipac_featured === 1 ||
    // 2024 cycle
    pacData.aipac_direct_amount > 0 ||
    pacData.aipac_earmark_amount > 0 ||
    pacData.aipac_ie_support > 0 ||
    // 2025 cycle
    pacData.aipac_direct_amount_2025 > 0 ||
    pacData.aipac_earmark_amount_2025 > 0 ||
    pacData.aipac_ie_support_2025 > 0 ||
    // 2022 cycle
    pacData.aipac_direct_amount_2022 > 0 ||
    pacData.aipac_earmark_amount_2022 > 0 ||
    pacData.aipac_ie_support_2022 > 0
  );
}

// Check if member is endorsed by DMFI based on PAC data (any election cycle)
function isDmfiEndorsed(pacData: PacData | undefined): boolean {
  if (!pacData) return false;

  // If DMFI has actual financial support in any cycle, return true
  if (
    // 2024 cycle
    pacData.dmfi_direct > 0 || pacData.dmfi_ie_support > 0 ||
    // 2025 cycle
    pacData.dmfi_direct_2025 > 0 || pacData.dmfi_total_2025 > 0 ||
    // 2022 cycle
    pacData.dmfi_direct_2022 > 0 || pacData.dmfi_ie_support_2022 > 0
  ) {
    return true;
  }

  // If DMFI website === 1 but no DMFI financial support, check if there's ANY financial support from AIPAC
  if (pacData.dmfi_website === 1) {
    // Use the isAipacEndorsed function which now checks all cycles
    return isAipacEndorsed(pacData);
  }

  return false;
}

// Determine which election year to display (prefer 2024, then 2025, then 2022 if 2024 has no $ data)
function getElectionYear(pacData: PacData | undefined): "2024" | "2025" | "2022" | null {
  if (!pacData) return null;

  // Check if 2024 has any dollar amounts
  const has2024Data = pacData.aipac_total > 0 || pacData.dmfi_total > 0;

  // Check if 2025 has any dollar amounts
  const has2025Data = pacData.aipac_total_2025 > 0 || pacData.dmfi_total_2025 > 0;

  // Check if 2022 has any dollar amounts
  const has2022Data = pacData.aipac_total_2022 > 0 || pacData.dmfi_total_2022 > 0;

  // Priority: 2024 > 2025 > 2022
  if (has2024Data) return "2024";
  if (has2025Data) return "2025";
  if (has2022Data) return "2022";

  // If no dollar data but we have endorsement data, check in priority order
  if (pacData.aipac_featured === 1 || pacData.dmfi_website === 1) return "2024";
  if (pacData.aipac_supported_2025 === 1 || pacData.dmfi_supported_2025 === 1) return "2025";

  return null;
}

// Convert data year to election cycle label
function getElectionLabel(year: "2024" | "2025" | "2022" | null): string {
  if (year === "2024") return "2024 Election";
  if (year === "2025") return "2026 Election";
  if (year === "2022") return "2022 Election";
  return "—";
}

function chamberColor(ch?: string): string {
  switch (ch) {
    case "HOUSE":
      return "#b2c74a"; // blue-ish for House
    case "SENATE":
      return "#857eab"; // violet for Senate
    default:
      return "#94A3B8"; // slate fallback
  }
}


function partyBadgeStyle(p?: string) {
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

interface PacData {
  bioguide_id: string;
  full_name: string;
  // 2024 data
  aipac_featured: number;
  aipac_direct_amount: number;
  aipac_earmark_amount: number;
  aipac_ie_support: number;
  aipac_ie_total: number;
  aipac_total: number;
  dmfi_website: number;
  dmfi_direct: number;
  dmfi_ie_support: number;
  dmfi_ie_total: number;
  dmfi_total: number;
  // 2025 data
  aipac_direct_amount_2025: number;
  aipac_earmark_amount_2025: number;
  aipac_ie_support_2025: number;
  aipac_ie_total_2025: number;
  aipac_total_2025: number;
  aipac_supported_2025: number;
  dmfi_direct_2025: number;
  dmfi_total_2025: number;
  dmfi_supported_2025: number;
  // 2022 data
  aipac_direct_amount_2022: number;
  aipac_earmark_amount_2022: number;
  aipac_ie_support_2022: number;
  aipac_ie_total_2022: number;
  aipac_total_2022: number;
  dmfi_direct_2022: number;
  dmfi_ie_support_2022: number;
  dmfi_ie_total_2022: number;
  dmfi_total_2022: number;
}

async function loadPacData(): Promise<Map<string, PacData>> {
  const [response2024, response2025, response2022] = await Promise.all([
    fetch('/data/pac_data.csv'),
    fetch('/data/pac_data_2025.csv'),
    fetch('/data/pac_data_2022.csv')
  ]);
  const [text2024, text2025, text2022] = await Promise.all([
    response2024.text(),
    response2025.text(),
    response2022.text()
  ]);

  return new Promise((resolve) => {
    // First parse 2024 data
    Papa.parse<Record<string, string>>(text2024, {
      header: true,
      skipEmptyLines: true,
      complete: (results2024) => {
        const map = new Map<string, PacData>();

        // Load 2024 data
        results2024.data.forEach((row) => {
          const bioguide_id = row.bioguide_id;
          if (!bioguide_id) return;

          map.set(bioguide_id, {
            bioguide_id,
            full_name: row.full_name || '',
            aipac_featured: parseFloat(row.aipac_featured) || 0,
            aipac_direct_amount: parseFloat(row.aipac_direct_amount) || 0,
            aipac_earmark_amount: parseFloat(row.aipac_earmark_amount) || 0,
            aipac_ie_support: parseFloat(row.aipac_ie_support) || 0,
            aipac_ie_total: parseFloat(row.aipac_ie_total) || 0,
            aipac_total: parseFloat(row.aipac_total) || 0,
            dmfi_website: parseFloat(row.dmfi_website) || 0,
            dmfi_direct: parseFloat(row.dmfi_direct) || 0,
            dmfi_ie_support: parseFloat(row.dmfi_ie_support) || 0,
            dmfi_ie_total: parseFloat(row.dmfi_ie_total) || 0,
            dmfi_total: parseFloat(row.dmfi_total) || 0,
            // Initialize 2025 data as 0
            aipac_direct_amount_2025: 0,
            aipac_earmark_amount_2025: 0,
            aipac_ie_support_2025: 0,
            aipac_ie_total_2025: 0,
            aipac_total_2025: 0,
            aipac_supported_2025: 0,
            dmfi_direct_2025: 0,
            dmfi_total_2025: 0,
            dmfi_supported_2025: 0,
            // Initialize 2022 data as 0
            aipac_direct_amount_2022: 0,
            aipac_earmark_amount_2022: 0,
            aipac_ie_support_2022: 0,
            aipac_ie_total_2022: 0,
            aipac_total_2022: 0,
            dmfi_direct_2022: 0,
            dmfi_ie_support_2022: 0,
            dmfi_ie_total_2022: 0,
            dmfi_total_2022: 0,
          });
        });

        // Then parse and merge 2025 data
        Papa.parse<Record<string, string>>(text2025, {
          header: true,
          skipEmptyLines: true,
          complete: (results2025) => {
            results2025.data.forEach((row) => {
              const bioguide_id = row.bioguide_id;
              if (!bioguide_id) return;

              const existing = map.get(bioguide_id);
              if (existing) {
                // Merge 2025 data into existing record
                existing.aipac_direct_amount_2025 = parseFloat(row.aipac_direct_amount_2025) || 0;
                existing.aipac_earmark_amount_2025 = parseFloat(row.aipac_earmark_amount_2025) || 0;
                existing.aipac_ie_support_2025 = parseFloat(row.aipac_ie_support_2025) || 0;
                existing.aipac_ie_total_2025 = parseFloat(row.aipac_ie_total_2025) || 0;
                existing.aipac_total_2025 = parseFloat(row.aipac_total_2025) || 0;
                existing.aipac_supported_2025 = parseFloat(row.aipac_supported_2025) || 0;
                existing.dmfi_direct_2025 = parseFloat(row.dmfi_direct_2025) || 0;
                existing.dmfi_total_2025 = parseFloat(row.dmfi_total_2025) || 0;
                existing.dmfi_supported_2025 = parseFloat(row.dmfi_supported_2025) || 0;
              }
            });

            // Finally parse and merge 2022 data
            Papa.parse<Record<string, string>>(text2022, {
              header: true,
              skipEmptyLines: true,
              complete: (results2022) => {
                results2022.data.forEach((row) => {
                  const bioguide_id = row.bioguide_id;
                  if (!bioguide_id) return;

                  const existing = map.get(bioguide_id);
                  if (existing) {
                    // Merge 2022 data into existing record
                    existing.aipac_direct_amount_2022 = parseFloat(row.aipac_direct_amount_2022) || 0;
                    existing.aipac_earmark_amount_2022 = parseFloat(row.aipac_earmark_amount_2022) || 0;
                    existing.aipac_ie_support_2022 = parseFloat(row.aipac_ie_support_2022) || 0;
                    existing.aipac_ie_total_2022 = parseFloat(row.aipac_ie_total_2022) || 0;
                    existing.aipac_total_2022 = parseFloat(row.aipac_total_2022) || 0;
                    existing.dmfi_direct_2022 = parseFloat(row.dmfi_direct_2022) || 0;
                    existing.dmfi_ie_support_2022 = parseFloat(row.dmfi_ie_support_2022) || 0;
                    existing.dmfi_ie_total_2022 = parseFloat(row.dmfi_ie_total_2022) || 0;
                    existing.dmfi_total_2022 = parseFloat(row.dmfi_total_2022) || 0;
                  }
                });

                resolve(map);
              }
            });
          }
        });
      }
    });
  });
}

function ZipcodeSearch() {
  const f = useFilters();
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      setError("Please enter an address or zipcode");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Use the find-lawmakers API which handles both zipcodes and addresses
      const response = await fetch(`/api/find-lawmakers?address=${encodeURIComponent(trimmedAddress)}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to find lawmakers');
        return;
      }

      if (data.lawmakers && data.lawmakers.length > 0) {
        const names = data.lawmakers.map((l: any) => l.name);
        // Switch to summary mode and filter by these lawmakers
        f.set({ myLawmakers: names, viewMode: "summary" });
        setAddress(""); // Clear the input after successful search
      } else {
        setError("No lawmakers found for this location");
      }
    } catch (err) {
      setError("Unable to find lawmakers. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Enter your address or zipcode"
          className="input flex-1"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          disabled={loading}
        />
        <button
          className="px-4 py-2 bg-[#4B8CFB] text-white rounded-lg hover:bg-[#3A7BE0] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-2 py-1">
          {error}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [metaByCol, setMeta] = useState<Map<string, Meta>>(new Map());
  const [categories, setCategories] = useState<string[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [selectedCell, setSelectedCell] = useState<{rowId: string, col: string} | null>(null);
  const [pacDataMap, setPacDataMap] = useState<Map<string, PacData>>(new Map());

  useEffect(() => { (async () => {
    const [data, pacData] = await Promise.all([loadData(), loadPacData()]);
    const { rows, columns, metaByCol, categories } = data;
    setRows(rows); setCols(columns); setMeta(metaByCol); setCategories(categories);
    setPacDataMap(pacData);
  })(); }, []);

  const f = useFilters();

  const [sortCol, setSortCol] = useState<string>("__member");
  const [sortDir, setSortDir] = useState<"GOOD_FIRST" | "BAD_FIRST">("GOOD_FIRST");
  const [selectedElection, setSelectedElection] = useState<"2024" | "2025" | "2022">("2024");

  // Ref for the scrollable table container
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  // Scroll to top when filters change (but not when categories change)
  useEffect(() => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [f.chamber, f.party, f.state, f.search, f.myLawmakers, f.viewMode]);

  // Prevent horizontal scroll from navigating browser history (important for iframe embeds)
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Check if the scroll is primarily horizontal
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Check if there's a scrollable container that can handle this scroll
        let target = e.target as HTMLElement | null;
        let foundScrollableContainer = false;

        while (target && target !== document.body) {
          const hasHorizontalScroll = target.scrollWidth > target.clientWidth;
          const canScrollLeft = target.scrollLeft > 0;
          const canScrollRight = target.scrollLeft < target.scrollWidth - target.clientWidth;

          // If the element can scroll horizontally and there's room to scroll
          if (hasHorizontalScroll && (canScrollLeft || canScrollRight)) {
            foundScrollableContainer = true;
            // Manually handle the scroll
            target.scrollLeft += e.deltaX;
            e.preventDefault();
            return;
          }
          target = target.parentElement;
        }

        // If no scrollable container was found, prevent browser navigation
        if (!foundScrollableContainer) {
          e.preventDefault();
        }
      }
    };

    // Add listener with passive: false to allow preventDefault
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!selectedCell) return;

    const handleClickOutside = () => {
      setSelectedCell(null);
    };

    // Add a small delay to avoid immediately closing on the same click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [selectedCell]);

  const filtered = useMemo(() => {
    let out = rows;
    if (f.chamber) out = out.filter(r => r.chamber === f.chamber);
    if (f.party) out = out.filter(r => r.party === f.party);
    if (f.state) out = out.filter(r => stateCodeOf(r.state) === f.state);
    if (f.search) {
      const q = f.search.toLowerCase().trim();
      out = out.filter(r => {
        const fullName = (r.full_name || "").toLowerCase();

        // Direct substring match (e.g., "Kim, Andy" matches "Kim, Andy")
        if (fullName.includes(q)) return true;

        // Split the search query into parts
        const searchParts = q.split(/\s+/).filter(Boolean);

        // Check if all search parts appear in the name (in any order)
        // This allows "Andy Kim" to match "Kim, Andy"
        const allPartsMatch = searchParts.every(part => fullName.includes(part));
        if (allPartsMatch) return true;

        // Try reversing "First Last" to "Last, First" format
        if (searchParts.length === 2) {
          const reversedQuery = `${searchParts[1]}, ${searchParts[0]}`;
          if (fullName.includes(reversedQuery.toLowerCase())) return true;
        }

        return false;
      });
    }
    if (f.myLawmakers.length > 0) {
      // Match by both first and last name
      out = out.filter(r => {
        const dbName = (r.full_name as string) || '';
        return f.myLawmakers.some(apiName => {
          // Extract last name and first name from both
          const [dbLast, dbFirst] = dbName.split(',').map(s => s?.trim().toLowerCase());
          const [apiLast, apiFirst] = apiName.split(',').map(s => s?.trim().toLowerCase());
          // Match both last and first name (first name can be a partial match to handle middle names/initials)
          return dbLast === apiLast && dbFirst && apiFirst && dbFirst.startsWith(apiFirst.split(' ')[0]);
        });
      });
    }
    // if (f.categories.size) {
    //   const wanted = new Set(Array.from(f.categories));
    //   const hasColInCats = (r: Row) =>
    //     cols.some(c => {
    //       const m = metaByCol.get(c);
    //       if (!m) return false;
    //       const cats = (m.categories || "").split(";").map((s:string)=>s.trim()).filter(Boolean);
    //       if (!cats.length) return false;
    //       return cats.some((cc:string)=>wanted.has(cc) && Number(r[c]) > 0);
    //     });
    //   out = out.filter(hasColInCats);
    // }
    return out;
  }, [rows, cols, f, metaByCol]);

  // Calculate max possible points for each column based on actual data
  const maxPointsByCol = useMemo(() => {
    const maxMap = new Map<string, number>();
    cols.forEach((col) => {
      let max = 0;
      rows.forEach((row) => {
        const val = Number((row as Record<string, unknown>)[col] ?? 0);
        if (val > max) max = val;
      });
      maxMap.set(col, max);
    });
    return maxMap;
  }, [rows, cols]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    // Sort by member last name when header "Member" is clicked
    if (sortCol === "__member") {
      const asc = sortDir === "GOOD_FIRST"; // reuse GOOD_FIRST as A→Z
      return [...filtered].sort((a, b) => {
        const la = lastName(a.full_name);
        const lb = lastName(b.full_name);
        if (la !== lb) return asc ? la.localeCompare(lb) : lb.localeCompare(la);
        return String(a.full_name || "").localeCompare(String(b.full_name || ""));
      });
    }
    // Sort by district (by state alphabetically, then senators before house, then by district number)
    if (sortCol === "__district") {
      const asc = sortDir === "GOOD_FIRST"; // GOOD_FIRST = ascending order

      // State code to full name mapping
      const stateNames: Record<string, string> = {
        AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
        CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
        FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
        IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
        ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
        MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
        NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
        NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
        PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
        TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
        WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
      };

      return [...filtered].sort((a, b) => {
        // First, sort by state name alphabetically
        const stateA = stateNames[String(a.state)] || String(a.state);
        const stateB = stateNames[String(b.state)] || String(b.state);
        const stateCompare = stateA.localeCompare(stateB);
        if (stateCompare !== 0) return asc ? stateCompare : -stateCompare;

        // Within same state, senators come before house members
        if (a.chamber === "SENATE" && b.chamber !== "SENATE") return -1;
        if (a.chamber !== "SENATE" && b.chamber === "SENATE") return 1;

        // If both are senators, sort by last name
        if (a.chamber === "SENATE" && b.chamber === "SENATE") {
          const la = lastName(a.full_name);
          const lb = lastName(b.full_name);
          return la.localeCompare(lb);
        }

        // Both are house members - sort by district number
        const distA = Number(a.district) || 0;
        const distB = Number(b.district) || 0;
        if (distA !== distB) return asc ? distA - distB : distB - distA;

        // Same district - sort by last name
        const la = lastName(a.full_name);
        const lb = lastName(b.full_name);
        return la.localeCompare(lb);
      });
    }
    // Sort by AIPAC/DMFI support
    if (sortCol === "__aipac") {
      const goodFirst = sortDir === "GOOD_FIRST";
      return [...filtered].sort((a, b) => {
        // Check for custom reject AIPAC commitment text
        const hasCustomA = Boolean(a.reject_aipac_commitment && String(a.reject_aipac_commitment).length > 10);
        const hasCustomB = Boolean(b.reject_aipac_commitment && String(b.reject_aipac_commitment).length > 10);

        const pacA = pacDataMap.get(String(a.bioguide_id));
        const pacB = pacDataMap.get(String(b.bioguide_id));
        const aipacA = isAipacEndorsed(pacA);
        const dmfiA = isDmfiEndorsed(pacA);
        const aipacB = isAipacEndorsed(pacB);
        const dmfiB = isDmfiEndorsed(pacB);

        // Assign priority (lower number = better/higher priority)
        // 1. Custom reject commitment
        // 2. Not supported by either
        // 3. Supported by both
        // 4. Supported by AIPAC only
        // 5. Supported by DMFI only
        const getPriority = (hasCustom: boolean, aipac: boolean, dmfi: boolean) => {
          if (hasCustom) return 1;
          if (!aipac && !dmfi) return 2;
          if (aipac && dmfi) return 3;
          if (aipac) return 4;
          if (dmfi) return 5;
          return 6; // fallback
        };

        const priorityA = getPriority(hasCustomA, aipacA, dmfiA);
        const priorityB = getPriority(hasCustomB, aipacB, dmfiB);

        // Sort by priority
        if (priorityA !== priorityB) {
          if (goodFirst) {
            return priorityA - priorityB; // Lower priority number first (1,2,3,4,5)
          } else {
            return priorityB - priorityA; // Higher priority number first (5,4,3,2,1)
          }
        }

        // Tie-break by name alphabetically
        return String(a.full_name || "").localeCompare(String(b.full_name || ""));
      });
    }
    // Sort by AIPAC-specific PAC data columns
    if (sortCol.startsWith("__aipac_") || sortCol.startsWith("__dmfi_") || sortCol === "__total_support") {
      const highFirst = sortDir === "GOOD_FIRST";
      return [...filtered].sort((a, b) => {
        const pacA = pacDataMap.get(String(a.bioguide_id));
        const pacB = pacDataMap.get(String(b.bioguide_id));

        let valA = 0;
        let valB = 0;

        if (sortCol === "__total_support") {
          // Use selectedElection for all members instead of individual years
          if (selectedElection === "2024") {
            valA = (pacA?.aipac_total || 0) + (pacA?.dmfi_total || 0);
            valB = (pacB?.aipac_total || 0) + (pacB?.dmfi_total || 0);
          } else if (selectedElection === "2025") {
            valA = (pacA?.aipac_total_2025 || 0) + (pacA?.dmfi_total_2025 || 0);
            valB = (pacB?.aipac_total_2025 || 0) + (pacB?.dmfi_total_2025 || 0);
          } else if (selectedElection === "2022") {
            valA = (pacA?.aipac_total_2022 || 0) + (pacA?.dmfi_total_2022 || 0);
            valB = (pacB?.aipac_total_2022 || 0) + (pacB?.dmfi_total_2022 || 0);
          }
        } else if (sortCol === "__election") {
          // Sort by election year (2024 first, then 2025, then 2022)
          valA = selectedElection === "2024" ? 3 : selectedElection === "2025" ? 2 : selectedElection === "2022" ? 1 : 0;
          valB = selectedElection === "2024" ? 3 : selectedElection === "2025" ? 2 : selectedElection === "2022" ? 1 : 0;
        } else if (sortCol === "__aipac_total") {
          if (selectedElection === "2024") {
            valA = pacA?.aipac_total || 0;
            valB = pacB?.aipac_total || 0;
          } else if (selectedElection === "2025") {
            valA = pacA?.aipac_total_2025 || 0;
            valB = pacB?.aipac_total_2025 || 0;
          } else if (selectedElection === "2022") {
            valA = pacA?.aipac_total_2022 || 0;
            valB = pacB?.aipac_total_2022 || 0;
          }
        } else if (sortCol === "__dmfi_total") {
          if (selectedElection === "2024") {
            valA = pacA?.dmfi_total || 0;
            valB = pacB?.dmfi_total || 0;
          } else if (selectedElection === "2025") {
            valA = pacA?.dmfi_total_2025 || 0;
            valB = pacB?.dmfi_total_2025 || 0;
          } else if (selectedElection === "2022") {
            valA = pacA?.dmfi_total_2022 || 0;
            valB = pacB?.dmfi_total_2022 || 0;
          }
        } else if (sortCol === "__aipac_direct") {
          if (selectedElection === "2024") {
            valA = pacA?.aipac_direct_amount || 0;
            valB = pacB?.aipac_direct_amount || 0;
          } else if (selectedElection === "2025") {
            valA = pacA?.aipac_direct_amount_2025 || 0;
            valB = pacB?.aipac_direct_amount_2025 || 0;
          } else if (selectedElection === "2022") {
            valA = pacA?.aipac_direct_amount_2022 || 0;
            valB = pacB?.aipac_direct_amount_2022 || 0;
          }
        } else if (sortCol === "__dmfi_direct") {
          if (selectedElection === "2024") {
            valA = pacA?.dmfi_direct || 0;
            valB = pacB?.dmfi_direct || 0;
          } else if (selectedElection === "2025") {
            valA = pacA?.dmfi_direct_2025 || 0;
            valB = pacB?.dmfi_direct_2025 || 0;
          } else if (selectedElection === "2022") {
            valA = pacA?.dmfi_direct_2022 || 0;
            valB = pacB?.dmfi_direct_2022 || 0;
          }
        } else if (sortCol === "__aipac_earmark") {
          if (selectedElection === "2024") {
            valA = pacA?.aipac_earmark_amount || 0;
            valB = pacB?.aipac_earmark_amount || 0;
          } else if (selectedElection === "2025") {
            valA = pacA?.aipac_earmark_amount_2025 || 0;
            valB = pacB?.aipac_earmark_amount_2025 || 0;
          } else if (selectedElection === "2022") {
            valA = pacA?.aipac_earmark_amount_2022 || 0;
            valB = pacB?.aipac_earmark_amount_2022 || 0;
          }
        } else if (sortCol === "__aipac_ie") {
          if (selectedElection === "2024") {
            valA = pacA?.aipac_ie_total || 0;
            valB = pacB?.aipac_ie_total || 0;
          } else if (selectedElection === "2025") {
            valA = pacA?.aipac_ie_total_2025 || 0;
            valB = pacB?.aipac_ie_total_2025 || 0;
          } else if (selectedElection === "2022") {
            valA = pacA?.aipac_ie_total_2022 || 0;
            valB = pacB?.aipac_ie_total_2022 || 0;
          }
        } else if (sortCol === "__dmfi_ie") {
          if (selectedElection === "2024") {
            valA = pacA?.dmfi_ie_total || 0;
            valB = pacB?.dmfi_ie_total || 0;
          } else if (selectedElection === "2025") {
            valA = 0; // No dmfi_ie for 2025
            valB = 0;
          } else if (selectedElection === "2022") {
            valA = pacA?.dmfi_ie_total_2022 || 0;
            valB = pacB?.dmfi_ie_total_2022 || 0;
          }
        }

        if (valA !== valB) {
          return highFirst ? valB - valA : valA - valB;
        }

        // Tie-break by name
        return String(a.full_name || "").localeCompare(String(b.full_name || ""));
      });
    }
    // Check if sorting by any grade column
    if (sortCol.startsWith("Grade")) {
      const goodFirst = sortDir === "GOOD_FIRST"; // best grades first
      const gradeField = sortCol as keyof Row;

      return [...filtered].sort((a, b) => {
        const ra = gradeRank(String(a[gradeField] || ""));
        const rb = gradeRank(String(b[gradeField] || ""));
        if (ra !== rb) return goodFirst ? ra - rb : rb - ra;
        // tie-break by Percent (higher first when goodFirst)
        const pa = Number(a.Percent || 0);
        const pb = Number(b.Percent || 0);
        if (pa !== pb) return goodFirst ? pb - pa : pa - pb;
        // final tie-break by name
        return String(a.full_name || "").localeCompare(String(b.full_name || ""));
      });
    }
    const meta = metaByCol.get(sortCol);
    const colCh = inferChamber(meta, sortCol);
    const goodFirst = sortDir === "GOOD_FIRST";

    const rankFor = (r: Row) => {
      const rawVal = (r as Record<string, unknown>)[sortCol];

      // Check for chamber mismatch
      const notApplicable = colCh && colCh !== r.chamber;
      if (notApplicable) return 2; // always last

      // Check for manual actions where member wasn't eligible (null/undefined/empty)
      const isManualAction = meta?.type === "MANUAL";
      const manualActionNotApplicable = isManualAction && (rawVal === null || rawVal === undefined || rawVal === '');
      if (manualActionNotApplicable) return 2; // always last

      const val = Number(rawVal ?? 0);
      const good = val > 0;
      if (goodFirst) return good ? 0 : 1; // ✓ first
      return good ? 1 : 0;                // ✕ first
    };

    return [...filtered].sort((a, b) => {
      const ra = rankFor(a), rb = rankFor(b);
      if (ra !== rb) return ra - rb;
      // tie-break by numeric value in the column (desc for GOOD_FIRST, asc for BAD_FIRST)
      const va = Number((a as Record<string, unknown>)[sortCol] ?? 0);
      const vb = Number((b as Record<string, unknown>)[sortCol] ?? 0);
      if (va !== vb) return goodFirst ? vb - va : va - vb;
      // final tie-break by name
      return String(a.full_name || "").localeCompare(String(b.full_name || ""));
    });
  }, [filtered, sortCol, sortDir, metaByCol, pacDataMap]);

  // All columns for the member card (chamber-filtered only, not category-filtered)
  const allBillCols = useMemo(() => {
    let out = cols;

    // Chamber filter: keep only bills for the selected chamber
    // Bills with empty chamber (multi-chamber bills) should appear in both filters
    if (f.chamber) {
      out = out.filter((c) => {
        const meta = metaByCol.get(c);
        const ch = inferChamber(meta, c);
        return ch === "" || ch === f.chamber;
      });
    }

    // Sort by: chamber (HOUSE, SENATE, then empty), then category (only if no category filter), then alphabetically by display name
    out = [...out].sort((a, b) => {
      const metaA = metaByCol.get(a);
      const metaB = metaByCol.get(b);

      // Sort by chamber first
      const chamberA = inferChamber(metaA, a);
      const chamberB = inferChamber(metaB, b);
      const chamberOrder = { "HOUSE": 1, "SENATE": 2, "": 3 };
      const chamberCompare = (chamberOrder[chamberA] || 3) - (chamberOrder[chamberB] || 3);
      if (chamberCompare !== 0) return chamberCompare;

      // Only sort by category if no category filter is active
      // (when filtering by category, all items are in the same category anyway)
      if (f.categories.size === 0) {
        const catsA = (metaA?.categories || "").split(";").map(s => s.trim()).filter(Boolean);
        const catsB = (metaB?.categories || "").split(";").map(s => s.trim()).filter(Boolean);
        const catA = catsA[0] || "";
        const catB = catsB[0] || "";
        const catCompare = catA.localeCompare(catB);
        if (catCompare !== 0) return catCompare;
      }

      // Finally sort alphabetically by display name
      // Strip bill numbers (e.g., "H.R.123 — Title" -> "Title") to group related bills together
      const stripBillNumber = (name: string) => {
        // Match patterns like "H.R.123 — ", "S.456 — ", "H.Con.Res.78 — ", etc.
        return name.replace(/^[A-Z]\.[A-Z\.]+\s*\d+\s*—\s*/i, '').trim();
      };
      const nameA = stripBillNumber(metaA?.display_name || metaA?.short_title || a);
      const nameB = stripBillNumber(metaB?.display_name || metaB?.short_title || b);
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });

    return out;
  }, [cols, metaByCol, f.chamber, f.categories]);

  // Filtered columns for the main table view (chamber + category filtered)
  const billCols = useMemo(() => {
    // In summary mode, show no bill columns
    if (f.viewMode === "summary") {
      return [];
    }

    // If AIPAC is selected, return custom AIPAC columns
    if (f.categories.has("AIPAC")) {
      return [
        "__election", // Election year (2024 or 2022)
        "__total_support", // Total AIPAC + DMFI Support
        "__aipac_total",
        "__aipac_direct",
        "__aipac_earmark",
        "__aipac_ie",
        "__dmfi_total",
        "__dmfi_direct",
        "__dmfi_ie"
      ];
    }

    let out = allBillCols;

    // Category filter: keep only bills whose meta.categories intersects selected chips
    if (f.categories.size) {
      const wanted = new Set(Array.from(f.categories));
      out = out.filter((c) => {
        const m = metaByCol.get(c);
        if (!m) return false;
        const cats = String(m.categories || "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean);
        return cats.some((cc) => wanted.has(cc));
      });

      // Removed __aipac_endorsed column - no longer needed
    }

    return out;
  }, [allBillCols, metaByCol, f.categories, f.viewMode]);

  // Determine which grade columns to show based on selected category
  const gradeColumns = useMemo(() => {
    // In summary mode, show all category grades (except AIPAC which doesn't have grade data)
    if (f.viewMode === "summary") {
      const categoryGrades = categories
        .filter(cat => cat !== "AIPAC") // Exclude AIPAC from grade columns
        .map(cat => {
          const fieldSuffix = cat.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
          return {
            header: cat,
            field: `Grade_${fieldSuffix}` as keyof Row
          };
        });
      return [
        { header: "Overall Grade", field: "Grade" as keyof Row },
        ...categoryGrades
      ];
    }
    // If exactly one category is selected, show only that category's grade
    if (f.categories.size === 1) {
      const category = Array.from(f.categories)[0];
      // AIPAC doesn't have grade data, so just show overall grade
      if (category === "AIPAC") {
        return [
          { header: "Overall Grade", field: "Grade" as keyof Row }
        ];
      }
      // Replace special chars with underscores to match CSV column naming
      const fieldSuffix = category.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
      return [
        {
          header: `${category} Grade`,
          field: `Grade_${fieldSuffix}` as keyof Row
        }
      ];
    }
    // Otherwise show only total grade
    return [
      { header: "Overall Grade", field: "Grade" as keyof Row }
    ];
  }, [f.categories, f.viewMode, categories]);

  // Determine which total/max/percent fields to show based on selected category
  const scoreSuffix = useMemo(() => {
    if (f.categories.size === 1) {
      const category = Array.from(f.categories)[0];
      return category.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
    }
    return ""; // Empty suffix means overall (Total, Max_Possible, Percent)
  }, [f.categories]);

  const gridTemplate = useMemo(() => {
    // Fixed widths per column so the header background spans the full scroll width
    const billsPart = billCols.map(() => "minmax(140px, 140px)").join(" ");
    const gradesPart = gradeColumns.map(() => "minmax(120px, 120px)").join(" ");
    // Member column: 50vw on small screens (max 50% of viewport), 300px on larger screens
    const memberCol = "min(50vw, 300px)";
    // In summary mode: member col + grade cols + endorsements col + total/max/percent
    if (f.viewMode === "summary") {
      return `${memberCol} ${gradesPart} minmax(240px, 240px) minmax(100px, 100px) minmax(100px, 100px) minmax(100px, 100px)`;
    }
    // AIPAC mode: member col + overall grade + endorsements col + other grade cols + dynamic bill cols (no totals)
    if (f.categories.has("AIPAC")) {
      // First grade column is Overall Grade (120px), then endorsements (240px), then remaining grade columns
      const restGradesPart = gradeColumns.slice(1).map(() => "minmax(120px, 120px)").join(" ");
      return `${memberCol} minmax(120px, 120px) minmax(240px, 240px) ${restGradesPart} ${billsPart}`;
    }
    // Civil Rights & Immigration mode: member col + grade cols + dynamic bill cols + totals (no endorsements)
    if (f.categories.has("Civil Rights & Immigration")) {
      return `${memberCol} ${gradesPart} ${billsPart} minmax(100px, 100px) minmax(100px, 100px) minmax(100px, 100px)`;
    }
    // member col + grade cols + dynamic bill cols + endorsements col + totals
    return `${memberCol} ${gradesPart} ${billsPart} 16rem minmax(100px, 100px) minmax(100px, 100px) minmax(100px, 100px)`;
  }, [billCols, gradeColumns, f.viewMode, f.categories]);

  // Calculate average grades per state for map coloring
  const stateColors = useMemo(() => {
    const colors: Record<string, string> = {};

    // Group members by state
    const byState: Record<string, Row[]> = {};
    rows.forEach((r) => {
      const state = stateCodeOf(r.state);
      if (!state) return;
      if (!byState[state]) byState[state] = [];
      byState[state].push(r);
    });

    // Calculate average grade for each state
    Object.entries(byState).forEach(([state, members]) => {
      const grades = members
        .map(m => gradeRank(String(m.Grade || "")))
        .filter(g => g !== 13); // exclude unknown grades

      if (grades.length === 0) {
        colors[state] = "#E5E7EB"; // gray for no data
        return;
      }

      const avgRank = grades.reduce((a, b) => a + b, 0) / grades.length;

      // Map average grade rank to color (dark navy = A, bronze = F)
      if (avgRank <= 2) { // A+ to A-
        colors[state] = "#050a30"; // dark navy blue
      } else if (avgRank <= 5) { // B+ to B-
        colors[state] = "#30558d"; // medium blue
      } else if (avgRank <= 8) { // C+ to C-
        colors[state] = "#93c5fd"; // light blue
      } else if (avgRank <= 11) { // D+ to D-
        colors[state] = "#D4B870"; // tan/gold
      } else { // F
        colors[state] = "#C38B32"; // bronze/gold
      }
    });

    return colors;
  }, [rows]);

  return (
    <div className="space-y-4">
      <Filters categories={categories} filteredCount={sorted.length} metaByCol={metaByCol} />
      {selected && (
        <MemberModal
          row={selected}
          billCols={allBillCols}
          metaByCol={metaByCol}
          categories={categories}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Views Container with Sliding Animation */}
      <div className="relative overflow-hidden">
        {/* Map View */}
        <div
          className={clsx(
            "card p-6 transition-all duration-500 ease-in-out",
            f.viewMode === "map"
              ? "translate-x-0 opacity-100"
              : "-translate-x-full opacity-0 absolute inset-0 pointer-events-none"
          )}
        >
          <USMap
            stateColors={stateColors}
            onStateClick={(stateCode) => {
              f.set({ state: stateCode, viewMode: "summary" });
              setSortCol("__district");
              setSortDir("GOOD_FIRST");
            }}
            members={filtered}
            onMemberClick={(member) => setSelected(member)}
            useDistrictMap={true}
            chamber={f.chamber}
          />
        </div>

        {/* Table View */}
        <div
          className={clsx(
            "card overflow-visible transition-all duration-500 ease-in-out",
            f.viewMode !== "map"
              ? "translate-x-0 opacity-100"
              : "translate-x-full opacity-0 absolute inset-0 pointer-events-none"
          )}
        >
          <div ref={tableScrollRef} className="overflow-x-auto overflow-y-auto max-h-[70vh]" style={{ touchAction: 'pan-x pan-y' }}>
            {/* Header */}
            <div
              className="grid min-w-max sticky top-0 z-30 bg-white/70 dark:bg-slate-900/85 backdrop-blur-xl border-b border-[#E7ECF2] dark:border-white/10 shadow-sm"
              style={{
                gridTemplateColumns: gridTemplate,
              }}
            >
            <div
              className="th pl-4 sticky left-0 z-40 bg-white dark:bg-slate-900 border-r border-[#E7ECF2] dark:border-white/10 cursor-pointer group"
              onClick={() => {
                if (sortCol === "__member") {
                  // Cycle: alphabet asc → alphabet desc → district asc → district desc → alphabet asc
                  if (sortDir === "GOOD_FIRST") {
                    setSortDir("BAD_FIRST");
                  } else {
                    setSortCol("__district");
                    setSortDir("GOOD_FIRST");
                  }
                } else if (sortCol === "__district") {
                  if (sortDir === "GOOD_FIRST") {
                    setSortDir("BAD_FIRST");
                  } else {
                    setSortCol("__member");
                    setSortDir("GOOD_FIRST");
                  }
                } else {
                  setSortCol("__member");
                  setSortDir("GOOD_FIRST");
                }
              }}
              title={
                sortCol === "__member"
                  ? `Click to sort by alphabet (currently ${sortDir === "GOOD_FIRST" ? "A→Z" : "Z→A"})`
                  : sortCol === "__district"
                  ? `Click to sort by district (currently ${sortDir === "GOOD_FIRST" ? "ascending" : "descending"})`
                  : "Click to sort by alphabet or district"
              }
            >
              Member
              <span className={clsx(
                "absolute right-2 top-1.5 text-[10px] flex items-center gap-1",
                (sortCol === "__member" || sortCol === "__district") ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100"
              )}>
                <span className="text-[9px]">
                  {sortCol === "__district" ? "district" : sortCol === "__member" ? "name" : "sort"}
                </span>
                {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
              </span>
            </div>

            {gradeColumns.map((gradeCol, idx) => {
              const isOverallGrade = gradeCol.header === "Overall Grade";
              const isSummaryMode = f.viewMode === "summary";
              const isCategoryHeader = isSummaryMode && !isOverallGrade;

              return (
                <React.Fragment key={gradeCol.field}>
                  <div
                    className={clsx(
                      "th text-center relative group",
                      idx === gradeColumns.length - 1 && !f.categories.has("AIPAC") && "border-r border-[#E7ECF2] dark:border-white/10"
                    )}
                  >
                    <div
                      className={clsx(
                        "flex flex-col items-center cursor-pointer",
                        isCategoryHeader && "hover:text-[#4B8CFB] transition-colors"
                      )}
                      title={
                        isCategoryHeader
                          ? `Click to view ${gradeCol.header} bills`
                          : `Click to sort by ${gradeCol.header} (toggle best→worst / worst→best)`
                      }
                      onClick={() => {
                        if (isCategoryHeader) {
                          // In summary mode, clicking a category header switches to category view
                          f.set({ viewMode: "category" });
                          f.clearCategories();
                          // Add this category to the filter
                          f.toggleCategory(gradeCol.header);
                        } else {
                          // Regular sort behavior
                          if (sortCol === String(gradeCol.field)) {
                            setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                          } else {
                            setSortCol(String(gradeCol.field));
                            setSortDir("GOOD_FIRST");
                          }
                        }
                      }}
                    >
                      <div>{gradeCol.header}</div>
                    </div>
                    <div
                      className="absolute bottom-1 left-0 right-0 text-[10px] text-slate-400 dark:text-slate-500 flex items-center justify-center gap-0.5 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Sort behavior when clicking the sort indicator
                        if (sortCol === String(gradeCol.field)) {
                          setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                        } else {
                          setSortCol(String(gradeCol.field));
                          setSortDir("GOOD_FIRST");
                        }
                      }}
                      title="Click to sort"
                    >
                      <span>Sort</span>
                      <span className={clsx(
                        sortCol === String(gradeCol.field) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}>
                        {sortCol === String(gradeCol.field) ? (sortDir === "GOOD_FIRST" ? "▲" : "▼") : "▼"}
                      </span>
                    </div>
                  </div>

                  {/* Endorsements column header - after Overall Grade in AIPAC view */}
                  {idx === 0 && f.categories.has("AIPAC") && (
                    <div className="th border-r border-[#E7ECF2] dark:border-white/10 group relative select-none flex flex-col">
                      {/* Header title - clickable to view AIPAC page with fixed 4-line height */}
                      <div className="h-[4.5rem] flex items-start">
                        <span
                          className="line-clamp-4 cursor-pointer hover:text-[#4B8CFB] transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open('/aipac', '_blank');
                          }}
                        >
                          Supported by AIPAC or DMFI
                        </span>
                      </div>

                      {/* Sortable indicator - always in uniform position */}
                      <span
                        className={clsx(
                          "text-[10px] text-slate-400 dark:text-slate-500 font-light mt-0.5 flex items-center gap-1 cursor-pointer",
                          sortCol === "__aipac" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}
                        onClick={() => {
                          if (sortCol === "__aipac") {
                            setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                          } else {
                            setSortCol("__aipac");
                            setSortDir("GOOD_FIRST");
                          }
                        }}
                        title="Click to sort by AIPAC/DMFI support (toggle ✓ first / ✕ first)"
                      >
                        sort
                        <span>
                          {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                        </span>
                      </span>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            {billCols.map((c) => {
              // Handle AIPAC-specific columns
              if (c.startsWith("__aipac_") || c.startsWith("__dmfi_") || c === "__total_support" || c === "__election") {
                const headerLabels: Record<string, string> = {
                  "__election": "Election",
                  "__total_support": "Total AIPAC/DMFI Support",
                  "__aipac_total": "AIPAC Total",
                  "__dmfi_total": "DMFI Total",
                  "__aipac_direct": "AIPAC Direct Donations",
                  "__dmfi_direct": "DMFI Direct Donations",
                  "__aipac_earmark": "AIPAC Earmarked Donations",
                  "__aipac_ie": "AIPAC Independent Expenditures",
                  "__dmfi_ie": "DMFI Independent Expenditures"
                };

                // Special handling for Election column - make it a dropdown
                if (c === "__election") {
                  return (
                    <div
                      key={c}
                      className="th group/header relative select-none flex flex-col max-w-[14rem]"
                    >
                      {/* Header and dropdown for election year selection */}
                      <div className="h-[4.5rem] flex flex-col items-start justify-start">
                        <div className="mb-1">Election Cycle</div>
                        <select
                          className="text-sm font-normal bg-transparent border border-slate-300 dark:border-slate-600 rounded px-2 py-0.5 cursor-pointer hover:border-[#4B8CFB] dark:hover:border-[#4B8CFB] focus:outline-none focus:border-[#4B8CFB] dark:focus:border-[#4B8CFB]"
                          value={selectedElection}
                          onChange={(e) => {
                            setSelectedElection(e.target.value as "2024" | "2025" | "2022");
                          }}
                        >
                          <option value="2025">2026</option>
                          <option value="2024">2024</option>
                          <option value="2022">2022</option>
                        </select>
                      </div>
                    </div>
                  );
                }

                // Regular AIPAC column headers
                return (
                  <div
                    key={c}
                    className="th group relative select-none flex flex-col max-w-[14rem]"
                  >
                    {/* Header title - clickable to view AIPAC page with fixed 4-line height */}
                    <div className="h-[4.5rem] flex items-start">
                      <span
                        className="line-clamp-4 cursor-pointer hover:text-[#4B8CFB] transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open('/aipac', '_blank');
                        }}
                      >
                        {headerLabels[c] || c}
                      </span>
                    </div>

                    {/* Sortable indicator - always in uniform position */}
                    <span
                      className={clsx(
                        "text-[10px] text-slate-400 dark:text-slate-500 font-light mt-0.5 flex items-center gap-1 cursor-pointer",
                        sortCol === c ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}
                      onClick={() => {
                        if (sortCol === c) {
                          setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                        } else {
                          setSortCol(c);
                          setSortDir("GOOD_FIRST");
                        }
                      }}
                      title="Click to sort by this column"
                    >
                      sort
                      <span>
                        {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                      </span>
                    </span>
                  </div>
                );
              }

              // Regular bill columns
              return (
                <Header
                  key={c}
                  col={c}
                  meta={metaByCol.get(c)}
                  active={sortCol === c}
                  dir={sortDir}
                  onSort={() => {
                    if (sortCol === c) {
                      setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                    } else {
                      setSortCol(c);
                      setSortDir("GOOD_FIRST");
                    }
                  }}
                />
              );
            })}
            {/* Endorsements column header - shown after bills in non-AIPAC views */}
            {!f.categories.has("AIPAC") && !f.categories.has("Civil Rights & Immigration") && (
              <div className="th border-r border-[#E7ECF2] dark:border-white/10 group relative select-none flex flex-col">
                {/* Header title - clickable to view AIPAC page with fixed 3-line height */}
                <div className="h-[3.375rem] flex items-start">
                  <span
                    className="line-clamp-3 cursor-pointer hover:text-[#4B8CFB] transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open('/aipac', '_blank');
                    }}
                  >
                    Supported by AIPAC or DMFI
                  </span>
                </div>

                {/* Sortable indicator - always in uniform position */}
                <span
                  className={clsx(
                    "text-[10px] text-slate-400 dark:text-slate-500 font-light mt-0.5 flex items-center gap-1 cursor-pointer",
                    sortCol === "__aipac" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                  onClick={() => {
                    if (sortCol === "__aipac") {
                      setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                    } else {
                      setSortCol("__aipac");
                      setSortDir("GOOD_FIRST");
                    }
                  }}
                  title="Click to sort by AIPAC/DMFI support (toggle ✓ first / ✕ first)"
                >
                  sort
                  <span>
                    {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                  </span>
                </span>
              </div>
            )}

            {/* Sortable score headers - shown for all views except AIPAC */}
            {!f.categories.has("AIPAC") && (
              <>
                {/* Sortable score headers */}
                <div
                  className="th text-center cursor-pointer relative group border-l border-[#E7ECF2] dark:border-white/10"
                  title="Click to sort by Total (toggle high→low / low→high)"
                  onClick={() => {
                    const col = scoreSuffix ? `Total_${scoreSuffix}` : "Total";
                    if (sortCol === col) {
                      setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                    } else {
                      setSortCol(col);
                      setSortDir("GOOD_FIRST");
                    }
                  }}
                >
                  Total Points
                  <span className={clsx(
                    "absolute right-2 bottom-1.5 text-[10px]",
                    sortCol === (scoreSuffix ? `Total_${scoreSuffix}` : "Total") ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100"
                  )}>
                    {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                  </span>
                </div>

                <div
                  className="th text-center cursor-pointer relative group"
                  title="Click to sort by Max (toggle high→low / low→high)"
                  onClick={() => {
                    const col = scoreSuffix ? `Max_Possible_${scoreSuffix}` : "Max_Possible";
                    if (sortCol === col) {
                      setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                    } else {
                      setSortCol(col);
                      setSortDir("GOOD_FIRST");
                    }
                  }}
                >
                  Max Points
                  <span className={clsx(
                    "absolute right-2 bottom-1.5 text-[10px]",
                    sortCol === (scoreSuffix ? `Max_Possible_${scoreSuffix}` : "Max_Possible") ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100"
                  )}>
                    {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                  </span>
                </div>

                <div
                  className="th text-center cursor-pointer relative group"
                  title="Click to sort by Percent (toggle high→low / low→high)"
                  onClick={() => {
                    const col = scoreSuffix ? `Percent_${scoreSuffix}` : "Percent";
                    if (sortCol === col) {
                      setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                    } else {
                      setSortCol(col);
                      setSortDir("GOOD_FIRST");
                    }
                  }}
                >
                  Percent
                  <span className={clsx(
                    "absolute right-2 bottom-1.5 text-[10px]",
                    sortCol === (scoreSuffix ? `Percent_${scoreSuffix}` : "Percent") ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100"
                  )}>
                    {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Rows */}
          {sorted.map((r, i) => (
            <div
              key={i}
              className={clsx(
                "grid min-w-max transition group",
                "hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {/* member + photo */}
              <div
                className="td pl-2 md:pl-4 flex items-center gap-1.5 md:gap-3 cursor-pointer sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition border-r border-[#E7ECF2] dark:border-white/10"
                onClick={() => setSelected(r)}
                title="Click to view details"
              >
                {/* Photo - smaller on phones, normal on tablets/desktop */}
                {r.photo_url ? (
                  <img
                    src={String(r.photo_url)}
                    alt=""
                    className="h-10 w-10 md:h-[68px] md:w-[68px] rounded-full object-cover bg-slate-200 dark:bg-white/10 flex-shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 md:h-[68px] md:w-[68px] rounded-full bg-slate-300 dark:bg-white/10 flex-shrink-0" />
                )}

                {/* Text content - normal behavior on tablets/desktop, scrolls on phones */}
                <div className="flex flex-col justify-center min-w-0">
                  <div className="text-[8px] md:text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium mb-0.5 hidden md:block">
                    {(() => {
                      if (r.chamber === "SENATE") return "Senator";
                      if (r.chamber === "HOUSE") {
                        const delegateStates = ["AS", "DC", "GU", "MP", "PR", "VI"];
                        const state = stateCodeOf(r.state);
                        return delegateStates.includes(state) ? "Delegate" : "Representative";
                      }
                      return "";
                    })()}
                  </div>
                  <div className="font-bold text-xs md:text-[16px] leading-tight md:leading-5 text-slate-800 dark:text-white mb-0.5 md:mb-1">
                    {(() => {
                      const fullName = String(r.full_name || "");
                      const commaIndex = fullName.indexOf(",");
                      if (commaIndex > -1) {
                        const first = fullName.slice(commaIndex + 1).trim();
                        const last = fullName.slice(0, commaIndex).trim();
                        return `${first} ${last}`;
                      }
                      return fullName;
                    })()}
                  </div>
                  <div className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 md:gap-2 whitespace-nowrap md:flex-wrap">
                    {/* Chamber first, solid background (purple for Senate, green for House) */}
                    <span
                      className="px-1 md:px-1.5 py-0.5 rounded-md text-[9px] md:text-[11px] font-semibold"
                      style={{
                        color: '#64748b',
                        backgroundColor: `${chamberColor(r.chamber)}20`,
                      }}
                    >
                      {r.chamber === "HOUSE"
                        ? "House"
                        : r.chamber === "SENATE"
                        ? "Senate"
                        : (r.chamber || "")}
                    </span>

                    {/* Party badge next, colored outline/bg by party */}
                    <span
                      className="px-1 md:px-1.5 py-0.5 rounded-md text-[9px] md:text-[11px] font-medium border"
                      style={partyBadgeStyle(r.party)}
                    >
                      <span className="md:hidden">
                        {(() => {
                          const label = partyLabel(r.party);
                          if (label.startsWith("Republican")) return "R";
                          if (label.startsWith("Democrat")) return "D";
                          if (label.startsWith("Independent")) return "I";
                          return label;
                        })()}
                      </span>
                      <span className="hidden md:inline">{partyLabel(r.party)}</span>
                    </span>

                    {/* State last, with district for House members */}
                    <span className="text-[9px] md:text-[11px]">
                      {r.chamber === "HOUSE"
                        ? `${stateCodeOf(r.state)}-${r.district || '1'}`
                        : stateCodeOf(r.state)}
                    </span>
                  </div>
                </div>
              </div>

              {gradeColumns.map((gradeCol, idx) => {
                const isOverall = idx === 0;
                const isSummaryMode = f.viewMode === "summary";

                return (
                  <>
                    <div
                      key={gradeCol.field}
                      className={clsx(
                        "td flex items-center justify-center",
                        idx === gradeColumns.length - 1 && !f.categories.has("AIPAC") && "border-r border-[#E7ECF2] dark:border-white/10",
                        isSummaryMode && "cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10"
                      )}
                      onClick={() => {
                        if (!isSummaryMode) return;

                        if (isOverall) {
                          // Overall grade opens member card
                          setSelected(r);
                        } else {
                          // Category grade switches to that category view
                          f.set({ viewMode: "category", categories: new Set([gradeCol.header]) });
                        }
                      }}
                      title={isSummaryMode ? (isOverall ? "Click to view member details" : `Click to view ${gradeCol.header} bills`) : undefined}
                    >
                      <GradeChip grade={String(r[gradeCol.field] || "N/A")} isOverall={isOverall} />
                    </div>

                    {/* Endorsements column - after Overall Grade in AIPAC view */}
                    {idx === 0 && f.categories.has("AIPAC") && (
                      <div className="td border-r border-[#E7ECF2] dark:border-white/10 px-2 flex items-center">
                        {(() => {
                          // Check if member has reject AIPAC commitment text (takes priority)
                          const rejectCommitment = r.reject_aipac_commitment;
                          const rejectLink = r.reject_aipac_link;
                          const hasRejectCommitment = rejectCommitment && String(rejectCommitment).length > 10;

                          if (hasRejectCommitment) {
                            return (
                              <div className="flex items-start gap-1">
                                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" role="img">
                                  <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" strokeWidth="0.5" stroke="#10B981" />
                                </svg>
                                <span className="text-xs text-slate-800 dark:text-white font-bold">
                                  {rejectLink && String(rejectLink).startsWith('http') ? (
                                    <a href={String(rejectLink)} target="_blank" rel="noopener noreferrer" className="hover:text-[#4B8CFB] underline">
                                      {rejectCommitment}
                                    </a>
                                  ) : (
                                    rejectCommitment
                                  )}
                                </span>
                              </div>
                            );
                          }

                          const pacData = pacDataMap.get(String(r.bioguide_id));
                          const aipac = isAipacEndorsed(pacData);
                          const dmfi = isDmfiEndorsed(pacData);

                          if (aipac && dmfi) {
                            return (
                              <div className="flex items-center gap-1">
                                <svg viewBox="0 0 20 20" className="h-3 w-3 flex-shrink-0" aria-hidden="true" role="img">
                                  <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                                </svg>
                                <span className="text-xs text-slate-800 dark:text-white">Supported by AIPAC and DMFI</span>
                              </div>
                            );
                          }

                          if (aipac || dmfi) {
                            return (
                              <div className="space-y-0.5">
                                {aipac && (
                                  <div className="flex items-center gap-1">
                                    <svg viewBox="0 0 20 20" className="h-3 w-3 flex-shrink-0" aria-hidden="true" role="img">
                                      <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                                    </svg>
                                    <span className="text-xs text-slate-800 dark:text-white">Supported by AIPAC</span>
                                  </div>
                                )}
                                {dmfi && (
                                  <div className="flex items-center gap-1">
                                    <svg viewBox="0 0 20 20" className="h-3 w-3 flex-shrink-0" aria-hidden="true" role="img">
                                      <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                                    </svg>
                                    <span className="text-xs text-slate-800 dark:text-white">Supported by DMFI</span>
                                  </div>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div className="flex items-center gap-1">
                              <svg viewBox="0 0 20 20" className="h-3 w-3 flex-shrink-0" aria-hidden="true" role="img">
                                <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                              </svg>
                              <span className="text-xs text-slate-800 dark:text-white">Not supported by AIPAC or DMFI</span>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                );
              })}

              {/* bill columns -> binary check / x / N/A for other chamber */}
              {billCols.map((c) => {
                // Handle AIPAC-specific columns
                if (c.startsWith("__aipac_") || c.startsWith("__dmfi_") || c === "__total_support" || c === "__election") {
                  const pacData = pacDataMap.get(String(r.bioguide_id));
                  // Use selectedElection instead of getElectionYear
                  const electionYear = selectedElection;

                  // Election column
                  if (c === "__election") {
                    return (
                      <div key={c} className="td !px-0 !py-0 flex items-center justify-center text-sm tabular border-b border-[#E7ECF2] dark:border-white/10">
                        {getElectionLabel(electionYear)}
                      </div>
                    );
                  }

                  // Total support column
                  if (c === "__total_support") {
                    let totalSupport = 0;
                    if (electionYear === "2024") {
                      totalSupport = (pacData?.aipac_total || 0) + (pacData?.dmfi_total || 0);
                    } else if (electionYear === "2025") {
                      totalSupport = (pacData?.aipac_total_2025 || 0) + (pacData?.dmfi_total_2025 || 0);
                    } else if (electionYear === "2022") {
                      totalSupport = (pacData?.aipac_total_2022 || 0) + (pacData?.dmfi_total_2022 || 0);
                    }
                    return (
                      <div key={c} className="td !px-0 !py-0 flex items-center justify-center text-sm tabular font-medium border-b border-[#E7ECF2] dark:border-white/10">
                        {totalSupport > 0 ? `$${totalSupport.toLocaleString()}` : "—"}
                      </div>
                    );
                  }

                  // Monetary columns - use appropriate year's data
                  let amount = 0;
                  if (electionYear === "2024") {
                    if (c === "__aipac_total") amount = pacData?.aipac_total || 0;
                    else if (c === "__dmfi_total") amount = pacData?.dmfi_total || 0;
                    else if (c === "__aipac_direct") amount = pacData?.aipac_direct_amount || 0;
                    else if (c === "__dmfi_direct") amount = pacData?.dmfi_direct || 0;
                    else if (c === "__aipac_earmark") amount = pacData?.aipac_earmark_amount || 0;
                    else if (c === "__aipac_ie") amount = pacData?.aipac_ie_total || 0;
                    else if (c === "__dmfi_ie") amount = pacData?.dmfi_ie_total || 0;
                  } else if (electionYear === "2025") {
                    if (c === "__aipac_total") amount = pacData?.aipac_total_2025 || 0;
                    else if (c === "__dmfi_total") amount = pacData?.dmfi_total_2025 || 0;
                    else if (c === "__aipac_direct") amount = pacData?.aipac_direct_amount_2025 || 0;
                    else if (c === "__dmfi_direct") amount = pacData?.dmfi_direct_2025 || 0;
                    else if (c === "__aipac_earmark") amount = pacData?.aipac_earmark_amount_2025 || 0;
                    else if (c === "__aipac_ie") amount = pacData?.aipac_ie_total_2025 || 0;
                    else if (c === "__dmfi_ie") amount = 0; // No dmfi_ie for 2025
                  } else if (electionYear === "2022") {
                    if (c === "__aipac_total") amount = pacData?.aipac_total_2022 || 0;
                    else if (c === "__dmfi_total") amount = pacData?.dmfi_total_2022 || 0;
                    else if (c === "__aipac_direct") amount = pacData?.aipac_direct_amount_2022 || 0;
                    else if (c === "__dmfi_direct") amount = pacData?.dmfi_direct_2022 || 0;
                    else if (c === "__aipac_earmark") amount = pacData?.aipac_earmark_amount_2022 || 0;
                    else if (c === "__aipac_ie") amount = pacData?.aipac_ie_total_2022 || 0;
                    else if (c === "__dmfi_ie") amount = pacData?.dmfi_ie_total_2022 || 0;
                  }

                  return (
                    <div key={c} className="td !px-0 !py-0 flex items-center justify-center text-sm tabular border-b border-[#E7ECF2] dark:border-white/10">
                      {amount > 0 ? `$${amount.toLocaleString()}` : "—"}
                    </div>
                  );
                }

                // Regular bill columns
                const valRaw = (r as Record<string, unknown>)[c];
                const val = Number(valRaw ?? 0);
                const meta = metaByCol.get(c);

                // Check if member was absent for this vote
                const absentCol = `${c}_absent`;
                const wasAbsent = Number((r as Record<string, unknown>)[absentCol] ?? 0) === 1;

                // Check if member cosponsored (for cosponsor bills)
                const cosponsorCol = `${c}_cosponsor`;
                const didCosponsor = Number((r as Record<string, unknown>)[cosponsorCol] ?? 0) === 1;

                // Try to determine the chamber for this column (bill or manual action)
                const inferredChamber = inferChamber(meta, c);

                // If we can determine a chamber and it doesn't match member's chamber -> N/A
                const notApplicable = inferredChamber && inferredChamber !== r.chamber;

                // Check if this is a manual action that doesn't apply
                // For manual actions: null/undefined/empty = not eligible (N/A)
                // For manual actions: 0 = eligible but took opposing action (show X)
                const isManualAction = meta?.type === "MANUAL";
                const manualActionNotApplicable = isManualAction && (valRaw === null || valRaw === undefined || valRaw === '');

                // Tooltip text
                // --- NEW: dash if this is the lesser item in a preferred pair and member hit the preferred one ---
                const showDashForPreferredPair = (() => {
                  const isPreferred = meta ? isTrue((meta as any).preferred) : false;
                  if (!meta?.pair_key || isPreferred || val > 0 || notApplicable) return false;
                  // find any other column in the same pair that is marked preferred (preferred===true) and the member scored on it
                  for (const other of billCols) {
                    if (other === c) continue;
                    const m2 = metaByCol.get(other);
                    if (m2?.pair_key === meta.pair_key && isTrue((m2 as any).preferred)) {
                      const v2 = Number((r as any)[other] ?? 0);
                      if (v2 > 0) return true; // got the preferred one → show dash here
                    }
                  }
                  return false;
                })();

                // Determine max points for this column
                // For regular bills, max points is just the points value from metadata
                // For pair_key items, the denominator depends on the item and whether they got points
                let maxPoints = Number(meta?.points ?? 0);
                if (meta?.pair_key) {
                  // Find the highest max points among all items in the pair and the OTHER item's max
                  let pairMax = 0;
                  let otherItemMax = 0;
                  for (const other of cols) {
                    const m2 = metaByCol.get(other);
                    if (m2?.pair_key === meta.pair_key) {
                      const otherMax = maxPointsByCol.get(other) || 0;
                      if (otherMax > pairMax) pairMax = otherMax;
                      // If this is not the current column, track the other item's max
                      if (other !== c) {
                        otherItemMax = otherMax;
                      }
                    }
                  }

                  const thisItemMax = maxPointsByCol.get(c) || 0;
                  const isPreferred = meta ? isTrue((meta as any).preferred) : false;

                  if (isPreferred) {
                    // Preferred item: if they got points show 10/10, if not show 0/7
                    if (val > 0) {
                      maxPoints = pairMax; // 10/10
                    } else {
                      maxPoints = pairMax - otherItemMax; // 0/7 (10 - 3, they can still get 3 from the other)
                    }
                  } else {
                    // Non-preferred item: if they got points show 3/3, if not show 0/3
                    maxPoints = thisItemMax; // Always use this item's own max (3)
                  }
                }

                // Determine the action label based on action_types and position
                const actionType = (meta as { action_types?: string })?.action_types || '';
                const isVote = actionType.includes('vote');
                const isCosponsor = actionType.includes('cosponsor');
                const position = (meta?.position_to_score || '').toUpperCase();
                const isSupport = position === 'SUPPORT';

                // Check if member voted "present" - got partial points (non-zero but not full)
                const fullPoints = Number(meta?.points ?? 0);
                const votedPresent = !wasAbsent && isVote && val > 0 && val < fullPoints;

                // Determine if member took the "good" action
                const noCosponsorBenefit = meta?.no_cosponsor_benefit === true ||
                                           meta?.no_cosponsor_benefit === 1 ||
                                           meta?.no_cosponsor_benefit === '1';
                let memberOk = val > 0;
                // Special handling for no_cosponsor_benefit bills we oppose
                if (isCosponsor && noCosponsorBenefit && !isSupport) {
                  memberOk = !didCosponsor;
                }

                let title: string;
                if (notApplicable) {
                  title = "Not applicable (different chamber)";
                } else if (manualActionNotApplicable) {
                  title = "Not applicable";
                } else if (votedPresent) {
                  title = "Voted Present";
                } else if (wasAbsent) {
                  title = "Did not vote";
                } else if (showDashForPreferredPair) {
                  title = "Not penalized: preferred item supported";
                } else {
                  // Determine the specific action description based on actual action taken
                  let actionDescription = '';
                  if (isCosponsor) {
                    // For cosponsor bills, use the _cosponsor column to determine actual action
                    actionDescription = didCosponsor ? 'Cosponsored' : 'Has not cosponsored';
                  } else if (isVote) {
                    // For vote bills, infer actual vote from points and NIAC position
                    const gotPoints = val > 0;
                    if (isSupport) {
                      // We support: got points = voted in favor, no points = voted against
                      actionDescription = gotPoints ? 'Voted in favor' : 'Voted against';
                    } else {
                      // We oppose: got points = voted against, no points = voted in favor
                      actionDescription = gotPoints ? 'Voted against' : 'Voted in favor';
                    }
                  } else {
                    // Fallback for other action types
                    actionDescription = val > 0 ? 'Support' : 'Oppose';
                  }
                  // Format points: show as +X, -X, or 0
                  let pointsText;
                  if (val > 0) {
                    pointsText = `+${val.toFixed(0)} points`;
                  } else if (val < 0) {
                    pointsText = `${val.toFixed(0)} points`;
                  } else {
                    // val = 0
                    // For no_cosponsor_benefit bills we oppose, not cosponsoring gives 0 points (neutral)
                    if (isCosponsor && noCosponsorBenefit && !isSupport && !didCosponsor) {
                      pointsText = '0 points';
                    } else {
                      pointsText = `-${maxPoints} points`;
                    }
                  }
                  title = `${actionDescription}, ${pointsText}`;
                }

                const bioguideId = String(r.bioguide_id || "");
                const isTooltipOpen = selectedCell?.rowId === bioguideId && selectedCell?.col === c;

                return (
                  <div
                    key={c}
                    className="group/cell relative td !px-0 !py-0 flex items-center justify-center border-b border-[#E7ECF2] dark:border-white/10 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCell(isTooltipOpen ? null : { rowId: bioguideId, col: c });
                    }}
                  >
                    {notApplicable || manualActionNotApplicable ? (
                      <span className="text-xs text-slate-400">N/A</span>
                    ) : votedPresent ? (
                      <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Present</span>
                    ) : wasAbsent ? (
                      <span className="text-lg leading-none text-slate-400">—</span>
                    ) : showDashForPreferredPair ? (
                      <span className="text-lg leading-none text-slate-400">—</span>
                    ) : (
                      <VoteIcon ok={memberOk} />
                    )}

                    {/* Small hover tooltip - only shown when main tooltip is closed */}
                    {!isTooltipOpen && (
                      <div className="opacity-0 group-hover/cell:opacity-100 pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white text-[10px] whitespace-nowrap transition-opacity duration-200 delay-700 shadow-sm border border-slate-200 dark:border-slate-600">
                        Click to learn more
                      </div>
                    )}

                    {/* Tooltip - shown on click */}
                    {isTooltipOpen && meta && (
                      <div className="pointer-events-auto absolute left-0 top-full mt-2 z-[100] w-[28rem] rounded-xl border border-[#E7ECF2] dark:border-white/10 bg-white dark:bg-[#1a2332] p-3 shadow-xl">
                        {/* Close button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCell(null);
                          }}
                          className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                          aria-label="Close"
                        >
                          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                          </svg>
                        </button>

                        <a
                          href={`/bill/${c}`}
                          className={clsx(
                            (meta.display_name || meta.short_title) ? "text-base font-bold" : "text-sm font-semibold",
                            "text-slate-900 dark:text-slate-100 hover:text-[#4B8CFB] dark:hover:text-[#4B8CFB] underline cursor-pointer pr-8"
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {meta.display_name || meta.short_title || c}
                        </a>
                        <div className="text-xs text-slate-500 dark:text-slate-300 mt-1">
                          <span className="font-medium">NIAC Action Position:</span> {formatPositionTooltip(meta)}
                        </div>
                        {meta.analysis && <div className="text-xs text-slate-700 dark:text-slate-200 mt-2 normal-case font-normal">{meta.analysis}</div>}
                        {meta.sponsor && <div className="text-xs text-slate-700 dark:text-slate-200 mt-2"><span className="font-medium">Sponsor:</span> {meta.sponsor}</div>}
                        {(meta.chamber || (meta.categories || "").split(";").filter(Boolean).length > 0) && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {meta.chamber && (
                              <span
                                className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold"
                                style={{
                                  color: '#64748b',
                                  backgroundColor: `${chamberColor(meta.chamber)}20`,
                                }}
                              >
                                {meta.chamber === 'HOUSE' ? 'House' : meta.chamber === 'SENATE' ? 'Senate' : meta.chamber}
                              </span>
                            )}
                            {(meta.categories || "").split(";").map((c:string)=>c.trim()).filter(Boolean).map((c:string)=>(
                              <span key={c} className="chip-xs">{c}</span>
                            ))}
                          </div>
                        )}

                        {/* Member-specific action line */}
                        <div className="mt-3 pt-3 border-t border-[#E7ECF2] dark:border-white/10 flex items-center gap-2">
                          {(() => {
                            const memberLastName = lastName(String(r.full_name || ""));
                            const capitalizedLastName = memberLastName.charAt(0).toUpperCase() + memberLastName.slice(1);
                            const title = r.chamber === "SENATE" ? "Sen." : "Rep.";

                            if (notApplicable || manualActionNotApplicable) {
                              return <span className="text-xs text-slate-400">N/A</span>;
                            } else if (votedPresent) {
                              return (
                                <>
                                  <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Present</span>
                                  <span className="text-xs text-slate-700 dark:text-slate-200">
                                    {title} {capitalizedLastName} voted Present
                                  </span>
                                </>
                              );
                            } else if (wasAbsent) {
                              return (
                                <>
                                  <span className="text-lg leading-none text-slate-400">—</span>
                                  <span className="text-xs text-slate-700 dark:text-slate-200">
                                    {title} {capitalizedLastName} did not vote
                                  </span>
                                </>
                              );
                            } else if (showDashForPreferredPair) {
                              return (
                                <>
                                  <span className="text-lg leading-none text-slate-400">—</span>
                                  <span className="text-xs text-slate-700 dark:text-slate-200">
                                    {title} {capitalizedLastName} not penalized (preferred item supported)
                                  </span>
                                </>
                              );
                            } else {
                              return (
                                <>
                                  <VoteIcon ok={memberOk} />
                                  <span className="text-xs text-slate-700 dark:text-slate-200">
                                    {title} {capitalizedLastName} {
                                      isCosponsor
                                        ? (didCosponsor ? "cosponsored" : "has not cosponsored")
                                        : isVote
                                          ? (memberOk ? "voted in favor" : "voted against")
                                          : (memberOk ? "supported" : "opposed")
                                    }
                                  </span>
                                </>
                              );
                            }
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Endorsements column - shown after bills in non-AIPAC views */}
              {!f.categories.has("AIPAC") && !f.categories.has("Civil Rights & Immigration") && (
                <div className="td border-r border-[#E7ECF2] dark:border-white/10 px-2 flex items-center">
                  {(() => {
                    // Check if member has reject AIPAC commitment text (takes priority)
                    const rejectCommitment = r.reject_aipac_commitment;
                    const rejectLink = r.reject_aipac_link;
                    const hasRejectCommitment = rejectCommitment && String(rejectCommitment).length > 10;

                    if (hasRejectCommitment) {
                      return (
                        <div className="flex items-start gap-1">
                          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" role="img">
                            <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" strokeWidth="0.5" stroke="#10B981" />
                          </svg>
                          <span className="text-xs text-slate-800 dark:text-white font-bold">
                            {rejectLink && String(rejectLink).startsWith('http') ? (
                              <a href={String(rejectLink)} target="_blank" rel="noopener noreferrer" className="hover:text-[#4B8CFB] underline">
                                {rejectCommitment}
                              </a>
                            ) : (
                              rejectCommitment
                            )}
                          </span>
                        </div>
                      );
                    }

                    const pacData = pacDataMap.get(String(r.bioguide_id));
                    const aipac = isAipacEndorsed(pacData);
                    const dmfi = isDmfiEndorsed(pacData);

                    if (aipac && dmfi) {
                      return (
                        <div className="flex items-center gap-1">
                          <svg viewBox="0 0 20 20" className="h-3 w-3 flex-shrink-0" aria-hidden="true" role="img">
                            <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                          </svg>
                          <span className="text-xs text-slate-800 dark:text-white">Supported by AIPAC and DMFI</span>
                        </div>
                      );
                    }

                    if (aipac || dmfi) {
                      return (
                        <div className="space-y-0.5">
                          {aipac && (
                            <div className="flex items-center gap-1">
                              <svg viewBox="0 0 20 20" className="h-3 w-3 flex-shrink-0" aria-hidden="true" role="img">
                                <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                              </svg>
                              <span className="text-xs text-slate-800 dark:text-white">Supported by AIPAC</span>
                            </div>
                          )}
                          {dmfi && (
                            <div className="flex items-center gap-1">
                              <svg viewBox="0 0 20 20" className="h-3 w-3 flex-shrink-0" aria-hidden="true" role="img">
                                <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                              </svg>
                              <span className="text-xs text-slate-800 dark:text-white">Supported by DMFI</span>
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="flex items-center gap-1">
                        <svg viewBox="0 0 20 20" className="h-3 w-3 flex-shrink-0" aria-hidden="true" role="img">
                          <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                        </svg>
                        <span className="text-xs text-slate-800 dark:text-white">Not supported by AIPAC or DMFI</span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Total/Max/Percent - shown for all views except AIPAC */}
              {!f.categories.has("AIPAC") && (
                <>
                  <div className="td tabular text-center font-medium flex items-center justify-center border-l border-[#E7ECF2] dark:border-white/10">
                    {Number(r[scoreSuffix ? `Total_${scoreSuffix}` : "Total"] || 0).toFixed(0)}
                  </div>
                  <div className="td tabular text-center flex items-center justify-center">
                    {Number(r[scoreSuffix ? `Max_Possible_${scoreSuffix}` : "Max_Possible"] || 0).toFixed(0)}
                  </div>
                  <div className="td flex items-center justify-center px-2">
                    <Progress value={Number(r[scoreSuffix ? `Percent_${scoreSuffix}` : "Percent"] || 0)} />
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}

function Filters({ filteredCount, metaByCol }: { categories: string[]; filteredCount: number; metaByCol: Map<string, Meta> }) {
  const f = useFilters();
  const [filtersExpanded, setFiltersExpanded] = useState(f.viewMode === "map");

  // Auto-expand filters in map view, collapse in other views
  useEffect(() => {
    if (f.viewMode === "map") {
      setFiltersExpanded(true);
    } else {
      setFiltersExpanded(false);
    }
  }, [f.viewMode]);

  // Territories without senators
  const territoriesWithoutSenate = ["VI", "PR", "DC", "AS", "GU", "MP"];

  return (
    <div className="mb-1 space-y-2">
      {/* First row: Map/Scorecard/Issues buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Desktop: Show both buttons (>450px) */}
        <div className="min-[450px]:inline-flex hidden rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-white dark:bg-white/5 p-1">
          <button
            onClick={() => f.set({ viewMode: "map", categories: new Set(), state: "" })}
            className={clsx(
              "px-3 h-9 rounded-md text-sm",
              f.viewMode === "map"
                ? "bg-[#4B8CFB] text-white"
                : "hover:bg-slate-50 dark:hover:bg-white/10"
            )}
          >
            Map
          </button>
          <button
            onClick={() => f.set({ viewMode: "summary", categories: new Set() })}
            className={clsx(
              "px-3 h-9 rounded-md text-sm",
              f.viewMode === "summary"
                ? "bg-[#4B8CFB] text-white"
                : (f.viewMode === "all" || f.viewMode === "category")
                ? "bg-[#93c5fd] text-slate-900"
                : "hover:bg-slate-50 dark:hover:bg-white/10"
            )}
          >
            Scorecard
          </button>
        </div>

        {/* Very narrow screens: Show dropdown (<450px) */}
        <select
          className={clsx(
            "max-[449px]:block hidden px-3 h-9 rounded-md text-sm border-0 cursor-pointer",
            (f.viewMode === "map" || f.viewMode === "summary" || f.viewMode === "all" || f.viewMode === "category")
              ? "bg-[#4B8CFB] text-white"
              : "bg-transparent hover:bg-slate-50 dark:hover:bg-white/10"
          )}
          value={f.viewMode === "map" ? "map" : (f.viewMode === "summary" || f.viewMode === "all" || f.viewMode === "category") ? "scorecard" : ""}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "map") {
              f.set({ viewMode: "map", categories: new Set(), state: "" });
            } else if (value === "scorecard") {
              f.set({ viewMode: "summary", categories: new Set() });
            }
          }}
        >
          <option value="">View</option>
          <option value="map">Map</option>
          <option value="scorecard">Scorecard</option>
        </select>

        {/* Desktop: Show individual issue buttons (≥985px) - Hide in map mode */}
        {f.viewMode !== "map" && (
        <div className="hidden min-[985px]:flex min-[985px]:items-center min-[985px]:gap-2">
          {/* Border around issue buttons */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10">
            {/* Individual issue buttons - bright blue when active */}
            <button
              onClick={() => f.set({ viewMode: "all", categories: new Set() })}
              className={clsx(
                "px-2 h-7 rounded-md text-sm",
                f.viewMode === "all" && f.categories.size === 0
                  ? "bg-[#4B8CFB] text-white"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              All
            </button>
            <button
              onClick={() => f.set({ viewMode: "category", categories: new Set(["Civil Rights & Immigration"]) })}
              className={clsx(
                "px-2 h-7 rounded-md text-sm whitespace-nowrap",
                f.categories.has("Civil Rights & Immigration")
                  ? "bg-[#4B8CFB] text-white"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              Civil Rights & Immigration
            </button>
            <button
              onClick={() => f.set({ viewMode: "category", categories: new Set(["Iran"]) })}
              className={clsx(
                "px-2 h-7 rounded-md text-sm",
                f.categories.has("Iran")
                  ? "bg-[#4B8CFB] text-white"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              Iran
            </button>
            <button
              onClick={() => f.set({ viewMode: "category", categories: new Set(["Israel-Gaza"]) })}
              className={clsx(
                "px-2 h-7 rounded-md text-sm",
                f.categories.has("Israel-Gaza")
                  ? "bg-[#4B8CFB] text-white"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              Israel-Gaza
            </button>
            <button
              onClick={() => f.set({ viewMode: "category", categories: new Set(["AIPAC"]) })}
              className={clsx(
                "px-2 h-7 rounded-md text-sm",
                f.categories.has("AIPAC")
                  ? "bg-[#4B8CFB] text-white"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              AIPAC
            </button>
          </div>
        </div>
        )}

        {/* Mobile: Show dropdown (<985px) - narrower on very small screens - Hide in map mode */}
        {f.viewMode !== "map" && (
        <select
          className={clsx(
            "max-[984px]:block hidden px-3 h-9 rounded-md text-sm border-0 cursor-pointer",
            "max-[500px]:px-2 max-[500px]:max-w-[120px] max-[500px]:text-xs",
            f.viewMode === "all" || f.viewMode === "category"
              ? "bg-[#4B8CFB] text-white"
              : "bg-transparent hover:bg-slate-50 dark:hover:bg-white/10"
          )}
          value={
            f.viewMode === "all" && f.categories.size === 0
              ? "All"
              : f.categories.size > 0
              ? Array.from(f.categories)[0]
              : ""
          }
          onChange={(e) => {
            const value = e.target.value;
            if (value === "" || value === "All") {
              f.set({ viewMode: "all", categories: new Set() });
            } else {
              f.set({ viewMode: "category", categories: new Set([value]) });
            }
          }}
        >
          <option value="">Issues</option>
          <option value="All">All</option>
          <option value="Civil Rights & Immigration">Civil Rights & Immigration</option>
          <option value="Iran">Iran</option>
          <option value="Israel-Gaza">Israel-Gaza</option>
          <option value="AIPAC">AIPAC</option>
        </select>
        )}

        {/* Search - right-aligned for both map and scorecard */}
        <div className="ml-auto">
          <UnifiedSearch filteredCount={filteredCount} metaByCol={metaByCol} isMapView={f.viewMode === "map"} />
        </div>
      </div>

      {/* Second row: Map view - chamber filter */}
      {f.viewMode === "map" && (
        <div className="flex items-center gap-3">
          <Segmented
            options={["All", "House","Senate"]}
            value={f.chamber ? (f.chamber.charAt(0) + f.chamber.slice(1).toLowerCase()) : "All"}
            onChange={(v)=>{
              if (v === "All") {
                f.set({ chamber: "" });
              } else {
                f.set({ chamber: v.toUpperCase() as any });
              }
            }}
          />
        </div>
      )}

      {/* Second row: Scorecard view - Filters */}
      {f.viewMode !== "map" && (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          className="flex items-center gap-2 text-sm text-slate-700 dark:text-white hover:text-slate-900 dark:hover:text-slate-300"
        >
          <svg
            className={clsx("w-4 h-4 transition-transform", filtersExpanded && "rotate-90")}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className={clsx(filtersExpanded && "max-[500px]:hidden")}>Filters</span>
          {(f.chamber || f.party || f.state) && !filtersExpanded && (
            <span className="text-xs text-slate-500">
              ({[
                f.chamber && f.chamber,
                f.party && f.party,
                f.state && f.state
              ].filter(Boolean).join(", ")})
            </span>
          )}
        </button>

        {/* Clear button when filters are active but collapsed */}
        {(f.chamber || f.party || f.state || f.search || f.myLawmakers.length > 0) && !filtersExpanded && (
          <button
            onClick={() => f.set({ chamber: "", party: "", state: "", search: "", myLawmakers: [] })}
            className="chip-outline text-slate-700 dark:text-slate-800 hover:bg-slate-100 dark:hover:bg-white/10 !text-xs !px-2 !h-8"
            title="Clear all filters"
          >
            ✕
          </button>
        )}

        <div
          className={clsx(
            "flex items-center gap-2 overflow-hidden transition-all duration-300 ease-out",
            filtersExpanded ? "max-w-[800px] opacity-100" : "max-w-0 opacity-0"
          )}
        >
          <Segmented
            options={["All", "House","Senate"]}
            value={f.chamber ? (f.chamber.charAt(0) + f.chamber.slice(1).toLowerCase()) : "All"}
            onChange={(v)=>{
              if (v === "All") {
                f.set({ chamber: "" });
              } else {
                f.set({ chamber: v.toUpperCase() as any });
              }
            }}
          />
          <select className="select !text-xs !h-8 !px-2" value={f.party || ""} onChange={e=>f.set({party:e.target.value as any})}>
            <option value="">Party</option>
            <option>Democratic</option><option>Republican</option><option>Independent</option>
          </select>
          <select
            className="select !text-xs !h-8 !px-2 !max-w-[140px]"
            value={f.state || ""}
            onChange={(e) => {
              const selectedState = e.target.value;
              // If selecting a territory without senate, automatically switch to House
              if (selectedState && territoriesWithoutSenate.includes(selectedState)) {
                f.set({ state: selectedState, chamber: "HOUSE" });
              } else {
                f.set({ state: selectedState });
              }
            }}
          >
            <option value="">State</option>
            {STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
          {(f.chamber || f.party || f.state || f.search || f.myLawmakers.length > 0) && (
            <button
              onClick={() => f.set({ chamber: "", party: "", state: "", search: "", myLawmakers: [] })}
              className="chip-outline text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 !text-xs !px-2 !h-8"
              title="Clear all filters"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function UnifiedSearch({ filteredCount, metaByCol, isMapView }: { filteredCount: number; metaByCol: Map<string, Meta>; isMapView: boolean }) {
  const f = useFilters();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [searchType, setSearchType] = useState<"zip" | "name" | "legislation">(isMapView ? "zip" : "name");
  const [searchValue, setSearchValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleZipSearch = async () => {
    if (!searchValue.trim()) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/find-lawmakers?address=${encodeURIComponent(searchValue)}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to find lawmakers');
        return;
      }

      if (data.lawmakers && data.lawmakers.length > 0) {
        const names = data.lawmakers.map((l: any) => l.name);
        // If in map mode, automatically switch to summary mode when searching
        if (f.viewMode === "map") {
          f.set({ myLawmakers: names, viewMode: "summary" });
        } else {
          f.set({ myLawmakers: names });
        }
        setSearchValue("");
        setIsOpen(false);
      } else {
        setError('No lawmakers found for this address');
      }
    } catch {
      setError('Failed to find lawmakers');
    } finally {
      setLoading(false);
    }
  };

  const handleBillSearch = () => {
    if (!searchValue.trim()) return;

    const query = searchValue.toLowerCase().trim();

    // Search through all columns in metaByCol
    let foundColumn = "";
    for (const [column, meta] of metaByCol.entries()) {
      const billNumber = (meta.bill_number || "").toLowerCase();
      const displayName = (meta.display_name || "").toLowerCase();
      const shortTitle = (meta.short_title || "").toLowerCase();

      if (billNumber.includes(query) || displayName.includes(query) || shortTitle.includes(query)) {
        foundColumn = column;
        break;
      }
    }

    if (foundColumn) {
      // Navigate to bill page
      router.push(`/bill/${encodeURIComponent(foundColumn)}`);
    } else {
      setError('No bill found matching your search');
    }
  };

  const handleSearch = () => {
    if (searchType === "zip") {
      handleZipSearch();
    } else if (searchType === "name") {
      // If in map mode, automatically switch to summary mode when searching
      if (f.viewMode === "map") {
        f.set({ search: searchValue, viewMode: "summary" });
      } else {
        f.set({ search: searchValue });
      }
      setIsOpen(false);
    } else if (searchType === "legislation") {
      handleBillSearch();
    }
  };

  const handleClear = () => {
    f.set({ myLawmakers: [], search: "" });
    setSearchValue("");
    setError("");
  };

  const getPlaceholder = () => {
    if (isMapView) return "Enter zipcode...";
    if (searchType === "zip") return "Enter zip code…";
    if (searchType === "name") return "Enter lawmaker name…";
    return "Enter bill number or title…";
  };

  const isActive = f.myLawmakers.length > 0 || f.search.length > 0;

  // Map view: show simple inline search
  if (isMapView) {
    return (
      <div className="relative flex items-center gap-2">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={getPlaceholder()}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
            className="pl-10 pr-4 h-9 text-sm border border-[#E7ECF2] dark:border-white/10 rounded-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#4B8CFB] focus:border-transparent min-w-[250px]"
          />
        </div>
        {loading ? (
          <div className="text-xs text-slate-500">Loading...</div>
        ) : error ? (
          <div className="text-xs text-red-600">{error}</div>
        ) : isActive ? (
          <button
            onClick={handleClear}
            className="chip bg-[#4B8CFB] text-white hover:bg-[#3B7CEB] text-xs"
            title="Clear search"
          >
            Showing {filteredCount} ✕
          </button>
        ) : null}
      </div>
    );
  }

  // Scorecard view: show dropdown button
  return (
    <div className="relative">
      {isActive ? (
        <button
          className="chip bg-[#4B8CFB] text-white hover:bg-[#3B7CEB]"
          onClick={handleClear}
          title="Clear search"
        >
          {f.myLawmakers.length > 0 ? `Showing ${filteredCount} ✕` : `Searching "${f.search}" ✕`}
        </button>
      ) : (
        <button
          className="chip-outline flex items-center gap-1"
          onClick={() => setIsOpen(!isOpen)}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      )}

      {isOpen && (
        <div className="absolute top-full mt-1 right-0 z-50 bg-white dark:bg-slate-800 border border-[#E7ECF2] dark:border-white/10 rounded-lg shadow-lg p-4 min-w-[300px]">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1 text-slate-700 dark:text-slate-300">
                Search by:
              </label>
              <div className="flex gap-2">
                <button
                  className={clsx(
                    "px-3 py-1.5 text-xs rounded-md",
                    searchType === "zip"
                      ? "bg-[#4B8CFB] text-white"
                      : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"
                  )}
                  onClick={() => setSearchType("zip")}
                >
                  Location
                </button>
                <button
                  className={clsx(
                    "px-3 py-1.5 text-xs rounded-md",
                    searchType === "name"
                      ? "bg-[#4B8CFB] text-white"
                      : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"
                  )}
                  onClick={() => setSearchType("name")}
                >
                  Lawmaker
                </button>
                <button
                  className={clsx(
                    "px-3 py-1.5 text-xs rounded-md",
                    searchType === "legislation"
                      ? "bg-[#4B8CFB] text-white"
                      : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"
                  )}
                  onClick={() => setSearchType("legislation")}
                >
                  Bill
                </button>
              </div>
            </div>

            <div>
              <input
                type="text"
                placeholder={getPlaceholder()}
                className="input !w-full"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                disabled={loading}
                autoFocus
              />
            </div>

            {error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-2 py-1">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                className="flex-1 px-3 py-1.5 text-sm bg-[#4B8CFB] text-white rounded-md hover:bg-[#3B7CEB] disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleSearch}
                disabled={loading || !searchValue.trim()}
              >
                {loading ? "Searching..." : "Search"}
              </button>
              <button
                className="px-3 py-1.5 text-sm border border-[#E7ECF2] dark:border-white/10 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700"
                onClick={() => {
                  setIsOpen(false);
                  setSearchValue("");
                  setError("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({
  col,
  meta,
  onSort,
  active,
  dir,
}: {
  col: string;
  meta?: Meta;
  onSort?: () => void;
  active?: boolean;
  dir?: "GOOD_FIRST" | "BAD_FIRST";
}) {
  const router = useRouter();
  return (
    <div className="th group group/header relative select-none flex flex-col max-w-[14rem]">
      {/* Bill title - clickable to view details with fixed 4-line height */}
      <div className="h-[4.5rem] flex items-start justify-start overflow-hidden">
        <span
          className="line-clamp-4 cursor-pointer hover:text-[#4B8CFB] transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            if (meta) {
              router.push(`/bill/${encodeURIComponent(col)}`);
            }
          }}
        >
          {meta ? (meta.short_title || meta.display_name) : col}
        </span>
      </div>

      {/* Position - sortable, always in uniform position */}
      {meta && meta.position_to_score && (
        <span
          className={clsx(
            "text-[10px] text-slate-700 dark:text-slate-200 font-light mt-0.5 flex items-center gap-1",
            onSort && "cursor-pointer hover:text-slate-900 dark:hover:text-slate-100"
          )}
          onClick={onSort}
          title={onSort ? "Click to sort by this column (toggle ✓ first / ✕ first)" : undefined}
        >
          {(() => {
            const position = (meta?.position_to_score || '').toUpperCase();
            const isSupport = position === 'SUPPORT';
            const label = isSupport ? 'Support' : 'Oppose';
            const icon = isSupport ? '✓' : '✗';

            return (
              <>
                {icon}{' '}
                <span
                  className="px-1 py-0.5 rounded font-medium"
                  style={meta?.chamber ? { backgroundColor: `${chamberColor(meta.chamber)}40` } : undefined}
                >
                  {label}
                </span>
              </>
            );
          })()}
          {onSort && (
            <span className={clsx(
              "text-[10px]",
              active ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover/header:opacity-100"
            )}>
              {dir === "GOOD_FIRST" ? "▲" : "▼"}
            </span>
          )}
        </span>
      )}

      {/* Tooltip */}
      {meta && (
        <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute left-0 top-full mt-2 z-[100] w-[28rem] rounded-xl border border-[#E7ECF2] dark:border-white/10 bg-white dark:bg-[#1a2332] p-3 shadow-xl transition-opacity duration-200">
          <div className={clsx(
            (meta.display_name || meta.short_title) ? "text-base font-bold" : "text-sm font-semibold",
            "text-slate-900 dark:text-slate-100"
          )}>
            {meta.display_name || meta.short_title || col}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-300 mt-1">
            <span className="font-medium">NIAC Action Position:</span> {formatPositionTooltip(meta)}
          </div>
          {meta.analysis && <div className="text-xs text-slate-700 dark:text-slate-200 mt-2 normal-case font-normal">{meta.analysis}</div>}
          {meta.sponsor && <div className="text-xs text-slate-700 dark:text-slate-200 mt-2"><span className="font-medium">Sponsor:</span> {meta.sponsor}</div>}
          {(meta.chamber || (meta.categories || "").split(";").filter(Boolean).length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {meta.chamber && (
                <span
                  className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold"
                  style={{
                    color: '#64748b',
                    backgroundColor: `${chamberColor(meta.chamber)}20`,
                  }}
                >
                  {meta.chamber === 'HOUSE' ? 'House' : meta.chamber === 'SENATE' ? 'Senate' : meta.chamber}
                </span>
              )}
              {(meta.categories || "").split(";").map((c:string)=>c.trim()).filter(Boolean).map((c:string)=>(
                <span key={c} className="chip-xs">{c}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value?: string;
  onChange: (v: string) => void;
}) {
  const current = value || options[0];
  return (
    <div className="inline-flex rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-white dark:bg-white/5 p-0.5">
      {options.map((opt) => {
        const isActive = current === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={clsx(
              "px-2 h-7 rounded-md text-xs",
              isActive
                ? "bg-[#4B8CFB] text-white"
                : "hover:bg-slate-50 dark:hover:bg-white/10"
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function Progress({ value }:{ value:number }) {
  const percent = (value * 100).toFixed(0);
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 rounded-full bg-[#E7ECF2] overflow-hidden">
        <div className="h-2 rounded-full" style={{ width: `${percent}%`, background: "#0FDDAA" }} />
      </div>
      <span className="text-xs tabular text-slate-800 dark:text-white min-w-[32px]">{percent}%</span>
    </div>
  );
}

function GradeChip({ grade, isOverall }:{ grade:string; isOverall?: boolean }) {
  const color = grade.startsWith("A") ? "#30558C" // dark blue
    : grade.startsWith("B") ? "#93c5fd" // light blue
    : grade.startsWith("C") ? "#b6dfcc" // mint green
    : grade.startsWith("D") ? "#D4B870" // tan/gold
    : "#C38B32"; // bronze/gold for F
  const opacity = isOverall ? "FF" : "E6"; // fully opaque for overall, 90% opaque (10% transparent) for others
  const textColor = grade.startsWith("A") ? "#ffffff" // white for A grades
    : grade.startsWith("B") ? "#4b5563" // dark grey for B grades
    : grade.startsWith("C") ? "#4b5563" // dark grey for C grades
    : "#4b5563"; // dark grey for D and F grades
  const border = isOverall ? "2px solid #000000" : "none"; // black border for overall grades
  return <span className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold min-w-[2.75rem]"
    style={{ background: `${color}${opacity}`, color: textColor, border }}>{grade}</span>;
}

function VoteIcon({ ok }: { ok: boolean }) {
  if (ok) {
    // checkmark
    return (
      <svg
        viewBox="0 0 20 20"
        className="h-5 w-5"
        aria-hidden="true"
        role="img"
      >
        <path
          d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z"
          fill="#10B981"
        />
      </svg>
    );
  }
  // X mark
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-5 w-5"
      aria-hidden="true"
      role="img"
    >
      <path
        d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z"
        fill="#F97066"
      />
    </svg>
  );
}

