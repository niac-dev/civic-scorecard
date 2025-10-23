/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { loadData } from "@/lib/loadCsv";
import { useFilters } from "@/lib/store";
import type { Row, Meta } from "@/lib/types";
import USMap from "@/components/USMap";
import Papa from "papaparse";

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
  // If chamber is explicitly set (even to empty), respect that
  if (explicit === "HOUSE" || explicit === "SENATE") return explicit as any;
  // If chamber is explicitly empty in metadata, don't infer from bill number
  if (meta && meta.chamber !== undefined && explicit === "") return "";
  // Otherwise infer from bill number prefix
  if (bn.startsWith("H")) return "HOUSE";
  if (bn.startsWith("S")) return "SENATE";
  return "";
}

function formatPositionScorecard(meta: Meta | undefined): string {
  const position = (meta?.position_to_score || '').toUpperCase();
  const actionType = (meta as { action_types?: string })?.action_types || '';
  const isCosponsor = actionType.includes('cosponsor');
  const isSupport = position === 'SUPPORT';

  if (isCosponsor) {
    return isSupport ? '✓ Cosponsor' : '✗ Cosponsor';
  } else {
    return isSupport ? '✓ Vote' : '✗ Vote';
  }
}

function formatPositionTooltip(meta: Meta | undefined): string {
  const position = (meta?.position_to_score || '').toUpperCase();
  const actionType = (meta as { action_types?: string })?.action_types || '';
  const isCosponsor = actionType.includes('cosponsor');
  const isSupport = position === 'SUPPORT';

  if (isCosponsor) {
    return isSupport ? 'Support Cosponsorship' : 'Oppose Cosponsorship';
  } else {
    return isSupport ? 'Vote in Favor' : 'Vote Against';
  }
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

// Check if member is endorsed by AIPAC based on PAC data
function isAipacEndorsed(pacData: PacData | undefined): boolean {
  if (!pacData) return false;
  return (
    pacData.aipac_featured === 1 ||
    pacData.aipac_direct_amount > 0 ||
    pacData.aipac_ie_support > 0
  );
}

// Check if member is endorsed by DMFI based on PAC data
function isDmfiEndorsed(pacData: PacData | undefined): boolean {
  if (!pacData) return false;
  return (
    pacData.dmfi_website === 1 ||
    pacData.dmfi_direct > 0 ||
    pacData.dmfi_ie_support > 0
  );
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
  const [zipcode, setZipcode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (!zipcode.trim()) {
      setError("Please enter a zipcode");
      return;
    }

    // Basic zipcode validation
    if (!/^\d{5}(-\d{4})?$/.test(zipcode.trim())) {
      setError("Please enter a valid 5-digit zipcode");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`https://ziptasticapi.com/${zipcode.trim()}`);
      if (!response.ok) {
        throw new Error("Unable to find location");
      }

      const data = await response.json();

      if (data.state) {
        // Switch to summary view and filter by state
        f.set({ state: data.state, viewMode: "summary" });
      } else {
        setError("Unable to determine state from zipcode");
      }
    } catch (err) {
      setError("Unable to find location. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Enter your zipcode"
          className="input flex-1"
          value={zipcode}
          onChange={(e) => setZipcode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          disabled={loading}
          maxLength={10}
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

  // Ref for the scrollable table container
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  // Scroll to top when filters change
  useEffect(() => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [f.chamber, f.party, f.state, f.search, f.categories, f.myLawmakers, f.viewMode]);

  const filtered = useMemo(() => {
    let out = rows;
    if (f.chamber) out = out.filter(r => r.chamber === f.chamber);
    if (f.party) out = out.filter(r => r.party === f.party);
    if (f.state) out = out.filter(r => stateCodeOf(r.state) === f.state);
    if (f.search) {
      const q = f.search.toLowerCase();
      out = out.filter(r => (r.full_name||"").toLowerCase().includes(q));
    }
    if (f.myLawmakers.length > 0) {
      // Fuzzy match by last name - handles middle names/initials
      out = out.filter(r => {
        const dbName = (r.full_name as string) || '';
        return f.myLawmakers.some(apiName => {
          // Extract last name from both (before the comma)
          const dbLast = dbName.split(',')[0]?.trim().toLowerCase();
          const apiLast = apiName.split(',')[0]?.trim().toLowerCase();
          return dbLast === apiLast;
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
    // Sort by AIPAC/DMFI support
    if (sortCol === "__aipac") {
      const supportedFirst = sortDir === "GOOD_FIRST";
      return [...filtered].sort((a, b) => {
        const pacA = pacDataMap.get(String(a.bioguide_id));
        const pacB = pacDataMap.get(String(b.bioguide_id));
        const aipacA = isAipacEndorsed(pacA);
        const dmfiA = isDmfiEndorsed(pacA);
        const aipacB = isAipacEndorsed(pacB);
        const dmfiB = isDmfiEndorsed(pacB);

        // Simple check: is supported by either AIPAC or DMFI?
        const supportedA = aipacA || dmfiA;
        const supportedB = aipacB || dmfiB;

        // First sort by supported status
        if (supportedA !== supportedB) {
          if (supportedFirst) {
            return supportedA ? -1 : 1; // Supported first
          } else {
            return supportedA ? 1 : -1; // Not supported first
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
          const yearA = getElectionYear(pacA);
          const yearB = getElectionYear(pacB);
          if (yearA === "2024") valA = (pacA?.aipac_total || 0) + (pacA?.dmfi_total || 0);
          else if (yearA === "2025") valA = (pacA?.aipac_total_2025 || 0) + (pacA?.dmfi_total_2025 || 0);
          else if (yearA === "2022") valA = (pacA?.aipac_total_2022 || 0) + (pacA?.dmfi_total_2022 || 0);
          if (yearB === "2024") valB = (pacB?.aipac_total || 0) + (pacB?.dmfi_total || 0);
          else if (yearB === "2025") valB = (pacB?.aipac_total_2025 || 0) + (pacB?.dmfi_total_2025 || 0);
          else if (yearB === "2022") valB = (pacB?.aipac_total_2022 || 0) + (pacB?.dmfi_total_2022 || 0);
        } else if (sortCol === "__aipac_endorsed") {
          valA = isTruthy(a.aipac_supported) ? 1 : 0;
          valB = isTruthy(b.aipac_supported) ? 1 : 0;
        } else if (sortCol === "__dmfi_endorsed") {
          valA = isTruthy(a.dmfi_supported) ? 1 : 0;
          valB = isTruthy(b.dmfi_supported) ? 1 : 0;
        } else if (sortCol === "__election") {
          // Sort by election year (2024 first, then 2025, then 2022)
          const yearA = getElectionYear(pacA);
          const yearB = getElectionYear(pacB);
          valA = yearA === "2024" ? 3 : yearA === "2025" ? 2 : yearA === "2022" ? 1 : 0;
          valB = yearB === "2024" ? 3 : yearB === "2025" ? 2 : yearB === "2022" ? 1 : 0;
        } else if (sortCol === "__aipac_total") {
          const yearA = getElectionYear(pacA);
          const yearB = getElectionYear(pacB);
          if (yearA === "2024") valA = pacA?.aipac_total || 0;
          else if (yearA === "2025") valA = pacA?.aipac_total_2025 || 0;
          else if (yearA === "2022") valA = pacA?.aipac_total_2022 || 0;
          if (yearB === "2024") valB = pacB?.aipac_total || 0;
          else if (yearB === "2025") valB = pacB?.aipac_total_2025 || 0;
          else if (yearB === "2022") valB = pacB?.aipac_total_2022 || 0;
        } else if (sortCol === "__dmfi_total") {
          const yearA = getElectionYear(pacA);
          const yearB = getElectionYear(pacB);
          if (yearA === "2024") valA = pacA?.dmfi_total || 0;
          else if (yearA === "2025") valA = pacA?.dmfi_total_2025 || 0;
          else if (yearA === "2022") valA = pacA?.dmfi_total_2022 || 0;
          if (yearB === "2024") valB = pacB?.dmfi_total || 0;
          else if (yearB === "2025") valB = pacB?.dmfi_total_2025 || 0;
          else if (yearB === "2022") valB = pacB?.dmfi_total_2022 || 0;
        } else if (sortCol === "__aipac_direct") {
          const yearA = getElectionYear(pacA);
          const yearB = getElectionYear(pacB);
          if (yearA === "2024") valA = pacA?.aipac_direct_amount || 0;
          else if (yearA === "2025") valA = pacA?.aipac_direct_amount_2025 || 0;
          else if (yearA === "2022") valA = pacA?.aipac_direct_amount_2022 || 0;
          if (yearB === "2024") valB = pacB?.aipac_direct_amount || 0;
          else if (yearB === "2025") valB = pacB?.aipac_direct_amount_2025 || 0;
          else if (yearB === "2022") valB = pacB?.aipac_direct_amount_2022 || 0;
        } else if (sortCol === "__dmfi_direct") {
          const yearA = getElectionYear(pacA);
          const yearB = getElectionYear(pacB);
          if (yearA === "2024") valA = pacA?.dmfi_direct || 0;
          else if (yearA === "2025") valA = pacA?.dmfi_direct_2025 || 0;
          else if (yearA === "2022") valA = pacA?.dmfi_direct_2022 || 0;
          if (yearB === "2024") valB = pacB?.dmfi_direct || 0;
          else if (yearB === "2025") valB = pacB?.dmfi_direct_2025 || 0;
          else if (yearB === "2022") valB = pacB?.dmfi_direct_2022 || 0;
        } else if (sortCol === "__aipac_earmark") {
          const yearA = getElectionYear(pacA);
          const yearB = getElectionYear(pacB);
          if (yearA === "2024") valA = pacA?.aipac_earmark_amount || 0;
          else if (yearA === "2025") valA = pacA?.aipac_earmark_amount_2025 || 0;
          else if (yearA === "2022") valA = pacA?.aipac_earmark_amount_2022 || 0;
          if (yearB === "2024") valB = pacB?.aipac_earmark_amount || 0;
          else if (yearB === "2025") valB = pacB?.aipac_earmark_amount_2025 || 0;
          else if (yearB === "2022") valB = pacB?.aipac_earmark_amount_2022 || 0;
        } else if (sortCol === "__aipac_ie") {
          const yearA = getElectionYear(pacA);
          const yearB = getElectionYear(pacB);
          if (yearA === "2024") valA = pacA?.aipac_ie_total || 0;
          else if (yearA === "2025") valA = pacA?.aipac_ie_total_2025 || 0;
          else if (yearA === "2022") valA = pacA?.aipac_ie_total_2022 || 0;
          if (yearB === "2024") valB = pacB?.aipac_ie_total || 0;
          else if (yearB === "2025") valB = pacB?.aipac_ie_total_2025 || 0;
          else if (yearB === "2022") valB = pacB?.aipac_ie_total_2022 || 0;
        } else if (sortCol === "__dmfi_ie") {
          const yearA = getElectionYear(pacA);
          const yearB = getElectionYear(pacB);
          if (yearA === "2024") valA = pacA?.dmfi_ie_total || 0;
          else if (yearA === "2025") valA = 0; // No dmfi_ie for 2025
          else if (yearA === "2022") valA = pacA?.dmfi_ie_total_2022 || 0;
          if (yearB === "2024") valB = pacB?.dmfi_ie_total || 0;
          else if (yearB === "2025") valB = 0; // No dmfi_ie for 2025
          else if (yearB === "2022") valB = pacB?.dmfi_ie_total_2022 || 0;
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
      // Use natural sort to handle numbers correctly (e.g., #1 before #2)
      const nameA = metaA?.display_name || metaA?.short_title || a;
      const nameB = metaB?.display_name || metaB?.short_title || b;
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

      // Add __aipac_endorsed column at the end for all categories EXCEPT Civil Rights, Travel & Immigration, and AIPAC
      const selectedCategory = Array.from(f.categories)[0];
      const shouldIncludeAipacEndorsed = selectedCategory !== "Civil Rights" &&
                                          selectedCategory !== "Travel & Immigration" &&
                                          selectedCategory !== "AIPAC";

      if (shouldIncludeAipacEndorsed) {
        out.push("__aipac_endorsed");
      }
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
    // Member column: 50vw on small screens (max 50% of viewport), 280px on larger screens
    const memberCol = "min(50vw, 280px)";
    // In summary mode: member col + grade cols + endorsements col + total/max/percent
    if (f.viewMode === "summary") {
      return `${memberCol} ${gradesPart} minmax(140px, 140px) minmax(160px, 160px) minmax(120px, 120px) minmax(100px, 100px)`;
    }
    // AIPAC mode: member col + grade cols + dynamic bill cols (no endorsements, no totals)
    if (f.categories.has("AIPAC")) {
      return `${memberCol} ${gradesPart} ${billsPart}`;
    }
    // member col + grade cols + dynamic bill cols + endorsements col + totals
    return `${memberCol} ${gradesPart} ${billsPart} minmax(140px, 140px) minmax(160px, 160px) minmax(120px, 120px) minmax(100px, 100px)`;
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

      // Map average grade rank to color (dark navy = A, light grey = F)
      if (avgRank <= 2) { // A+ to A-
        colors[state] = "#050a30"; // dark navy blue
      } else if (avgRank <= 5) { // B+ to B-
        colors[state] = "#30558d"; // medium blue
      } else if (avgRank <= 8) { // C+ to C-
        colors[state] = "#93c5fd"; // light blue
      } else if (avgRank <= 11) { // D+ to D-
        colors[state] = "#d1d5db"; // medium grey
      } else { // F
        colors[state] = "#f3f4f6"; // very light grey
      }
    });

    return colors;
  }, [rows]);

  return (
    <div className="space-y-4">
      <Filters categories={categories} filteredCount={sorted.length} metaByCol={metaByCol} />
      {selected && (
        <LawmakerCard
          row={selected}
          billCols={allBillCols}
          metaByCol={metaByCol}
          categories={categories}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Map View */}
      {f.viewMode === "map" && (
        <div className="card p-6">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Find your lawmakers</h2>
            <div className="max-w-md mx-auto">
              <ZipcodeSearch />
            </div>
          </div>
          <USMap
            stateColors={stateColors}
            onStateClick={(stateCode) => {
              f.set({ state: stateCode, viewMode: "summary" });
            }}
          />
        </div>
      )}

      {/* Table View */}
      {f.viewMode !== "map" && (
        <div className="card overflow-visible">
          <div ref={tableScrollRef} className="overflow-auto max-h-[70vh]">
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
                  setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                } else {
                  setSortCol("__member");
                  setSortDir("GOOD_FIRST");
                }
              }}
              title="Click to sort by member (toggle A→Z / Z→A)"
            >
              Member
              <span className={clsx(
                "absolute right-2 top-1.5 text-[10px]",
                sortCol === "__member" ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100"
              )}>
                {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
              </span>
            </div>
            {gradeColumns.map((gradeCol, idx) => {
              const isOverallGrade = gradeCol.header === "Overall Grade";
              const isSummaryMode = f.viewMode === "summary";
              const isCategoryHeader = isSummaryMode && !isOverallGrade;

              return (
                <div
                  key={gradeCol.field}
                  className={clsx(
                    "th text-center cursor-pointer relative group",
                    idx === gradeColumns.length - 1 && "border-r border-[#E7ECF2] dark:border-white/10"
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
                  <div className="flex flex-col items-center">
                    <div>{gradeCol.header}</div>
                    {isCategoryHeader && (
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 mt-0.5">
                        <span>sort</span>
                        <span>▼</span>
                      </div>
                    )}
                  </div>
                  {!isCategoryHeader && (
                    <span className={clsx(
                      "absolute right-2 top-1.5 text-[10px]",
                      sortCol === String(gradeCol.field) ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100"
                    )}>
                      {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                    </span>
                  )}
                </div>
              );
            })}
            {billCols.map((c) => {
              // Handle AIPAC-specific columns
              if (c.startsWith("__aipac_") || c.startsWith("__dmfi_") || c === "__total_support" || c === "__election") {
                const headerLabels: Record<string, string> = {
                  "__election": "Election",
                  "__total_support": "Total AIPAC/DMFI Support",
                  "__aipac_endorsed": "Endorsed by AIPAC",
                  "__dmfi_endorsed": "Endorsed by DMFI",
                  "__aipac_total": "AIPAC Total",
                  "__dmfi_total": "DMFI Total",
                  "__aipac_direct": "AIPAC Direct Donations",
                  "__dmfi_direct": "DMFI Direct Donations",
                  "__aipac_earmark": "AIPAC Earmarked Donations",
                  "__aipac_ie": "AIPAC Independent Expenditures",
                  "__dmfi_ie": "DMFI Independent Expenditures"
                };
                return (
                  <div
                    key={c}
                    className="th group/header relative select-none flex flex-col max-w-[14rem]"
                  >
                    {/* Header title - clickable to view AIPAC page with fixed 3-line height */}
                    <div className="h-[3.375rem] flex items-start">
                      <span
                        className="line-clamp-3 cursor-pointer hover:text-[#4B8CFB] transition-colors"
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
                      className="text-[10px] text-slate-500 dark:text-slate-300 font-light mt-0.5 flex items-center gap-1 cursor-pointer hover:text-slate-700 dark:hover:text-slate-100"
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
                      <span className={clsx(
                        "text-[10px]",
                        sortCol === c ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover/header:opacity-100"
                      )}>
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
            {/* Hide endorsements and score columns when AIPAC is selected */}
            {!f.categories.has("AIPAC") && (
              <>
                <div className="th border-r border-[#E7ECF2] dark:border-white/10 group/header relative select-none flex flex-col max-w-[14rem]">
                  {/* Header title - clickable to view AIPAC page with fixed 3-line height */}
                  <div className="h-[3.375rem] flex items-start">
                    <span
                      className="line-clamp-3 cursor-pointer hover:text-[#4B8CFB] transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open('/aipac', '_blank');
                      }}
                    >
                      Supported by AIPAC or aligned PACs
                    </span>
                  </div>

                  {/* Sortable indicator - always in uniform position */}
                  <span
                    className="text-[10px] text-slate-500 dark:text-slate-300 font-light mt-0.5 flex items-center gap-1 cursor-pointer hover:text-slate-700 dark:hover:text-slate-100"
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
                    <span className={clsx(
                      "text-[10px]",
                      sortCol === "__aipac" ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover/header:opacity-100"
                    )}>
                      {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                    </span>
                  </span>
                </div>
                {/* Sortable score headers */}
                <div
                  className="th text-right pr-3 cursor-pointer relative group"
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
                    "absolute right-2 top-1.5 text-[10px]",
                    sortCol === (scoreSuffix ? `Total_${scoreSuffix}` : "Total") ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100"
                  )}>
                    {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                  </span>
                </div>

                <div
                  className="th text-right pr-3 cursor-pointer relative group"
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
                    "absolute right-2 top-1.5 text-[10px]",
                    sortCol === (scoreSuffix ? `Max_Possible_${scoreSuffix}` : "Max_Possible") ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100"
                  )}>
                    {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                  </span>
                </div>

                <div
                  className="th text-right pr-3 cursor-pointer relative group"
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
                    "absolute right-2 top-1.5 text-[10px]",
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
                "grid min-w-max transition",
                "hover:bg-slate-50 dark:hover:bg-white/5"
              )}
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {/* member + photo */}
              <div
                className="td pl-2 md:pl-4 flex items-center gap-1.5 md:gap-3 cursor-pointer sticky left-0 z-20 bg-white dark:bg-slate-900"
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
                  <div className="font-bold text-xs md:text-[16px] leading-tight md:leading-5 text-slate-800 dark:text-slate-200 mb-0.5 md:mb-1">
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

                    {/* State last */}
                    <span className="text-[10px] md:text-xs">{stateCodeOf(r.state)}</span>
                  </div>
                </div>
              </div>

              {gradeColumns.map((gradeCol, idx) => {
                const isOverall = idx === 0;
                const isSummaryMode = f.viewMode === "summary";

                return (
                  <div
                    key={gradeCol.field}
                    className={clsx(
                      "td flex items-center justify-center",
                      idx === gradeColumns.length - 1 && "border-r border-[#E7ECF2] dark:border-white/10",
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
                );
              })}

              {/* bill columns -> binary check / x / N/A for other chamber */}
              {billCols.map((c) => {
                // Handle AIPAC-specific columns
                if (c.startsWith("__aipac_") || c.startsWith("__dmfi_") || c === "__total_support" || c === "__election") {
                  const pacData = pacDataMap.get(String(r.bioguide_id));
                  const electionYear = getElectionYear(pacData);

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

                  // Endorsement columns
                  if (c === "__aipac_endorsed") {
                    const endorsed = isAipacEndorsed(pacData);
                    return (
                      <div key={c} className="td !px-0 !py-0 flex items-center justify-center border-b border-[#E7ECF2] dark:border-white/10">
                        {endorsed ? (
                          <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden="true" role="img">
                            <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden="true" role="img">
                            <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                          </svg>
                        )}
                      </div>
                    );
                  }

                  if (c === "__dmfi_endorsed") {
                    const endorsed = isDmfiEndorsed(pacData);
                    return (
                      <div key={c} className="td !px-0 !py-0 flex items-center justify-center border-b border-[#E7ECF2] dark:border-white/10">
                        {endorsed ? (
                          <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden="true" role="img">
                            <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden="true" role="img">
                            <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                          </svg>
                        )}
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
                // For pair_key items, the denominator depends on the item and whether they got points
                let maxPoints = maxPointsByCol.get(c) || 0;
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

                let title: string;
                if (notApplicable) {
                  title = "Not applicable (different chamber)";
                } else if (manualActionNotApplicable) {
                  title = "Not applicable";
                } else if (wasAbsent) {
                  title = "Did not vote/voted present";
                } else if (showDashForPreferredPair) {
                  title = "Not penalized: preferred item supported";
                } else {
                  // Determine the action description
                  let actionDescription = '';

                  if (isCosponsor) {
                    const didCosponsor = isSupport ? (val > 0) : (val === 0);
                    actionDescription = didCosponsor ? 'Cosponsored' : 'Has Not Cosponsored';
                  } else if (isVote) {
                    const votedFor = isSupport ? (val > 0) : (val === 0);
                    actionDescription = votedFor ? 'Voted in Favor' : 'Voted Against';
                  } else {
                    actionDescription = val > 0 ? 'Supported' : 'Did Not Support';
                  }

                  title = `${actionDescription}, ${val.toFixed(0)}/${maxPoints} points`;
                }

                return (
                  <div key={c} className="td !px-0 !py-0 flex items-center justify-center border-b border-[#E7ECF2] dark:border-white/10" title={title}>
                    {notApplicable || manualActionNotApplicable ? (
                      <span className="text-xs text-slate-400">N/A</span>
                    ) : wasAbsent ? (
                      <span className="text-lg leading-none text-slate-400">—</span>
                    ) : showDashForPreferredPair ? (
                      <span className="text-lg leading-none text-slate-400">—</span>
                    ) : (
                      <VoteIcon ok={val > 0} />
                    )}
                  </div>
                );
              })}

              {/* Hide endorsements and score columns when AIPAC is selected */}
              {!f.categories.has("AIPAC") && (
                <>
                  {/* Endorsements column - clickable to switch to AIPAC issue view */}
                  <div
                    className="td border-r border-[#E7ECF2] dark:border-white/10 px-2 flex items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10"
                    onClick={() => f.set({ viewMode: "category", categories: new Set(["AIPAC"]) })}
                    title="Click to view AIPAC contributions"
                  >
                    {(() => {
                      const pacData = pacDataMap.get(String(r.bioguide_id));
                      const aipac = isAipacEndorsed(pacData) || isTruthy(r.aipac_supported);
                      const dmfi = isDmfiEndorsed(pacData) || isTruthy(r.dmfi_supported);

                      if (aipac && dmfi) {
                        return (
                          <div className="flex items-center gap-1">
                            <svg viewBox="0 0 20 20" className="h-3 w-3 flex-shrink-0" aria-hidden="true" role="img">
                              <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                            </svg>
                            <span className="text-xs text-slate-800 dark:text-slate-200">Supported by AIPAC and DMFI</span>
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
                                <span className="text-xs text-slate-800 dark:text-slate-200">Supported by AIPAC</span>
                              </div>
                            )}
                            {dmfi && (
                              <div className="flex items-center gap-1">
                                <svg viewBox="0 0 20 20" className="h-3 w-3 flex-shrink-0" aria-hidden="true" role="img">
                                  <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                                </svg>
                                <span className="text-xs text-slate-800 dark:text-slate-200">Supported by DMFI</span>
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
                          <span className="text-xs text-slate-800 dark:text-slate-200">Not supported by AIPAC or DMFI</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Total/Max/Percent */}
                  <div className="td tabular text-right pr-3 font-medium flex items-center justify-end">
                    {Number(r[scoreSuffix ? `Total_${scoreSuffix}` : "Total"] || 0).toFixed(0)}
                  </div>
                  <div className="td tabular text-right pr-3 flex items-center justify-end">
                    {Number(r[scoreSuffix ? `Max_Possible_${scoreSuffix}` : "Max_Possible"] || 0).toFixed(0)}
                  </div>
                  <div className="td tabular text-right pr-3 flex items-center justify-end">
                    <Progress value={Number(r[scoreSuffix ? `Percent_${scoreSuffix}` : "Percent"] || 0)} />
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

function Filters({ filteredCount, metaByCol }: { categories: string[]; filteredCount: number; metaByCol: Map<string, Meta> }) {
  const f = useFilters();
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Territories without senators
  const territoriesWithoutSenate = ["VI", "PR", "DC", "AS", "GU", "MP"];

  return (
    <div className="mb-1 space-y-2">
      {/* First row: Map/Summary/Issues buttons and Search */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Desktop: Show both buttons (>450px) */}
        <div className="min-[450px]:inline-flex hidden rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-white dark:bg-white/5 p-1">
          <button
            onClick={() => f.set({ viewMode: "map", categories: new Set() })}
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
                : "hover:bg-slate-50 dark:hover:bg-white/10"
            )}
          >
            Summary
          </button>
        </div>

        {/* Very narrow screens: Show dropdown (<450px) */}
        <select
          className={clsx(
            "max-[449px]:block hidden px-3 h-9 rounded-md text-sm border-0 cursor-pointer",
            (f.viewMode === "map" || f.viewMode === "summary")
              ? "bg-[#4B8CFB] text-white"
              : "bg-transparent hover:bg-slate-50 dark:hover:bg-white/10"
          )}
          value={f.viewMode === "map" ? "map" : f.viewMode === "summary" ? "summary" : ""}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "map") {
              f.set({ viewMode: "map", categories: new Set() });
            } else if (value === "summary") {
              f.set({ viewMode: "summary", categories: new Set() });
            }
          }}
        >
          <option value="">View</option>
          <option value="map">Map</option>
          <option value="summary">Summary</option>
        </select>

        {/* Desktop: Show Issues button and individual issue buttons (≥900px) */}
        <div className="hidden min-[900px]:flex min-[900px]:items-center min-[900px]:gap-2">
          {/* Issues button - stays blue when any category or all is selected, clicking defaults to All */}
          <button
            onClick={() => f.set({ viewMode: "all", categories: new Set() })}
            className={clsx(
              "px-3 h-9 rounded-md text-sm",
              (f.viewMode === "all" || f.viewMode === "category")
                ? "bg-[#4B8CFB] text-white"
                : "hover:bg-slate-50 dark:hover:bg-white/10"
            )}
          >
            Issues
          </button>
          {/* Border around issue buttons */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10">
            {/* Individual issue buttons - shallower with lighter blue when active */}
            <button
              onClick={() => f.set({ viewMode: "all", categories: new Set() })}
              className={clsx(
                "px-2 h-7 rounded-md text-sm",
                f.viewMode === "all" && f.categories.size === 0
                  ? "bg-[#93c5fd] text-slate-900"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              All
            </button>
            <button
              onClick={() => f.set({ viewMode: "category", categories: new Set(["Civil Rights"]) })}
              className={clsx(
                "px-2 h-7 rounded-md text-sm",
                f.categories.has("Civil Rights")
                  ? "bg-[#93c5fd] text-slate-900"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              Civil Rights
            </button>
            <button
              onClick={() => f.set({ viewMode: "category", categories: new Set(["Iran"]) })}
              className={clsx(
                "px-2 h-7 rounded-md text-sm",
                f.categories.has("Iran")
                  ? "bg-[#93c5fd] text-slate-900"
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
                  ? "bg-[#93c5fd] text-slate-900"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              Israel-Gaza
            </button>
            <button
              onClick={() => f.set({ viewMode: "category", categories: new Set(["Travel & Immigration"]) })}
              className={clsx(
                "px-2 h-7 rounded-md text-sm whitespace-nowrap",
                f.categories.has("Travel & Immigration")
                  ? "bg-[#93c5fd] text-slate-900"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              Travel & Immigration
            </button>
            <button
              onClick={() => f.set({ viewMode: "category", categories: new Set(["AIPAC"]) })}
              className={clsx(
                "px-2 h-7 rounded-md text-sm",
                f.categories.has("AIPAC")
                  ? "bg-[#93c5fd] text-slate-900"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              AIPAC
            </button>
          </div>
        </div>

        {/* Mobile: Show dropdown (<900px) - narrower on very small screens */}
        <select
          className={clsx(
            "max-[899px]:block hidden px-3 h-9 rounded-md text-sm border-0 cursor-pointer",
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
          <option value="Civil Rights">Civil Rights</option>
          <option value="Iran">Iran</option>
          <option value="Israel-Gaza">Israel-Gaza</option>
          <option value="Travel & Immigration">Travel & Immigration</option>
          <option value="AIPAC">AIPAC</option>
        </select>

        <div className="ml-auto">
          <UnifiedSearch filteredCount={filteredCount} metaByCol={metaByCol} />
        </div>
      </div>

      {/* Second row: Filters */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
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
            className="chip-outline text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 !text-xs !px-2 !h-8"
            title="Clear all filters"
          >
            ✕
          </button>
        )}

        <div
          className={clsx(
            "flex items-center gap-2 overflow-hidden transition-all duration-300 ease-out",
            filtersExpanded ? "max-w-[600px] opacity-100" : "max-w-0 opacity-0"
          )}
        >
          <Segmented
            options={["Both", "House","Senate"]}
            value={f.chamber ? (f.chamber.charAt(0) + f.chamber.slice(1).toLowerCase()) : "Both"}
            onChange={(v)=>{
              if (v === "Both") {
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
            className="select !text-xs !h-8 !px-2"
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
                {s.name} ({s.code})
              </option>
            ))}
          </select>
          {(f.chamber || f.party || f.state || f.search || f.myLawmakers.length > 0) && (
            <button
              onClick={() => f.set({ chamber: "", party: "", state: "", search: "", myLawmakers: [] })}
              className="chip-outline text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 !text-xs !px-2 !h-8"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function UnifiedSearch({ filteredCount, metaByCol }: { filteredCount: number; metaByCol: Map<string, Meta> }) {
  const f = useFilters();
  const [isOpen, setIsOpen] = useState(false);
  const [searchType, setSearchType] = useState<"zip" | "name" | "legislation">("name");
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
      window.location.href = `/bill/${encodeURIComponent(foundColumn)}`;
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
    if (searchType === "zip") return "Enter zip code…";
    if (searchType === "name") return "Enter lawmaker name…";
    return "Enter bill number or title…";
  };

  const isActive = f.myLawmakers.length > 0 || f.search.length > 0;

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
          <span className="hidden min-[1000px]:inline">Search...</span>
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
  return (
    <div className="th group group/header relative select-none flex flex-col max-w-[14rem]">
      {/* Bill title - clickable to view details with fixed 3-line height */}
      <div className="h-[3.375rem] flex items-start">
        <span
          className="line-clamp-3 cursor-pointer hover:text-[#4B8CFB] transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            if (meta) {
              window.open(`/bill/${encodeURIComponent(col)}`, '_blank');
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
            "text-[10px] text-slate-500 dark:text-slate-300 font-light mt-0.5 flex items-center gap-1",
            onSort && "cursor-pointer hover:text-slate-700 dark:hover:text-slate-100"
          )}
          onClick={onSort}
          title={onSort ? "Click to sort by this column (toggle ✓ first / ✕ first)" : undefined}
        >
          {formatPositionScorecard(meta)}
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
          <div className="text-xs text-slate-500 dark:text-slate-300 mt-1"><span className="font-medium">NIAC Action Position:</span> {formatPositionTooltip(meta)}</div>
          {meta.description && <div className="text-xs text-slate-700 dark:text-slate-200 mt-2">{meta.description}</div>}
          {meta.analysis && <div className="text-xs text-slate-700 dark:text-slate-200 mt-2">{meta.analysis}</div>}
          {meta.sponsor && <div className="text-xs text-slate-700 dark:text-slate-200 mt-2"><span className="font-medium">Sponsor:</span> {meta.sponsor}</div>}
          <div className="mt-2 flex flex-wrap gap-1">
            {(meta.categories || "").split(";").map((c:string)=>c.trim()).filter(Boolean).map((c:string)=>(
              <span key={c} className="chip-xs">{c}</span>
            ))}
          </div>
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
      <span className="text-xs tabular text-slate-800 min-w-[32px]">{percent}%</span>
    </div>
  );
}

function GradeChip({ grade, isOverall }:{ grade:string; isOverall?: boolean }) {
  const color = grade.startsWith("A") ? "#050a30" // dark navy blue
    : grade.startsWith("B") ? "#30558d" // medium blue
    : grade.startsWith("C") ? "#93c5fd" // light blue
    : grade.startsWith("D") ? "#d1d5db" // medium grey
    : "#f3f4f6"; // very light grey
  const opacity = isOverall ? "FF" : "E6"; // fully opaque for overall, 90% opaque (10% transparent) for others
  const textColor = grade.startsWith("A") ? "#ffffff" // white for A grades
    : grade.startsWith("B") ? "#f3f4f6" // light grey (F pill color) for B grades
    : "#4b5563"; // dark grey for all other grades
  const border = isOverall ? "1px solid #000000" : "none"; // thin black border for overall grades
  return <span className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium min-w-[2.75rem]"
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

function LawmakerCard({
  row,
  billCols,
  metaByCol,
  categories,
  onClose,
}: {
  row: Row;
  billCols: string[];
  metaByCol: Map<string, Meta>;
  categories: string[];
  onClose: () => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [districtOfficesExpanded, setDistrictOfficesExpanded] = useState(false);
  const [committeesExpanded, setCommitteesExpanded] = useState(false);
  const [lobbySupportExpanded, setLobbySupportExpanded] = useState(false);
  const [votesActionsExpanded, setVotesActionsExpanded] = useState(true);
  const [pacData, setPacData] = useState<PacData | null>(null);

  const votesActionsRef = useRef<HTMLDivElement>(null);
  const lobbySupportRef = useRef<HTMLDivElement>(null);

  // Load PAC data when component mounts
  useEffect(() => {
    (async () => {
      const pacDataMap = await loadPacData();
      const memberPacData = pacDataMap.get(row.bioguide_id as string);
      if (memberPacData) {
        setPacData(memberPacData);
      }
    })();
  }, [row.bioguide_id]);

  // Build list of items: each bill or manual action gets an entry
  const allItems = useMemo(() => {
    return billCols
      .map((c) => {
        const meta = metaByCol.get(c);
        const inferredChamber = inferChamber(meta, c);
        const notApplicable = inferredChamber && inferredChamber !== row.chamber;
        const val = Number((row as any)[c] ?? 0);

        // Check if member was absent for this vote
        const absentCol = `${c}_absent`;
        const wasAbsent = Number((row as any)[absentCol] ?? 0) === 1;

        const categories = (meta?.categories || "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean);

        // Check for preferred pair waiver
        const isPreferred = meta ? isTrue((meta as any).preferred) : false;
        let waiver = false;
        if (!notApplicable && meta?.pair_key && !isPreferred && !(val > 0)) {
          for (const other of billCols) {
            if (other === c) continue;
            const m2 = metaByCol.get(other);
            if (m2?.pair_key === meta.pair_key && isTrue((m2 as any).preferred)) {
              const v2 = Number((row as any)[other] ?? 0);
              if (v2 > 0) { waiver = true; break; }
            }
          }
        }

        return {
          col: c,
          meta,
          val,
          categories,
          notApplicable,
          waiver,
          wasAbsent,
          ok: !notApplicable && val > 0,
        };
      })
      .filter((it) => it.meta && !it.notApplicable)
      .sort((a, b) => {
        // Sort by first category alphabetically
        const catA = a.categories[0] || "";
        const catB = b.categories[0] || "";
        const catCompare = catA.localeCompare(catB);
        if (catCompare !== 0) return catCompare;

        // Then sort alphabetically by display name
        // Use natural sort to handle numbers correctly (e.g., #1 before #2)
        const nameA = a.meta?.display_name || a.meta?.short_title || a.col;
        const nameB = b.meta?.display_name || b.meta?.short_title || b.col;
        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [billCols, metaByCol, row]);

  // Filter items based on selected category
  const items = selectedCategory
    ? allItems.filter((it) => it.categories.some((c) => c === selectedCategory))
    : allItems;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/50 z-[100]"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="fixed inset-4 md:inset-10 z-[110] flex items-start justify-center overflow-auto">
        <div className="w-full max-w-5xl my-4 rounded-2xl border border-[#E7ECF2] dark:border-white/10 bg-white dark:bg-[#0B1220] shadow-xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]">
          {/* Header - Sticky */}
          <div className="flex flex-col p-6 border-b border-[#E7ECF2] dark:border-white/10 sticky top-0 bg-white dark:bg-[#0B1220] z-20">
            {/* Top row: photo, name, badges, and buttons */}
            <div className="flex items-center gap-3">
              {row.photo_url ? (
                <img
                  src={String(row.photo_url)}
                  alt=""
                  className="h-32 w-32 rounded-full object-cover bg-slate-200 dark:bg-white/10"
                />
              ) : (
                <div className="h-32 w-32 rounded-full bg-slate-300 dark:bg-white/10" />
              )}
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium mb-0.5">
                  {(() => {
                    if (row.chamber === "SENATE") return "Senator";
                    if (row.chamber === "HOUSE") {
                      const delegateStates = ["AS", "DC", "GU", "MP", "PR", "VI"];
                      const state = stateCodeOf(row.state);
                      return delegateStates.includes(state) ? "Delegate" : "Representative";
                    }
                    return "";
                  })()}
                </div>
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  {(() => {
                    const fullName = String(row.full_name || "");
                    const commaIndex = fullName.indexOf(",");
                    if (commaIndex > -1) {
                      const first = fullName.slice(commaIndex + 1).trim();
                      const last = fullName.slice(0, commaIndex).trim();
                      return `${first} ${last}`;
                    }
                    return fullName;
                  })()}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold"
                    style={{
                      color: "#64748b",
                      backgroundColor: `${chamberColor(row.chamber)}20`,
                    }}
                  >
                    {row.chamber === "HOUSE"
                      ? "House"
                      : row.chamber === "SENATE"
                      ? "Senate"
                      : row.chamber || ""}
                  </span>
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[11px] font-medium border"
                    style={partyBadgeStyle(row.party)}
                  >
                    {partyLabel(row.party)}
                  </span>
                  <span>{stateCodeOf(row.state)}{row.district ? `-${row.district}` : ""}</span>
                </div>
              </div>

              {/* Contact Information - hide on narrow screens */}
              {(row.office_phone || row.office_address) && (
                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2 hidden md:block">
                  {row.office_phone && (
                    <div>
                      <div className="font-medium mb-0.5">Washington Office Phone</div>
                      <div className="text-slate-700 dark:text-slate-200">{row.office_phone}</div>
                    </div>
                  )}
                  {row.office_address && (
                    <div>
                      <div className="font-medium mb-0.5">Washington Office Address</div>
                      <div className="text-slate-700 dark:text-slate-200">{row.office_address}</div>
                    </div>
                  )}
                </div>
              )}

              <button
                className="ml-3 p-2 rounded-lg border border-[#E7ECF2] dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                onClick={() => window.open(`/member/${row.bioguide_id}`, "_blank")}
                title="Open in new tab"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
              <button
                className="chip-outline text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                onClick={onClose}
              >
                Close
              </button>
            </div>

            {/* Contact Information - show below on narrow screens */}
            {(row.office_phone || row.office_address) && (
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-4 md:hidden">
                <div className="flex gap-6">
                  {row.office_phone && (
                    <div>
                      <div className="font-medium mb-0.5">Washington Office Phone</div>
                      <div className="text-slate-700 dark:text-slate-200">{row.office_phone}</div>
                    </div>
                  )}
                  {row.office_address && (
                    <div>
                      <div className="font-medium mb-0.5">Washington Office Address</div>
                      <div className="text-slate-700 dark:text-slate-200">{row.office_address}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Issue Grades - no title, part of header card */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              {/* Overall Grade card */}
              <button
                onClick={() => {
                  setSelectedCategory(null);
                  setVotesActionsExpanded(true);
                  // Scroll to Votes & Actions section after a brief delay
                  setTimeout(() => {
                    votesActionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 100);
                }}
                className={clsx(
                  "rounded-lg border p-3 text-left transition cursor-pointer",
                  selectedCategory === null
                    ? "border-[#4B8CFB] bg-[#4B8CFB]/10 dark:bg-[#4B8CFB]/20"
                    : "border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10"
                )}
              >
                <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Overall Grade</div>
                <div className="flex items-center justify-between">
                  <div className="text-xs tabular text-slate-700 dark:text-slate-300">
                    {Number(row.Total || 0).toFixed(0)} / {Number(row.Max_Possible || 0).toFixed(0)}
                  </div>
                  <GradeChip grade={String(row.Grade || "N/A")} />
                </div>
              </button>

              {categories.filter(cat => cat !== "AIPAC").map((category) => {
                const fieldSuffix = category.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
                const totalField = `Total_${fieldSuffix}` as keyof Row;
                const maxField = `Max_Possible_${fieldSuffix}` as keyof Row;
                const gradeField = `Grade_${fieldSuffix}` as keyof Row;

                return (
                  <button
                    key={category}
                    onClick={() => {
                      setSelectedCategory(selectedCategory === category ? null : category);
                      // Expand Votes & Actions section
                      setVotesActionsExpanded(true);
                      // Scroll to Votes & Actions section after a brief delay
                      setTimeout(() => {
                        votesActionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 100);
                    }}
                    className={clsx(
                      "rounded-lg border p-3 text-left transition cursor-pointer",
                      selectedCategory === category
                        ? "border-[#4B8CFB] bg-[#4B8CFB]/10 dark:bg-[#4B8CFB]/20"
                        : "border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10"
                    )}
                  >
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">{category}</div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs tabular text-slate-700 dark:text-slate-300">
                        {Number(row[totalField] || 0).toFixed(0)} / {Number(row[maxField] || 0).toFixed(0)}
                      </div>
                      <GradeChip grade={String(row[gradeField] || "N/A")} />
                    </div>
                  </button>
                );
              })}

              {/* Endorsements card */}
              {(() => {
                const aipac = isAipacEndorsed(pacData || undefined);
                const dmfi = isDmfiEndorsed(pacData || undefined);

                return (
                  <button
                    onClick={() => {
                      if (aipac || dmfi) {
                        setLobbySupportExpanded(true);
                        // Scroll to section after a brief delay
                        setTimeout(() => {
                          lobbySupportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                      }
                    }}
                    className={clsx(
                      "rounded-lg border p-3 text-left w-full transition",
                      (aipac || dmfi)
                        ? "border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10"
                        : "border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 cursor-default"
                    )}
                  >
                    {aipac || dmfi ? (
                      <div className="flex items-center gap-1.5">
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" role="img">
                          <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                        </svg>
                        <span className="text-xs text-slate-700 dark:text-slate-300">
                          {aipac && dmfi ? "Supported by AIPAC and DMFI" : aipac ? "Supported by AIPAC" : "Supported by DMFI"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" role="img">
                          <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                        </svg>
                        <span className="text-xs text-slate-700 dark:text-slate-300">Not supported by AIPAC or DMFI</span>
                      </div>
                    )}
                  </button>
                );
              })()}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="overflow-y-auto flex-1 p-6">
            {/* District Offices */}
            {row.district_offices && (
              <div className="mb-6">
                <div
                  className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50 transition-colors"
                  onClick={() => setDistrictOfficesExpanded(!districtOfficesExpanded)}
                >
                  District Offices
                  <svg
                    viewBox="0 0 20 20"
                    className={clsx("h-4 w-4 ml-auto transition-transform", districtOfficesExpanded && "rotate-180")}
                    aria-hidden="true"
                    role="img"
                  >
                    <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                {districtOfficesExpanded && (
                  <div className="rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4">
                    <div className="text-xs text-slate-700 dark:text-slate-200 space-y-2">
                      {row.district_offices.split(";").map((office, idx) => (
                        <div key={idx}>
                          {office.trim()}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Committees */}
            {(() => {
              const filteredCommittees = row.committees
                ? row.committees.split(";")
                    .map(c => c.trim())
                    .filter(c => c.startsWith("House") || c.startsWith("Senate") || c.startsWith("Joint"))
                : [];

              return filteredCommittees.length > 0 ? (
                <div className="mb-6">
                  <div
                    className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50 transition-colors"
                    onClick={() => setCommitteesExpanded(!committeesExpanded)}
                  >
                    Committee Assignments
                    <svg
                      viewBox="0 0 20 20"
                      className={clsx("h-4 w-4 ml-auto transition-transform", committeesExpanded && "rotate-180")}
                      aria-hidden="true"
                      role="img"
                    >
                      <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  {committeesExpanded && (
                    <div className="rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4">
                      <div className="text-xs text-slate-700 dark:text-slate-200 space-y-1">
                        {filteredCommittees.map((committee, idx) => (
                          <div key={idx} className="pl-0">
                            {committee}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null;
            })()}

            {/* Support from AIPAC and Affiliates */}
            {(() => {
              const aipac = isAipacEndorsed(pacData);
              const dmfi = isDmfiEndorsed(pacData);

              if (!aipac && !dmfi) return null;

              return (
              <div className="mb-6" ref={lobbySupportRef}>
                <div
                  className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50 transition-colors"
                  onClick={() => setLobbySupportExpanded(!lobbySupportExpanded)}
                >
                  Support from AIPAC and Affiliates
                  <svg
                    viewBox="0 0 20 20"
                    className={clsx("h-4 w-4 ml-auto transition-transform", lobbySupportExpanded && "rotate-180")}
                    aria-hidden="true"
                    role="img"
                  >
                    <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                {lobbySupportExpanded && (
                  <div className="rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4">
                    {pacData ? (
                      <div className="space-y-6">
                        {/* 2026 Election Section (2025 data) */}
                        {(() => {
                          // Only show if there's actual financial data (not just endorsement)
                          const has2025Data = pacData.aipac_total_2025 > 0 || pacData.aipac_direct_amount_2025 > 0 || pacData.aipac_earmark_amount_2025 > 0 || pacData.aipac_ie_total_2025 > 0 || pacData.aipac_ie_support_2025 > 0 || pacData.dmfi_total_2025 > 0 || pacData.dmfi_direct_2025 > 0;

                          if (!has2025Data) return null;

                          return (
                            <div>
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-3 pb-2 border-b border-[#E7ECF2] dark:border-white/20">2026 Election</div>
                              <div className="space-y-4">
                                {/* AIPAC 2025/2026 */}
                                {(pacData.aipac_total_2025 > 0 || pacData.aipac_direct_amount_2025 > 0 || pacData.aipac_earmark_amount_2025 > 0 || pacData.aipac_ie_total_2025 > 0 || pacData.aipac_ie_support_2025 > 0) && (
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">AIPAC (American Israel Public Affairs Committee)</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {pacData.aipac_total_2025 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Total:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.aipac_total_2025.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.aipac_direct_amount_2025 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Direct:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.aipac_direct_amount_2025.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.aipac_earmark_amount_2025 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Earmarked:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.aipac_earmark_amount_2025.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {(pacData.aipac_ie_total_2025 > 0 || pacData.aipac_ie_support_2025 > 0) && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Independent Expenditures:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${(pacData.aipac_ie_total_2025 || pacData.aipac_ie_support_2025).toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* DMFI 2025/2026 */}
                                {(pacData.dmfi_total_2025 > 0 || pacData.dmfi_direct_2025 > 0) && (
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">DMFI (Democratic Majority For Israel)</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {pacData.dmfi_total_2025 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Total:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.dmfi_total_2025.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.dmfi_direct_2025 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Direct:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.dmfi_direct_2025.toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* 2024 Election Section */}
                        {(() => {
                          // Only show if there's actual financial data (not just endorsement)
                          const has2024Data = pacData.aipac_total > 0 || pacData.aipac_direct_amount > 0 || pacData.aipac_earmark_amount > 0 || pacData.aipac_ie_total > 0 || pacData.aipac_ie_support > 0 || pacData.dmfi_total > 0 || pacData.dmfi_direct > 0 || pacData.dmfi_ie_total > 0 || pacData.dmfi_ie_support > 0;

                          if (!has2024Data) return null;

                          return (
                            <div>
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-3 pb-2 border-b border-[#E7ECF2] dark:border-white/20">2024 Election</div>
                              <div className="space-y-4">
                                {/* AIPAC 2024 */}
                                {(pacData.aipac_total > 0 || pacData.aipac_direct_amount > 0 || pacData.aipac_earmark_amount > 0 || pacData.aipac_ie_total > 0 || pacData.aipac_ie_support > 0) && (
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">AIPAC (American Israel Public Affairs Committee)</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {pacData.aipac_total > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Total:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.aipac_total.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.aipac_direct_amount > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Direct:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.aipac_direct_amount.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.aipac_earmark_amount > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Earmarked:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.aipac_earmark_amount.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {(pacData.aipac_ie_total > 0 || pacData.aipac_ie_support > 0) && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Independent Expenditures:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${(pacData.aipac_ie_total || pacData.aipac_ie_support).toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* DMFI 2024 */}
                                {(pacData.dmfi_total > 0 || pacData.dmfi_direct > 0 || pacData.dmfi_ie_total > 0 || pacData.dmfi_ie_support > 0) && (
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">DMFI (Democratic Majority For Israel)</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {pacData.dmfi_total > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Total:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.dmfi_total.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.dmfi_direct > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Direct:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.dmfi_direct.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {(pacData.dmfi_ie_total > 0 || pacData.dmfi_ie_support > 0) && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Independent Expenditures:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${(pacData.dmfi_ie_total || pacData.dmfi_ie_support).toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* 2022 Election Section */}
                        {(() => {
                          const has2022Data = pacData.aipac_total_2022 > 0 || pacData.aipac_direct_amount_2022 > 0 || pacData.aipac_earmark_amount_2022 > 0 || pacData.aipac_ie_total_2022 > 0 || pacData.aipac_ie_support_2022 > 0 || pacData.dmfi_total_2022 > 0 || pacData.dmfi_direct_2022 > 0 || pacData.dmfi_ie_total_2022 > 0 || pacData.dmfi_ie_support_2022 > 0;

                          if (!has2022Data) return null;

                          return (
                            <div>
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-3 pb-2 border-b border-[#E7ECF2] dark:border-white/20">2022 Election</div>
                              <div className="space-y-4">
                                {/* AIPAC 2022 */}
                                {(pacData.aipac_total_2022 > 0 || pacData.aipac_direct_amount_2022 > 0 || pacData.aipac_earmark_amount_2022 > 0 || pacData.aipac_ie_total_2022 > 0 || pacData.aipac_ie_support_2022 > 0) && (
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">AIPAC (American Israel Public Affairs Committee)</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {pacData.aipac_total_2022 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Total:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.aipac_total_2022.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.aipac_direct_amount_2022 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Direct:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.aipac_direct_amount_2022.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.aipac_earmark_amount_2022 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Earmarked:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.aipac_earmark_amount_2022.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {(pacData.aipac_ie_total_2022 > 0 || pacData.aipac_ie_support_2022 > 0) && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Independent Expenditures:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${(pacData.aipac_ie_total_2022 || pacData.aipac_ie_support_2022).toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* DMFI 2022 */}
                                {(pacData.dmfi_total_2022 > 0 || pacData.dmfi_direct_2022 > 0 || pacData.dmfi_ie_total_2022 > 0 || pacData.dmfi_ie_support_2022 > 0) && (
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">DMFI (Democratic Majority For Israel)</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {pacData.dmfi_total_2022 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Total:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.dmfi_total_2022.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.dmfi_direct_2022 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Direct:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.dmfi_direct_2022.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {(pacData.dmfi_ie_total_2022 > 0 || pacData.dmfi_ie_support_2022 > 0) && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600 dark:text-slate-400">Independent Expenditures:</span>
                                          <span className="font-medium text-slate-700 dark:text-slate-200">${(pacData.dmfi_ie_total_2022 || pacData.dmfi_ie_support_2022).toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 dark:text-slate-500">Loading PAC data...</div>
                    )}
                  </div>
                )}
              </div>
              );
            })()}

            {/* Votes & Actions */}
            <div className="mb-6" ref={votesActionsRef}>
              <div
                className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50 transition-colors"
                onClick={() => setVotesActionsExpanded(!votesActionsExpanded)}
              >
                Votes & Actions
                <svg
                  viewBox="0 0 20 20"
                  className={clsx("h-4 w-4 ml-auto transition-transform", votesActionsExpanded && "rotate-180")}
                  aria-hidden="true"
                  role="img"
                >
                  <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {votesActionsExpanded && (
                <div className="space-y-4">
                  {(() => {
                    // Group items by category
                    const itemsByCategory = new Map<string, typeof items>();
                    items.forEach((it) => {
                      it.categories.forEach((cat) => {
                        if (!itemsByCategory.has(cat)) {
                          itemsByCategory.set(cat, []);
                        }
                        itemsByCategory.get(cat)!.push(it);
                      });
                    });

                    // Sort categories alphabetically
                    const sortedCategories = Array.from(itemsByCategory.keys()).sort();

                    return sortedCategories.map((category) => {
                      const categoryItems = itemsByCategory.get(category) || [];

                      // Get grade for this category
                      const fieldSuffix = category.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
                      const gradeField = `Grade_${fieldSuffix}` as keyof Row;
                      const grade = String(row[gradeField] || "N/A");

                      return (
                        <div key={category} className="rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{category}</div>
                            <GradeChip grade={grade} />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {categoryItems.map((it) => (
                              <div
                                key={it.col}
                                className="rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-white dark:bg-[#0B1220] p-3 cursor-pointer hover:border-[#4B8CFB] transition"
                                onClick={() => window.open(`/bill/${encodeURIComponent(it.col)}`, '_blank')}
                              >
                                <div className="text-[13px] font-medium leading-tight text-slate-700 dark:text-slate-200 mb-2">
                                  {it.meta?.display_name || it.meta?.short_title || it.meta?.bill_number || it.col}
                                </div>
                                <div className="text-[11px] text-slate-600 dark:text-slate-300 mb-2">
                                  <span className="font-medium">NIAC Position:</span> {formatPositionTooltip(it.meta)}
                                </div>
                                {it.meta && (it.meta as { action_types?: string }).action_types && (
                                  <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                                    <div className="mt-0.5">
                                      {it.wasAbsent ? (
                                        <span className="text-base leading-none text-slate-400 dark:text-slate-500">—</span>
                                      ) : it.waiver ? (
                                        <span className="text-base leading-none text-slate-400 dark:text-slate-500">—</span>
                                      ) : (
                                        <VoteIcon ok={it.ok} />
                                      )}
                                    </div>
                                    <span className="font-medium">
                                      {(() => {
                                        if (it.wasAbsent) {
                                          return "Did not vote/voted present";
                                        }

                                        const actionTypes = (it.meta as { action_types?: string }).action_types || "";
                                        const isVote = actionTypes.includes("vote");
                                        const isCosponsor = actionTypes.includes("cosponsor");
                                        const position = (it.meta?.position_to_score || "").toUpperCase();
                                        const isSupport = position === "SUPPORT";
                                        const gotPoints = it.val > 0;

                                        if (isCosponsor) {
                                          const didCosponsor = isSupport ? gotPoints : !gotPoints;
                                          return didCosponsor ? "Cosponsored" : "Has Not Cosponsored";
                                        } else if (isVote) {
                                          const votedFor = isSupport ? gotPoints : !gotPoints;
                                          if (votedFor) {
                                            return "Voted in Favor";
                                          } else {
                                            return "Voted Against";
                                          }
                                        }
                                        return "Action";
                                      })()}
                                    </span>
                                  </div>
                                )}
                                {it.meta?.notes && (
                                  <div className="text-[11px] mt-2 text-slate-700 dark:text-slate-200 border-t border-[#E7ECF2] dark:border-white/10 pt-2">
                                    {it.meta.notes}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                  {!items.length && (
                    <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      No relevant bills/actions for current filters.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

