/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";
import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { loadData, loadManualScoringMeta } from "@/lib/loadCsv";
import { useFilters } from "@/lib/store";
import type { Row, Meta } from "@/lib/types";
import { loadPacData, isAipacEndorsed, isDmfiEndorsed, type PacData } from "@/lib/pacData";
import { GRADE_COLORS, extractVoteInfo, inferChamber } from "@/lib/utils";
import USMap from "@/components/USMap";
import { MemberModal } from "@/components/MemberModal";
import { BillModal } from "@/components/BillModal";
import { AipacModal } from "@/components/AipacModal";

import clsx from "clsx";

// Virtual scrolling configuration
const ROW_HEIGHT = 85; // Approximate height of each row in pixels
const OVERSCAN = 5; // Number of extra rows to render above/below visible area

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


// Determine which election year to display (prefer 2024, then 2026, then 2022 if 2024 has no $ data)
function getElectionYear(pacData: PacData | undefined): "2024" | "2026" | "2022" | null {
  if (!pacData) return null;

  // Check if 2024 has any dollar amounts
  const has2024Data = pacData.aipac_total_2024 > 0 || pacData.dmfi_total_2024 > 0;

  // Check if 2026 has any dollar amounts
  const has2026Data = pacData.aipac_total_2026 > 0 || pacData.dmfi_total_2026 > 0;

  // Check if 2022 has any dollar amounts
  const has2022Data = pacData.aipac_total_2022 > 0 || pacData.dmfi_total_2022 > 0;

  // Priority: 2024 > 2026 > 2022
  if (has2024Data) return "2024";
  if (has2026Data) return "2026";
  if (has2022Data) return "2022";

  // If no dollar data but we have endorsement data, check in priority order
  if (pacData.aipac_featured === 1 || pacData.dmfi_website === 1) return "2024";
  if (pacData.aipac_supported_2026 === 1 || pacData.dmfi_supported_2026 === 1) return "2026";

  return null;
}

// Convert data year to election cycle label
function getElectionLabel(year: "2024" | "2026" | "2022" | null): string {
  if (year === "2024") return "2024 Election";
  if (year === "2026") return "2026 Election";
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
  const [selectedFromAipac, setSelectedFromAipac] = useState<boolean>(false);
  const [selectedCell, setSelectedCell] = useState<{rowId: string, col: string} | null>(null);
  const [selectedBill, setSelectedBill] = useState<{ meta: Meta; column: string; initialStateFilter?: string } | null>(null);
  const [pacDataMap, setPacDataMap] = useState<Map<string, PacData>>(new Map());
  const [manualScoringMeta, setManualScoringMeta] = useState<Map<string, string>>(new Map());
  const [showAipacModal, setShowAipacModal] = useState<boolean>(false);

  // Modal history stack for back navigation
  type ModalHistoryItem =
    | { type: 'member'; data: Row }
    | { type: 'bill'; data: { meta: Meta; column: string } }
    | { type: 'aipac'; data: null };
  const [modalHistory, setModalHistory] = useState<ModalHistoryItem[]>([]);

  // Helper to navigate to a modal while preserving history
  const pushMemberModal = useCallback((member: Row) => {
    // Save current modal to history if one is open
    if (selected) {
      setModalHistory(prev => [...prev, { type: 'member', data: selected }]);
    } else if (selectedBill) {
      setModalHistory(prev => [...prev, { type: 'bill', data: selectedBill }]);
    }
    setSelected(member);
    setSelectedBill(null);
  }, [selected, selectedBill]);

  const pushBillModal = useCallback((meta: Meta, column: string) => {
    // Save current modal to history if one is open
    if (selected) {
      setModalHistory(prev => [...prev, { type: 'member', data: selected }]);
    } else if (selectedBill) {
      setModalHistory(prev => [...prev, { type: 'bill', data: selectedBill }]);
    }
    setSelectedBill({ meta, column });
    setSelected(null);
  }, [selected, selectedBill]);

  const goBackModal = useCallback(() => {
    if (modalHistory.length === 0) {
      // No history, just close current modal
      setSelected(null);
      setSelectedBill(null);
      setShowAipacModal(false);
      return;
    }

    const newHistory = [...modalHistory];
    const previousModal = newHistory.pop()!;
    setModalHistory(newHistory);

    if (previousModal.type === 'member') {
      setSelected(previousModal.data);
      setSelectedBill(null);
      setShowAipacModal(false);
    } else if (previousModal.type === 'bill') {
      setSelectedBill(previousModal.data);
      setSelected(null);
      setShowAipacModal(false);
    } else if (previousModal.type === 'aipac') {
      setShowAipacModal(true);
      setSelected(null);
      setSelectedBill(null);
    }
  }, [modalHistory]);

  const closeAllModals = useCallback(() => {
    setSelected(null);
    setSelectedFromAipac(false);
    setSelectedBill(null);
    setShowAipacModal(false);
    setModalHistory([]);
  }, []);

  useEffect(() => { (async () => {
    const [data, pacData, manualMeta] = await Promise.all([loadData(), loadPacData(), loadManualScoringMeta()]);
    const { rows, columns, metaByCol, categories } = data;
    setRows(rows); setCols(columns); setMeta(metaByCol); setCategories(categories);
    setPacDataMap(pacData);
    setManualScoringMeta(manualMeta);
  })(); }, []);

  const f = useFilters();
  const router = useRouter();

  // Check for view query parameter on mount, and handle first visit logic
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    const billParam = urlParams.get('bill');

    if (viewParam === 'tracker' || viewParam === 'map' || viewParam === 'summary' || viewParam === 'all' || viewParam === 'category') {
      f.set({ viewMode: viewParam });
    } else {
      // Check if user has visited before
      const hasVisited = localStorage.getItem("hasVisitedScorecard");
      if (!hasVisited) {
        // First visit - default to map view
        localStorage.setItem("hasVisitedScorecard", "true");
        f.set({ viewMode: "map" });
      }
      // Returning user stays on "summary" (already the default)
    }

    // If bill parameter is present, select it on the map
    if (billParam && viewParam === 'map') {
      setSelectedMapBill(billParam);
    }
  }, []);

  const [sortCol, setSortCol] = useState<string>("__member");
  const [sortDir, setSortDir] = useState<"GOOD_FIRST" | "BAD_FIRST">("GOOD_FIRST");
  const [selectedElection, setSelectedElection] = useState<"2024" | "2026" | "2022">("2024");
  const [isMobile, setIsMobile] = useState(false);
  const [selectedMapBill, setSelectedMapBill] = useState<string>("");

  // Track expanded bills in tracker accordion
  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());

  // Ref for the scrollable table container
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  // Ref for the tracker container
  const trackerScrollRef = useRef<HTMLDivElement | null>(null);

  // Virtual scrolling state
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track mobile viewport for responsive column widths
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Remove all title attributes on mobile/touch devices to prevent double-tap issue
  useEffect(() => {
    if (isMobile || ('ontouchstart' in window)) {
      const removeTitles = () => {
        document.querySelectorAll('[title]').forEach(el => {
          el.removeAttribute('title');
        });
      };
      // Run immediately and on DOM changes
      removeTitles();
      const observer = new MutationObserver(removeTitles);
      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    }
  }, [isMobile]);

  // Prevent horizontal scrolling in tracker
  useEffect(() => {
    if (trackerScrollRef.current) {
      trackerScrollRef.current.scrollLeft = 0;
      const preventHorizontalScroll = () => {
        if (trackerScrollRef.current) {
          trackerScrollRef.current.scrollLeft = 0;
        }
      };
      const interval = setInterval(preventHorizontalScroll, 100);
      return () => clearInterval(interval);
    }
  }, [f.viewMode]);

  // Scroll to left when filters change (but not when categories change) - keep vertical position
  useEffect(() => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
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
    if (f.party) {
      // When filtering for Democratic, include Independents
      if (f.party === "Democratic") {
        out = out.filter(r => r.party === "Democratic" || r.party === "Independent");
      } else {
        out = out.filter(r => r.party === f.party);
      }
    }
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
          // Match last name exactly, first name can be partial match in either direction
          // This handles cases like "Timothy" (API) vs "Tim" (DB), or "Mark R." (DB) vs "Mark" (API)
          if (dbLast !== apiLast || !dbFirst || !apiFirst) return false;
          const dbFirstBase = dbFirst.split(' ')[0]; // Get first word (no middle name)
          const apiFirstBase = apiFirst.split(' ')[0]; // Get first word
          // Match if either is a prefix of the other (handles Tim/Timothy, Mark/Mark R., etc.)
          return dbFirstBase.startsWith(apiFirstBase) || apiFirstBase.startsWith(dbFirstBase);
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
        const aipacA = isAipacEndorsed(pacA, a.aipac_supported);
        const dmfiA = isDmfiEndorsed(pacA, a.dmfi_supported);
        const aipacB = isAipacEndorsed(pacB, b.aipac_supported);
        const dmfiB = isDmfiEndorsed(pacB, b.dmfi_supported);

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
        const aipacA = isAipacEndorsed(pacA, a.aipac_supported);
        const dmfiA = isDmfiEndorsed(pacA, a.dmfi_supported);
        const aipacB = isAipacEndorsed(pacB, b.aipac_supported);
        const dmfiB = isDmfiEndorsed(pacB, b.dmfi_supported);

        let valA = 0;
        let valB = 0;

        if (sortCol === "__total_support") {
          // Use selectedElection for all members instead of individual years
          if (selectedElection === "2024") {
            valA = (aipacA ? (pacA?.aipac_total_2024 || 0) : 0) + (dmfiA ? (pacA?.dmfi_total_2024 || 0) : 0);
            valB = (aipacB ? (pacB?.aipac_total_2024 || 0) : 0) + (dmfiB ? (pacB?.dmfi_total_2024 || 0) : 0);
          } else if (selectedElection === "2026") {
            valA = (aipacA ? (pacA?.aipac_total_2026 || 0) : 0) + (dmfiA ? (pacA?.dmfi_total_2026 || 0) : 0);
            valB = (aipacB ? (pacB?.aipac_total_2026 || 0) : 0) + (dmfiB ? (pacB?.dmfi_total_2026 || 0) : 0);
          } else if (selectedElection === "2022") {
            valA = (aipacA ? (pacA?.aipac_total_2022 || 0) : 0) + (dmfiA ? (pacA?.dmfi_total_2022 || 0) : 0);
            valB = (aipacB ? (pacB?.aipac_total_2022 || 0) : 0) + (dmfiB ? (pacB?.dmfi_total_2022 || 0) : 0);
          }
        } else if (sortCol === "__election") {
          // Sort by election year (2024 first, then 2026, then 2022)
          valA = selectedElection === "2024" ? 3 : selectedElection === "2026" ? 2 : selectedElection === "2022" ? 1 : 0;
          valB = selectedElection === "2024" ? 3 : selectedElection === "2026" ? 2 : selectedElection === "2022" ? 1 : 0;
        } else if (sortCol === "__aipac_total") {
          if (selectedElection === "2024") {
            valA = aipacA ? (pacA?.aipac_total_2024 || 0) : 0;
            valB = aipacB ? (pacB?.aipac_total_2024 || 0) : 0;
          } else if (selectedElection === "2026") {
            valA = aipacA ? (pacA?.aipac_total_2026 || 0) : 0;
            valB = aipacB ? (pacB?.aipac_total_2026 || 0) : 0;
          } else if (selectedElection === "2022") {
            valA = aipacA ? (pacA?.aipac_total_2022 || 0) : 0;
            valB = aipacB ? (pacB?.aipac_total_2022 || 0) : 0;
          }
        } else if (sortCol === "__dmfi_total") {
          if (selectedElection === "2024") {
            valA = dmfiA ? (pacA?.dmfi_total_2024 || 0) : 0;
            valB = dmfiB ? (pacB?.dmfi_total_2024 || 0) : 0;
          } else if (selectedElection === "2026") {
            valA = dmfiA ? (pacA?.dmfi_total_2026 || 0) : 0;
            valB = dmfiB ? (pacB?.dmfi_total_2026 || 0) : 0;
          } else if (selectedElection === "2022") {
            valA = dmfiA ? (pacA?.dmfi_total_2022 || 0) : 0;
            valB = dmfiB ? (pacB?.dmfi_total_2022 || 0) : 0;
          }
        } else if (sortCol === "__aipac_direct") {
          if (selectedElection === "2024") {
            valA = aipacA ? (pacA?.aipac_direct_amount_2024 || 0) : 0;
            valB = aipacB ? (pacB?.aipac_direct_amount_2024 || 0) : 0;
          } else if (selectedElection === "2026") {
            valA = aipacA ? (pacA?.aipac_direct_amount_2026 || 0) : 0;
            valB = aipacB ? (pacB?.aipac_direct_amount_2026 || 0) : 0;
          } else if (selectedElection === "2022") {
            valA = aipacA ? (pacA?.aipac_direct_amount_2022 || 0) : 0;
            valB = aipacB ? (pacB?.aipac_direct_amount_2022 || 0) : 0;
          }
        } else if (sortCol === "__dmfi_direct") {
          if (selectedElection === "2024") {
            valA = dmfiA ? (pacA?.dmfi_direct_2024 || 0) : 0;
            valB = dmfiB ? (pacB?.dmfi_direct_2024 || 0) : 0;
          } else if (selectedElection === "2026") {
            valA = dmfiA ? (pacA?.dmfi_direct_2026 || 0) : 0;
            valB = dmfiB ? (pacB?.dmfi_direct_2026 || 0) : 0;
          } else if (selectedElection === "2022") {
            valA = dmfiA ? (pacA?.dmfi_direct_2022 || 0) : 0;
            valB = dmfiB ? (pacB?.dmfi_direct_2022 || 0) : 0;
          }
        } else if (sortCol === "__aipac_earmark") {
          if (selectedElection === "2024") {
            valA = aipacA ? (pacA?.aipac_earmark_amount_2024 || 0) : 0;
            valB = aipacB ? (pacB?.aipac_earmark_amount_2024 || 0) : 0;
          } else if (selectedElection === "2026") {
            valA = aipacA ? (pacA?.aipac_earmark_amount_2026 || 0) : 0;
            valB = aipacB ? (pacB?.aipac_earmark_amount_2026 || 0) : 0;
          } else if (selectedElection === "2022") {
            valA = aipacA ? (pacA?.aipac_earmark_amount_2022 || 0) : 0;
            valB = aipacB ? (pacB?.aipac_earmark_amount_2022 || 0) : 0;
          }
        } else if (sortCol === "__aipac_ie") {
          if (selectedElection === "2024") {
            valA = aipacA ? (pacA?.aipac_ie_total_2024 || 0) : 0;
            valB = aipacB ? (pacB?.aipac_ie_total_2024 || 0) : 0;
          } else if (selectedElection === "2026") {
            valA = aipacA ? (pacA?.aipac_ie_total_2026 || 0) : 0;
            valB = aipacB ? (pacB?.aipac_ie_total_2026 || 0) : 0;
          } else if (selectedElection === "2022") {
            valA = aipacA ? (pacA?.aipac_ie_total_2022 || 0) : 0;
            valB = aipacB ? (pacB?.aipac_ie_total_2022 || 0) : 0;
          }
        } else if (sortCol === "__dmfi_ie") {
          if (selectedElection === "2024") {
            valA = dmfiA ? (pacA?.dmfi_ie_total_2024 || 0) : 0;
            valB = dmfiB ? (pacB?.dmfi_ie_total_2024 || 0) : 0;
          } else if (selectedElection === "2026") {
            valA = 0; // No dmfi_ie for 2026
            valB = 0;
          } else if (selectedElection === "2022") {
            valA = dmfiA ? (pacA?.dmfi_ie_total_2022 || 0) : 0;
            valB = dmfiB ? (pacB?.dmfi_ie_total_2022 || 0) : 0;
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

    // Check if this bill was voted on in both chambers
    const voteTallies = (meta?.vote_tallies || "").toLowerCase();
    const hasHouseVote = voteTallies.includes("house");
    const hasSenateVote = voteTallies.includes("senate");
    const votedInBothChambers = hasHouseVote && hasSenateVote;

    const rankFor = (r: Row) => {
      const rawVal = (r as Record<string, unknown>)[sortCol];

      // Check for chamber mismatch (unless voted in both chambers)
      const notApplicable = !votedInBothChambers && colCh && colCh !== r.chamber;
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

  // Virtual scrolling: calculate which rows to actually render
  // On mobile, disable virtual scrolling for smooth native scrolling
  const { visibleRows, totalHeight, offsetY, startIndex, endIndex } = useMemo(() => {
    const totalRows = sorted.length;

    // On mobile, render all rows (no virtual scrolling)
    if (isMobile) {
      return {
        visibleRows: sorted,
        totalHeight: 0,
        offsetY: 0,
        startIndex: 0,
        endIndex: totalRows
      };
    }

    // Desktop: use virtual scrolling
    const containerHeight = tableScrollRef.current?.clientHeight || 700;

    // Calculate which rows are visible based on scroll position
    const startIdx = Math.floor(scrollTop / ROW_HEIGHT);
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT);

    // Add overscan to reduce flickering
    const start = Math.max(0, startIdx - OVERSCAN);
    const end = Math.min(totalRows, startIdx + visibleCount + OVERSCAN);

    // Slice the sorted array to only visible rows
    const visible = sorted.slice(start, end);

    // Calculate total height and offset for positioning
    const total = totalRows * ROW_HEIGHT;
    const offset = start * ROW_HEIGHT;

    return {
      visibleRows: visible,
      totalHeight: total,
      offsetY: offset,
      startIndex: start,
      endIndex: end
    };
  }, [sorted, scrollTop, isMobile]);

  // Scroll handler for virtual scrolling
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);

    // Hide header tooltips while scrolling
    setIsScrolling(true);
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);
  }, []);

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

      // Sort by bill number and title
      // Use bill_number field for sorting (e.g., "H.R.1422") instead of display_name (e.g., "Enhanced Iran Sanctions Act (H.R.1422)")
      const nameA = metaA?.bill_number || metaA?.display_name || metaA?.short_title || a;
      const nameB = metaB?.bill_number || metaB?.display_name || metaB?.short_title || b;

      // Check if bill starts with a number vs letter
      // Bills starting with letters (H.R., S., etc.) come before bills starting with numbers (119.H.Amdt., etc.)
      const startsWithNumberA = /^\d/.test(nameA);
      const startsWithNumberB = /^\d/.test(nameB);

      if (startsWithNumberA !== startsWithNumberB) {
        return startsWithNumberA ? 1 : -1; // Bills starting with numbers come after
      }

      // Match bill number pattern: "H.R.123", "S.456", "H.Con.Res.78", etc.
      const billRegex = /^([A-Z]+(?:\.[A-Z]+)*)\s*(\d+)/i;
      const matchA = nameA.match(billRegex);
      const matchB = nameB.match(billRegex);

      // If both have bill numbers, compare bill type first, then number numerically
      if (matchA && matchB) {
        const typeA = matchA[1];
        const typeB = matchB[1];
        const numA = parseInt(matchA[2], 10);
        const numB = parseInt(matchB[2], 10);

        // Compare bill type (H.R. vs S. vs H.Con.Res., etc.)
        const typeCompare = typeA.localeCompare(typeB);
        if (typeCompare !== 0) return typeCompare;

        // Compare bill number numerically
        if (numA !== numB) return numA - numB;
      }

      // Fall back to full alphanumeric comparison for the rest
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
    // Wider columns on mobile - sized so ~3 columns fit on screen (member + 2 data columns)
    // Bill columns are 33% wider to allow 2-line headers instead of 3
    const billsPart = billCols.map(() => isMobile ? "minmax(168px, 168px)" : "minmax(186px, 186px)").join(" ");
    const gradesPart = gradeColumns.map(() => isMobile ? "minmax(135px, 135px)" : "minmax(160px, 160px)").join(" ");
    // Member column: wider on mobile for comfortable reading
    // Mobile: min 126px to fit stacked names, max 40vw for responsive sizing
    // Desktop: fixed 300px for comfortable reading with photos
    const memberCol = isMobile ? "minmax(126px, min(40vw, 162px))" : "300px";
    // In summary mode: member col + grade cols + endorsements col
    if (f.viewMode === "summary") {
      return `${memberCol} ${gradesPart} minmax(144px, 144px)`;
    }
    // AIPAC mode: member col + overall grade + endorsements col + other grade cols + dynamic bill cols
    if (f.categories.has("AIPAC")) {
      // First grade column is Overall Grade (135px on mobile), then endorsements (144px), then remaining grade columns
      const restGradesPart = gradeColumns.slice(1).map(() => isMobile ? "minmax(135px, 135px)" : "minmax(160px, 160px)").join(" ");
      return `${memberCol} ${isMobile ? "minmax(135px, 135px)" : "minmax(160px, 160px)"} minmax(144px, 144px) ${restGradesPart} ${billsPart}`;
    }
    // Civil Rights & Immigration mode: member col + grade cols + dynamic bill cols
    if (f.categories.has("Civil Rights & Immigration")) {
      return `${memberCol} ${gradesPart} ${billsPart}`;
    }
    // member col + grade cols + dynamic bill cols + endorsements col
    return `${memberCol} ${gradesPart} ${billsPart} 9.6rem`;
  }, [billCols, gradeColumns, f.viewMode, f.categories, isMobile]);

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

      // Map average grade rank to color
      if (avgRank <= 2) { // A+ to A-
        colors[state] = GRADE_COLORS.A;
      } else if (avgRank <= 5) { // B+ to B-
        colors[state] = GRADE_COLORS.B;
      } else if (avgRank <= 8) { // C+ to C-
        colors[state] = GRADE_COLORS.C;
      } else if (avgRank <= 11) { // D+ to D-
        colors[state] = GRADE_COLORS.D;
      } else { // F
        colors[state] = GRADE_COLORS.F;
      }
    });

    return colors;
  }, [rows]);

  // PERFORMANCE: Compute tooltip data ONLY for the currently selected cell
  // This memo only runs when selectedCell changes, not on every render
  const selectedCellTooltipData = useMemo(() => {
    if (!selectedCell) return null;

    const row = visibleRows.find(r => String(r.bioguide_id) === selectedCell.rowId);
    if (!row) return null;

    const c = selectedCell.col;
    const valRaw = (row as Record<string, unknown>)[c];
    const val = Number(valRaw ?? 0);
    const meta = metaByCol.get(c);
    if (!meta) return null;

    // Now compute the expensive stuff ONCE for this selected cell
    const absentCol = `${c}_absent`;
    const wasAbsent = Number((row as Record<string, unknown>)[absentCol] ?? 0) === 1;
    const cosponsorCol = `${c}_cosponsor`;
    const didCosponsor = Number((row as Record<string, unknown>)[cosponsorCol] ?? 0) === 1;

    // Check for dash in preferred pairs (expensive loop - only run for selected cell)
    let showDashForPreferredPair = false;
    if (meta.pair_key && !isTrue((meta as any).preferred)) {
      for (const other of billCols) {
        if (other === c) continue;
        const m2 = metaByCol.get(other);
        if (m2?.pair_key === meta.pair_key && isTrue((m2 as any).preferred)) {
          const v2 = Number((row as any)[other] ?? 0);
          if (v2 > 0) {
            showDashForPreferredPair = true;
            break;
          }
        }
      }
    }

    // Calculate max points (expensive loop - only run for selected cell)
    let maxPoints = Number(meta.points ?? 0);
    if (meta.pair_key) {
      let pairMax = 0;
      let otherItemMax = 0;
      for (const other of cols) {
        const m2 = metaByCol.get(other);
        if (m2?.pair_key === meta.pair_key) {
          const otherMax = maxPointsByCol.get(other) || 0;
          if (otherMax > pairMax) pairMax = otherMax;
          if (other !== c) otherItemMax = otherMax;
        }
      }

      const thisItemMax = maxPointsByCol.get(c) || 0;
      const isPreferred = isTrue((meta as any).preferred);

      if (isPreferred) {
        maxPoints = val > 0 ? pairMax : pairMax - otherItemMax;
      } else {
        maxPoints = thisItemMax;
      }
    }

    const actionType = (meta as { action_types?: string })?.action_types || '';
    const isCosponsor = actionType.includes('cosponsor');
    const isVote = actionType.includes('vote');
    const position = (meta.position_to_score || '').toUpperCase();
    const isSupport = position === 'SUPPORT';
    const noCosponsorBenefit = meta.no_cosponsor_benefit === true || meta.no_cosponsor_benefit === 1 || meta.no_cosponsor_benefit === '1';

    // Determine action description
    let actionDescription = '';
    if (isCosponsor) {
      actionDescription = didCosponsor ? 'Cosponsored' : 'Has not cosponsored';
    } else if (isVote) {
      const gotPoints = val > 0;
      if (isSupport) {
        actionDescription = gotPoints ? 'Voted in favor' : 'Voted against';
      } else {
        actionDescription = gotPoints ? 'Voted against' : 'Voted in favor';
      }
    } else {
      actionDescription = val > 0 ? 'Support' : 'Oppose';
    }

    // Format points
    let pointsText;
    if (val > 0) {
      pointsText = `+${val.toFixed(0)} points`;
    } else if (val < 0) {
      pointsText = `${val.toFixed(0)} points`;
    } else {
      if (isCosponsor && noCosponsorBenefit && !isSupport && !didCosponsor) {
        pointsText = '0 points';
      } else {
        pointsText = `-${maxPoints} points`;
      }
    }

    return {
      row,
      meta,
      actionDescription,
      pointsText,
      wasAbsent,
      showDashForPreferredPair
    };
  }, [selectedCell, visibleRows, metaByCol, billCols, cols, maxPointsByCol]);

  return (
    <div className="space-y-0">
      {/* Header Band */}
      <div className="bg-[#002b49] dark:bg-slate-900 py-2 px-0 md:px-4 border-b border-[#001a2e] dark:border-slate-900">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-3">
          <a href="https://www.niacaction.org" target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
            <img
              src="https://niacouncil.org/wp-content/uploads/2020/05/NIAC-Action-Negative-over-Transparent-Small@2x-e1588645480145.png"
              alt="NIAC Action"
              className="h-10 md:h-12 w-auto block cursor-pointer hover:opacity-80 transition-opacity"
            />
          </a>
          <h1 className="text-xl md:text-2xl font-bold text-white">
            Scorecard
          </h1>
        </div>
      </div>

      <div className="space-y-2 px-0 pt-2 pb-2 md:p-3">
        <Filters categories={categories} filteredCount={sorted.length} metaByCol={metaByCol} cols={cols} selectedMapBill={selectedMapBill} setSelectedMapBill={setSelectedMapBill} rows={rows} />
      {selected && (
        <MemberModal
          row={selected}
          billCols={allBillCols}
          metaByCol={metaByCol}
          categories={categories}
          manualScoringMeta={manualScoringMeta}
          onClose={closeAllModals}
          onBack={modalHistory.length > 0 ? goBackModal : undefined}
          onBillClick={(meta, column) => pushBillModal(meta, column)}
          initialCategory={selectedFromAipac ? "AIPAC" : null}
        />
      )}
      {selectedBill && (
        <BillModal
          meta={selectedBill.meta}
          column={selectedBill.column}
          rows={rows}
          manualScoringMeta={manualScoringMeta}
          onClose={closeAllModals}
          onBack={modalHistory.length > 0 ? goBackModal : undefined}
          onMemberClick={(member) => pushMemberModal(member)}
          initialStateFilter={selectedBill.initialStateFilter}
        />
      )}

      {showAipacModal && (
        <AipacModal
          rows={rows}
          onClose={() => setShowAipacModal(false)}
          onMemberClick={(member) => {
            // Push AIPAC modal to history stack
            setModalHistory(prev => [...prev, { type: 'aipac', data: null }]);
            setShowAipacModal(false);
            setSelected(member);
          }}
        />
      )}

      {/* Views Container with Sliding Animation */}
      <div className="relative overflow-hidden">
        {/* Map View */}
        <div
          className={clsx(
            "card rounded-lg md:rounded-2xl p-0 md:p-4 transition-all duration-500 ease-in-out",
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
            onMemberClick={(member) => {
              setSelected(member);
              setSelectedFromAipac(selectedMapBill === "__AIPAC__");
            }}
            useDistrictMap={true}
            chamber={f.chamber}
            selectedBillColumn={selectedMapBill}
            metaByCol={metaByCol}
            allRows={rows}
            onBillMapClick={(stateCode) => {
              // Handle AIPAC/DMFI map selection
              if (selectedMapBill === "__AIPAC__") {
                // Navigate to all view with state filter and AIPAC category active
                f.set({
                  viewMode: "all",
                  state: stateCode,
                  // If we're in Senate mode on the map, keep Senate filter active
                  chamber: f.chamber === "SENATE" ? "SENATE" : "",
                  // Activate AIPAC category filter
                  categories: new Set(["AIPAC"])
                });
                return;
              }
              // Open bill modal with state filter when clicking on map with bill selected
              if (selectedMapBill) {
                const meta = metaByCol.get(selectedMapBill);
                if (meta) {
                  setSelectedBill({ meta, column: selectedMapBill, initialStateFilter: stateCode });
                }
              }
            }}
          />
        </div>

        {/* Table View */}
        <div
          className={clsx(
            "card rounded-lg md:rounded-2xl overflow-visible transition-all duration-500 ease-in-out",
            f.viewMode !== "map" && f.viewMode !== "tracker"
              ? "translate-x-0 opacity-100"
              : "translate-x-full opacity-0 absolute inset-0 pointer-events-none"
          )}
        >
          <div ref={tableScrollRef} className="overflow-x-auto overflow-y-auto min-h-[450px] max-h-[calc(100vh-14rem)] rounded-lg md:rounded-2xl" onScroll={handleScroll} style={{ overscrollBehavior: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}>
            {/* Header */}
            <div
              className="grid min-w-max sticky top-0 z-30 bg-white/70 dark:bg-slate-900/85 backdrop-blur-xl border-b border-[#E7ECF2] dark:border-slate-900 shadow-sm"
              style={{
                gridTemplateColumns: gridTemplate,
              }}
            >
            <div
              className={clsx(
                "th pl-4 sticky left-0 z-40 bg-white dark:bg-slate-900 border-r border-[#E7ECF2] dark:border-slate-900 cursor-pointer group flex flex-col justify-between",
                f.viewMode === "summary" && "!py-2"
              )}
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
              {f.viewMode !== "summary" && <div className="flex-1" />}
              <span className={clsx(
                "text-[10px] flex items-center gap-1",
                (sortCol === "__member" || sortCol === "__district") ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100"
              )}>
                <span className="text-[9px]">
                  {sortCol === "__district" ? "District" : sortCol === "__member" ? "Name" : "Sort"}
                </span>
                {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
              </span>
            </div>

            {/* Endorsements column header - before Overall Grade in AIPAC view */}
            {f.categories.has("AIPAC") && (
              <div className="th group relative select-none flex flex-col">
                {/* Header title - clickable to view AIPAC page with 2-line height */}
                <div className="h-[2.5rem] flex items-start">
                  <span
                    className="line-clamp-2 cursor-pointer hover:text-[#4B8CFB] transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAipacModal(true);
                    }}
                  >
                    Supported by AIPAC or DMFI
                  </span>
                </div>

                {/* Sortable indicator - always in uniform position */}
                <span
                  className={clsx(
                    "text-[10px] text-slate-400 dark:text-slate-500 font-light flex items-center gap-1 cursor-pointer",
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
                  <span>Sort</span>
                  <span className={clsx(
                    sortCol === "__aipac" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}>
                    {sortCol === "__aipac" ? (sortDir === "GOOD_FIRST" ? "▲" : "▼") : "▼"}
                  </span>
                </span>
              </div>
            )}

            {gradeColumns.map((gradeCol, idx) => {
              const isOverallGrade = gradeCol.header === "Overall Grade";
              const isSummaryMode = f.viewMode === "summary";
              const isCategoryHeader = isSummaryMode && !isOverallGrade;

              return (
                <React.Fragment key={gradeCol.field}>
                  <div
                    className={clsx(
                      "th group flex flex-col",
                      isSummaryMode ? "text-center !py-2" : "text-left",
                      idx === gradeColumns.length - 1 && "border-r border-[#E7ECF2] dark:border-slate-900"
                    )}
                  >
                    <div
                      className={clsx(
                        "flex items-center cursor-pointer",
                        isSummaryMode ? "justify-center" : "justify-start flex-1",
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
                      <div className="uppercase leading-tight">{gradeCol.header}</div>
                    </div>
                    {!isSummaryMode && (
                      <div
                        className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center justify-center gap-0.5 cursor-pointer"
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
                    )}
                  </div>

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
                      <div className="h-[3.375rem] flex flex-col items-start justify-start">
                        <div className="mb-1">Election Cycle</div>
                        <select
                          className="text-sm font-normal bg-transparent border border-slate-300 dark:border-slate-600 rounded px-2 py-0.5 cursor-pointer hover:border-[#4B8CFB] dark:hover:border-[#4B8CFB] focus:outline-none focus:border-[#4B8CFB] dark:focus:border-[#4B8CFB]"
                          value={selectedElection}
                          onChange={(e) => {
                            setSelectedElection(e.target.value as "2024" | "2026" | "2022");
                          }}
                        >
                          <option value="2026">2026</option>
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
                    className="th group relative select-none flex flex-col justify-end max-w-[14rem]"
                  >
                    {/* Header title - clickable to view AIPAC page with 2-line height */}
                    <div className="h-[2.5rem] flex items-start">
                      <span
                        className="line-clamp-2 cursor-pointer hover:text-[#4B8CFB] transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAipacModal(true);
                        }}
                      >
                        {headerLabels[c] || c}
                      </span>
                    </div>

                    {/* Sortable indicator - always in uniform position */}
                    <span
                      className={clsx(
                        "text-[10px] text-slate-400 dark:text-slate-500 font-light flex items-center gap-1 cursor-pointer",
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
                  onBillClick={(meta, column) => setSelectedBill({ meta, column })}
                  hideTooltip={isScrolling}
                />
              );
            })}
            {/* Endorsements column header - shown after bills in non-AIPAC views */}
            {!f.categories.has("AIPAC") && !f.categories.has("Civil Rights & Immigration") && (
              <div className={clsx(
                "th border-r border-[#E7ECF2] dark:border-slate-900 group relative select-none flex flex-col",
                f.viewMode === "summary" && "!py-2"
              )}>
                {/* Empty space for bill number alignment - hide in summary mode */}
                {f.viewMode !== "summary" && (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5 h-[14px]">
                    {'\u00A0'}
                  </div>
                )}
                {/* Header title - clickable to view AIPAC page */}
                <div className={clsx(f.viewMode === "summary" ? "flex items-center" : "h-[2.5rem] flex items-start")}>
                  <span
                    className={clsx(
                      "cursor-pointer hover:text-[#4B8CFB] transition-colors",
                      "line-clamp-2"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAipacModal(true);
                    }}
                  >
                    Supported by AIPAC or DMFI
                  </span>
                </div>

                {/* Sortable indicator - hide in summary mode */}
                {f.viewMode !== "summary" && (
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
                )}
              </div>
            )}

          </div>

          {/* Rows Container - conditionally wrapped for virtual scrolling on desktop */}
          <div style={isMobile ? { minWidth: 'max-content' } : { height: totalHeight, position: 'relative', minWidth: 'max-content' }}>
            <div style={isMobile ? { minWidth: 'max-content' } : { transform: `translateY(${offsetY}px)`, willChange: 'transform', minWidth: 'max-content' }}>
          {visibleRows.map((r, i) => (
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
                className="td pl-0 md:pl-4 flex flex-col md:flex-row md:items-center gap-0 md:gap-3 cursor-pointer sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition border-r border-[#E7ECF2] dark:border-slate-900"
                onClick={() => setSelected(r)}
              >
                {/* Photo - shown second on mobile, first on desktop */}
                {r.photo_url ? (
                  <img
                    src={String(r.photo_url)}
                    alt=""
                    className="w-[80%] md:w-[70px] h-auto md:h-[70px] aspect-square rounded-full object-cover bg-slate-200 dark:bg-white/10 flex-shrink-0 order-2 md:order-1 mx-auto md:mx-0"
                  />
                ) : (
                  <div className="w-[80%] md:w-[70px] h-auto md:h-[70px] aspect-square rounded-full bg-slate-300 dark:bg-white/10 flex-shrink-0 order-2 md:order-1 mx-auto md:mx-0" />
                )}

                {/* Desktop: Text section with role, name, and badges */}
                <div className="hidden md:flex md:flex-col md:justify-center min-w-0 md:order-2">
                  {/* Role/Title - top */}
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium mb-0.5">
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

                  {/* Name - middle */}
                  <div className="font-bold text-[16px] leading-5 text-slate-800 dark:text-white">
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

                  {/* Badges - bottom */}
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 whitespace-nowrap flex-wrap mt-1">
                    {/* Chamber */}
                    <span
                      className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold"
                      style={{
                        color: '#64748b',
                        backgroundColor: `${chamberColor(r.chamber)}20`,
                      }}
                    >
                      {r.chamber === "HOUSE" ? "House" : r.chamber === "SENATE" ? "Senate" : (r.chamber || "")}
                    </span>

                    {/* Party */}
                    <span
                      className="px-1.5 py-0.5 rounded-md text-[11px] font-medium border"
                      style={partyBadgeStyle(r.party)}
                    >
                      {partyLabel(r.party)}
                    </span>

                    {/* District */}
                    <span className="text-[11px]">
                      {r.chamber === "HOUSE" ? `${stateCodeOf(r.state)}-${r.district || '1'}` : stateCodeOf(r.state)}
                    </span>
                  </div>
                </div>

                {/* Mobile: Name first, then badges */}
                <div className="md:hidden order-1 px-2 pt-1 pb-0">
                  <div className="font-bold text-xs leading-tight text-slate-800 dark:text-white text-center">
                    {(() => {
                      const fullName = String(r.full_name || "");
                      const commaIndex = fullName.indexOf(",");
                      if (commaIndex > -1) {
                        const first = fullName.slice(commaIndex + 1).trim();
                        const last = fullName.slice(0, commaIndex).trim();
                        return (
                          <>
                            <span className="block">{first}</span>
                            <span className="block">{last}</span>
                          </>
                        );
                      }
                      return fullName;
                    })()}
                  </div>
                </div>

                {/* Mobile: Badges */}
                <div className="md:hidden order-3 px-2 py-1">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1 whitespace-nowrap">
                    {/* Chamber */}
                    <span
                      className="px-1 py-0.5 rounded-md text-[9px] font-semibold"
                      style={{
                        color: '#64748b',
                        backgroundColor: `${chamberColor(r.chamber)}20`,
                      }}
                    >
                      {r.chamber === "HOUSE" ? "House" : r.chamber === "SENATE" ? "Senate" : (r.chamber || "")}
                    </span>

                    {/* Party */}
                    <span
                      className="px-1 py-0.5 rounded-md text-[9px] font-medium border"
                      style={partyBadgeStyle(r.party)}
                    >
                      {(() => {
                        const label = partyLabel(r.party);
                        if (label.startsWith("Republican")) return "R";
                        if (label.startsWith("Democrat")) return "D";
                        if (label.startsWith("Independent")) return "I";
                        return label;
                      })()}
                    </span>

                    {/* District */}
                    <span className="text-[9px]">
                      {r.chamber === "HOUSE" ? `${stateCodeOf(r.state)}-${r.district || '1'}` : stateCodeOf(r.state)}
                    </span>
                  </div>
                </div>
              </div>

              {gradeColumns.map((gradeCol, idx) => {
                const isOverall = idx === 0;
                const isSummaryMode = f.viewMode === "summary";

                return (
                  <React.Fragment key={gradeCol.field}>
                    <div
                      className={clsx(
                        "td flex items-center justify-center !py-0 md:!py-3",
                        idx === gradeColumns.length - 1 && !f.categories.has("AIPAC") && "border-r border-[#E7ECF2] dark:border-slate-900",
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
                      <div className="td border-r border-[#E7ECF2] dark:border-slate-900 px-2 flex items-center">
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
                          const aipac = isAipacEndorsed(pacData, r.aipac_supported);
                          const dmfi = isDmfiEndorsed(pacData, r.dmfi_supported);

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
                  </React.Fragment>
                );
              })}

              {/* bill columns -> binary check / x / N/A for other chamber */}
              {billCols.map((c) => {
                // Handle AIPAC-specific columns
                if (c.startsWith("__aipac_") || c.startsWith("__dmfi_") || c === "__total_support" || c === "__election") {
                  const pacData = pacDataMap.get(String(r.bioguide_id));
                  const aipac = isAipacEndorsed(pacData, r.aipac_supported);
                  const dmfi = isDmfiEndorsed(pacData, r.dmfi_supported);
                  // Use selectedElection instead of getElectionYear
                  const electionYear = selectedElection;

                  // Election column
                  if (c === "__election") {
                    return (
                      <div key={c} className="td !px-0 !py-0 flex items-center justify-center text-sm tabular border-b border-[#E7ECF2] dark:border-slate-900">
                        {getElectionLabel(electionYear)}
                      </div>
                    );
                  }

                  // Total support column
                  if (c === "__total_support") {
                    let totalSupport = 0;
                    if (electionYear === "2024") {
                      totalSupport = (aipac ? (pacData?.aipac_total_2024 || 0) : 0) + (dmfi ? (pacData?.dmfi_total_2024 || 0) : 0);
                    } else if (electionYear === "2026") {
                      totalSupport = (aipac ? (pacData?.aipac_total_2026 || 0) : 0) + (dmfi ? (pacData?.dmfi_total_2026 || 0) : 0);
                    } else if (electionYear === "2022") {
                      totalSupport = (aipac ? (pacData?.aipac_total_2022 || 0) : 0) + (dmfi ? (pacData?.dmfi_total_2022 || 0) : 0);
                    }
                    return (
                      <div key={c} className="td !px-0 !py-0 flex items-center justify-center text-sm tabular font-medium border-b border-[#E7ECF2] dark:border-slate-900">
                        {totalSupport > 0 ? `$${totalSupport.toLocaleString()}` : "—"}
                      </div>
                    );
                  }

                  // Monetary columns - use appropriate year's data
                  let amount = 0;
                  if (electionYear === "2024") {
                    if (c === "__aipac_total") amount = aipac ? (pacData?.aipac_total_2024 || 0) : 0;
                    else if (c === "__dmfi_total") amount = dmfi ? (pacData?.dmfi_total_2024 || 0) : 0;
                    else if (c === "__aipac_direct") amount = aipac ? (pacData?.aipac_direct_amount_2024 || 0) : 0;
                    else if (c === "__dmfi_direct") amount = dmfi ? (pacData?.dmfi_direct_2024 || 0) : 0;
                    else if (c === "__aipac_earmark") amount = aipac ? (pacData?.aipac_earmark_amount_2024 || 0) : 0;
                    else if (c === "__aipac_ie") amount = aipac ? (pacData?.aipac_ie_total_2024 || 0) : 0;
                    else if (c === "__dmfi_ie") amount = dmfi ? (pacData?.dmfi_ie_total_2024 || 0) : 0;
                  } else if (electionYear === "2026") {
                    if (c === "__aipac_total") amount = aipac ? (pacData?.aipac_total_2026 || 0) : 0;
                    else if (c === "__dmfi_total") amount = dmfi ? (pacData?.dmfi_total_2026 || 0) : 0;
                    else if (c === "__aipac_direct") amount = aipac ? (pacData?.aipac_direct_amount_2026 || 0) : 0;
                    else if (c === "__dmfi_direct") amount = dmfi ? (pacData?.dmfi_direct_2026 || 0) : 0;
                    else if (c === "__aipac_earmark") amount = aipac ? (pacData?.aipac_earmark_amount_2026 || 0) : 0;
                    else if (c === "__aipac_ie") amount = aipac ? (pacData?.aipac_ie_total_2026 || 0) : 0;
                    else if (c === "__dmfi_ie") amount = 0; // No dmfi_ie for 2026
                  } else if (electionYear === "2022") {
                    if (c === "__aipac_total") amount = aipac ? (pacData?.aipac_total_2022 || 0) : 0;
                    else if (c === "__dmfi_total") amount = dmfi ? (pacData?.dmfi_total_2022 || 0) : 0;
                    else if (c === "__aipac_direct") amount = aipac ? (pacData?.aipac_direct_amount_2022 || 0) : 0;
                    else if (c === "__dmfi_direct") amount = dmfi ? (pacData?.dmfi_direct_2022 || 0) : 0;
                    else if (c === "__aipac_earmark") amount = aipac ? (pacData?.aipac_earmark_amount_2022 || 0) : 0;
                    else if (c === "__aipac_ie") amount = aipac ? (pacData?.aipac_ie_total_2022 || 0) : 0;
                    else if (c === "__dmfi_ie") amount = dmfi ? (pacData?.dmfi_ie_total_2022 || 0) : 0;
                  }

                  return (
                    <div key={c} className="td !px-0 !py-0 flex items-center justify-center text-sm tabular border-b border-[#E7ECF2] dark:border-slate-900">
                      {amount > 0 ? `$${amount.toLocaleString()}` : "—"}
                    </div>
                  );
                }

                // Regular bill columns - LIGHTWEIGHT RENDERING ONLY
                const valRaw = (r as Record<string, unknown>)[c];
                const val = Number(valRaw ?? 0);
                const meta = metaByCol.get(c);

                // LIGHTWEIGHT: Only compute what's needed for visual display
                const absentCol = `${c}_absent`;
                const wasAbsent = Number((r as Record<string, unknown>)[absentCol] ?? 0) === 1;

                const cosponsorCol = `${c}_cosponsor`;
                const didCosponsor = Number((r as Record<string, unknown>)[cosponsorCol] ?? 0) === 1;

                const inferredChamber = inferChamber(meta, c);

                // Check if this bill was voted on in both chambers
                const voteTallies = (meta?.vote_tallies || "").toLowerCase();
                const hasHouseVote = voteTallies.includes("house");
                const hasSenateVote = voteTallies.includes("senate");
                const votedInBothChambers = hasHouseVote && hasSenateVote;

                // If voted in both chambers, it applies to all members regardless of chamber
                const notApplicable = !votedInBothChambers && inferredChamber && inferredChamber !== r.chamber;

                const isManualAction = meta?.type === "MANUAL";
                const manualActionNotApplicable = isManualAction && (valRaw === null || valRaw === undefined || valRaw === '');

                // LIGHTWEIGHT: Quick check for icon display
                const actionType = (meta as { action_types?: string })?.action_types || '';
                const isCosponsor = actionType.includes('cosponsor');
                const position = (meta?.position_to_score || '').toUpperCase();
                const isSupport = position === 'SUPPORT';
                const noCosponsorBenefit = meta?.no_cosponsor_benefit === true ||
                                           meta?.no_cosponsor_benefit === 1 ||
                                           meta?.no_cosponsor_benefit === '1';

                let memberOk = val > 0;
                if (isCosponsor && noCosponsorBenefit && !isSupport) {
                  memberOk = !didCosponsor;
                }

                const fullPoints = Number(meta?.points ?? 0);
                const votedPresent = !wasAbsent && actionType.includes('vote') && val > 0 && val < fullPoints;

                // LIGHTWEIGHT: Only check if we need dash (simplified - no expensive loops)
                const showDashForPreferredPair = meta?.pair_key && !isTrue((meta as any).preferred) && val === 0 && !notApplicable;

                const bioguideId = String(r.bioguide_id || "");
                const isTooltipOpen = selectedCell?.rowId === bioguideId && selectedCell?.col === c;

                // Generate tooltip text for native title attribute
                let tooltipText = "";
                if (notApplicable || manualActionNotApplicable) {
                  tooltipText = "Not applicable";
                } else if (votedPresent) {
                  tooltipText = "Voted Present";
                } else if (wasAbsent) {
                  tooltipText = "Did not vote";
                } else if (showDashForPreferredPair) {
                  tooltipText = "Not penalized";
                } else {
                  const isVote = actionType.includes('vote');
                  const position = (meta?.position_to_score || '').toUpperCase();
                  const isSupport = position === 'SUPPORT';

                  if (isCosponsor) {
                    tooltipText = didCosponsor ? "Cosponsored" : "Has not cosponsored";
                  } else if (isVote) {
                    if (isSupport) {
                      tooltipText = memberOk ? "Voted in favor" : "Voted against";
                    } else {
                      tooltipText = memberOk ? "Voted against" : "Voted in favor";
                    }
                  } else {
                    tooltipText = memberOk ? "Supported" : "Opposed";
                  }
                }
                tooltipText += " · click for more";

                return (
                  <div
                    key={c}
                    className="group/cell relative td !px-0 !py-0 flex items-center justify-center border-b border-[#E7ECF2] dark:border-slate-900 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    {...(!isMobile && { title: tooltipText })}
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


                    {/* Tooltip - shown on click */}
                    {isTooltipOpen && meta && typeof document !== 'undefined' && createPortal(
                      <>
                        {/* Backdrop overlay */}
                        <div
                          className="fixed inset-0 bg-black/30 z-[99]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCell(null);
                          }}
                        />
                        {/* Centered tooltip modal */}
                        <div className="pointer-events-auto fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-[28rem] max-w-[90vw] rounded-xl border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-[#1a2332] p-3 shadow-2xl">
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

                        <button
                          className={clsx(
                            (meta.display_name || meta.short_title) ? "text-base font-bold" : "text-sm font-semibold",
                            "text-slate-900 dark:text-slate-100 hover:text-[#4B8CFB] dark:hover:text-[#4B8CFB] cursor-pointer pr-8 text-left"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCell(null);
                            setSelectedBill({ meta, column: c });
                          }}
                        >
                          {meta.display_name || meta.short_title || c}
                        </button>
                        <div className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                          <span className="font-medium">NIAC Action Position:</span> {formatPositionTooltip(meta)}
                        </div>
                        {meta.description && <div className="text-xs text-slate-700 dark:text-slate-200 mt-2 normal-case font-normal">{meta.description}</div>}
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
                        <div className="mt-3 pt-3 border-t border-[#E7ECF2] dark:border-slate-900 flex items-center gap-2">
                          {(() => {
                            const memberLastName = lastName(String(r.full_name || ""));
                            const capitalizedLastName = memberLastName.charAt(0).toUpperCase() + memberLastName.slice(1);
                            const title = r.chamber === "SENATE" ? "Sen." : "Rep.";

                            // Lightweight variables for tooltip text (only computed when tooltip is open)
                            const isVote = actionType.includes('vote');
                            const position = (meta?.position_to_score || '').toUpperCase();
                            const isSupport = position === 'SUPPORT';

                            if (notApplicable || manualActionNotApplicable) {
                              let naReason = "";
                              if (notApplicable) {
                                // Different chamber - show which chamber the bill is for
                                const billChamber = inferredChamber === "HOUSE" ? "House" : "Senate";
                                naReason = `N/A - ${billChamber} only`;
                              } else if (manualActionNotApplicable) {
                                // Manual action member wasn't eligible for - check if it's a committee vote
                                // Use meta.action_types directly to avoid scope issues
                                const metaActionTypes = ((meta as { action_types?: string })?.action_types || '').toLowerCase();
                                const isCommitteeVote = metaActionTypes.includes('committee vote') || metaActionTypes.includes('committee');
                                naReason = isCommitteeVote ? "N/A - Not on committee" : "N/A - Not eligible";
                              }
                              return <span className="text-xs text-slate-400">{naReason}</span>;
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
                                          ? (
                                            isSupport
                                              ? (memberOk ? "voted in favor" : "voted against")
                                              : (memberOk ? "voted against" : "voted in favor")
                                          )
                                          : (memberOk ? "supported" : "opposed")
                                    }
                                  </span>
                                </>
                              );
                            }
                          })()}
                        </div>
                        </div>
                      </>,
                      document.body
                    )}
                  </div>
                );
              })}

              {/* Endorsements column - shown after bills in non-AIPAC views */}
              {!f.categories.has("AIPAC") && !f.categories.has("Civil Rights & Immigration") && (
                <div
                  className="td border-r border-[#E7ECF2] dark:border-slate-900 px-2 flex items-center cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10"
                  onClick={() => f.set({ viewMode: "category", categories: new Set(["AIPAC"]) })}
                  title="Click to view AIPAC details"
                >
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
                    const aipac = isAipacEndorsed(pacData, r.aipac_supported);
                    const dmfi = isDmfiEndorsed(pacData, r.dmfi_supported);

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

            </div>
          ))}
            </div>
          </div>
        </div>
        </div>

        {/* Tracker View */}
        <div
          className={clsx(
            "card rounded-lg md:rounded-2xl overflow-visible transition-all duration-500 ease-in-out",
            f.viewMode === "tracker"
              ? "translate-x-0 opacity-100"
              : "translate-x-full opacity-0 absolute inset-0 pointer-events-none"
          )}
        >
          {/* Bill search indicator */}
          {f.billColumn && (
            <div className="bg-[#4B8CFB] text-white px-4 py-2 rounded-t-lg md:rounded-t-2xl flex items-center justify-between">
              <span className="text-sm">
                Searching: &quot;{f.billColumn}&quot;
              </span>
              <button
                onClick={() => f.set({ billColumn: "" })}
                className="text-white hover:bg-white/20 px-2 py-1 rounded text-sm flex items-center gap-1"
              >
                Clear ✕
              </button>
            </div>
          )}
          <div ref={trackerScrollRef} className="overflow-hidden overflow-y-auto min-h-[450px] max-h-[calc(100vh-14rem)] rounded-lg md:rounded-2xl w-full relative" style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }} onScroll={(e) => { e.currentTarget.scrollLeft = 0; }}>
            {(() => {
              // Process bills data
              let bills = cols.map((col) => {
                const meta = metaByCol.get(col);
                if (!meta) return null;

                const inferredChamber = inferChamber(meta, col);
                const actionType = (meta as { action_types?: string })?.action_types || '';
                const position = (meta?.position_to_score || '').toUpperCase();
                const categories = (meta?.categories || "")
                  .split(";")
                  .map((s) => s.trim())
                  .filter(Boolean);

                // Check if this bill was voted on in both chambers
                const voteTallies = (meta?.vote_tallies || "").toLowerCase();
                const hasHouseVote = voteTallies.includes("house");
                const hasSenateVote = voteTallies.includes("senate");
                const votedInBothChambers = hasHouseVote && hasSenateVote;

                // Count cosponsors dynamically from the wide CSV if this is a cosponsor action
                const isCosponsor = actionType.includes('cosponsor');
                if (isCosponsor && !meta.cosponsors) {
                  const cosponsorCol = `${col}_cosponsor`;
                  const cosponsorCount = rows.filter(row => {
                    // Only count members from the appropriate chamber (unless voted in both)
                    if (!votedInBothChambers && inferredChamber && row.chamber !== inferredChamber) {
                      return false;
                    }
                    // Check if they cosponsored
                    return Number((row as Record<string, unknown>)[cosponsorCol] ?? 0) === 1;
                  }).length;

                  // Add cosponsor count to meta (include sponsor by adding 1)
                  // The sponsor is the original author, so total cosponsors = cosponsors + sponsor
                  (meta as any).cosponsors = cosponsorCount + 1;
                }

                // Find sponsor from metadata
                const sponsorBioguideId = meta?.sponsor_bioguide_id;
                const sponsorName = meta?.sponsor_name || meta?.sponsor;

                // Try to find sponsor by bioguide_id first, then by name
                let sponsor = sponsorBioguideId
                  ? rows.find(r => r.bioguide_id === sponsorBioguideId)
                  : undefined;

                // If no sponsor found by bioguide_id but we have a name, try to find by name
                if (!sponsor && sponsorName) {
                  sponsor = rows.find(r =>
                    r.full_name?.toLowerCase().includes(sponsorName.toLowerCase()) ||
                    sponsorName.toLowerCase().includes(r.full_name?.toLowerCase() || '')
                  );
                }

                return {
                  col,
                  meta,
                  inferredChamber,
                  actionType,
                  position,
                  categories,
                  sponsor,
                };
              }).filter(Boolean);

              // Apply category filter
              if (f.categories.size > 0) {
                bills = bills.filter((bill: any) =>
                  bill.categories.some((cat: string) => f.categories.has(cat))
                );
              }

              // Apply chamber filter
              if (f.chamber) {
                bills = bills.filter((bill: any) =>
                  bill.inferredChamber === f.chamber || bill.inferredChamber === ""
                );
              }

              // Apply bill search filter (f.billColumn contains search query)
              if (f.billColumn) {
                const query = f.billColumn.toLowerCase().trim();
                // Normalize bill number for flexible matching
                const normalizeBillNumber = (str: string) => {
                  return str
                    .toLowerCase()
                    .replace(/\s+/g, '') // Remove spaces
                    .replace(/\./g, ''); // Remove periods
                };
                const normalizedQuery = normalizeBillNumber(query);

                bills = bills.filter((bill: any) => {
                  const billNumber = (bill.meta?.bill_number || "").toLowerCase();
                  const displayName = (bill.meta?.display_name || "").toLowerCase();
                  const shortTitle = (bill.meta?.short_title || "").toLowerCase();
                  const description = (bill.meta?.description || "").toLowerCase();
                  const analysis = (bill.meta?.analysis || "").toLowerCase();
                  const notes = (bill.meta?.notes || "").toLowerCase();

                  // Check direct matches
                  if (
                    billNumber.includes(query) ||
                    displayName.includes(query) ||
                    shortTitle.includes(query) ||
                    description.includes(query) ||
                    analysis.includes(query) ||
                    notes.includes(query)
                  ) {
                    return true;
                  }

                  // Check normalized bill number match
                  const normalizedBillNumber = normalizeBillNumber(billNumber);
                  if (normalizedBillNumber.includes(normalizedQuery) || normalizedQuery.includes(normalizedBillNumber)) {
                    return true;
                  }

                  return false;
                });
              }

              // Group bills by category
              const billsByCategory = new Map<string, any[]>();
              bills.forEach((bill: any) => {
                bill.categories.forEach((cat: string) => {
                  if (!billsByCategory.has(cat)) {
                    billsByCategory.set(cat, []);
                  }
                  billsByCategory.get(cat)!.push(bill);
                });
              });

              // Remove duplicates (bills that appear in multiple categories)
              billsByCategory.forEach((categoryBills, category) => {
                billsByCategory.set(category, Array.from(new Set(categoryBills)));
              });

              // Sort bills within each category by chamber, then by bill number
              billsByCategory.forEach((categoryBills, category) => {
                const sorted = categoryBills.sort((a: any, b: any) => {
                  // Sort by chamber first (HOUSE, SENATE, empty)
                  const chamberOrder: Record<string, number> = { "HOUSE": 1, "SENATE": 2, "": 3 };
                  const chamberCompare = (chamberOrder[a.inferredChamber as string] || 3) - (chamberOrder[b.inferredChamber as string] || 3);
                  if (chamberCompare !== 0) return chamberCompare;

                  // Then sort by bill number and title
                  // Use bill_number field for proper numeric sorting
                  const nameA = a.meta?.bill_number || a.meta?.display_name || a.meta?.short_title || a.col;
                  const nameB = b.meta?.bill_number || b.meta?.display_name || b.meta?.short_title || b.col;

                  const billRegex = /^([A-Z]+(?:\.[A-Z]+)*)\s*(\d+)/i;
                  const matchA = nameA.match(billRegex);
                  const matchB = nameB.match(billRegex);

                  if (matchA && matchB) {
                    const typeA = matchA[1];
                    const typeB = matchB[1];
                    const numA = parseInt(matchA[2], 10);
                    const numB = parseInt(matchB[2], 10);

                    const typeCompare = typeA.localeCompare(typeB);
                    if (typeCompare !== 0) return typeCompare;

                    if (numA !== numB) return numA - numB;
                  }

                  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
                });
                billsByCategory.set(category, sorted);
              });

              // Sort categories
              const sortedCategories = Array.from(billsByCategory.keys()).sort();

              return (
                <>
                  {/* Header */}
                  <div
                    className="grid sticky top-0 z-30 bg-white/70 dark:bg-slate-900/85 backdrop-blur-xl border-b border-[#E7ECF2] dark:border-slate-900 shadow-sm w-full"
                    style={{
                      gridTemplateColumns: isMobile ? "1fr 0.6fr" : "40px calc(100% - 320px) 100px 180px",
                    }}
                  >
                    <div className="th px-2 hidden md:block"></div>
                    <div className="th pl-4">Bill Information</div>
                    <div className="th text-center">Our Position</div>
                    <div className="th text-center hidden md:block">Sponsor</div>
                  </div>

                  {/* Bill Rows - Grouped by Category */}
                  <div className="w-full max-w-full pb-8 md:pb-4">
                    {sortedCategories.map((category) => (
                      <div key={category}>
                        {/* Category Header */}
                        <div className="bg-slate-100 dark:bg-slate-800 border-b border-[#E7ECF2] dark:border-slate-900 px-4 py-3 text-center">
                          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {category}
                          </h3>
                        </div>

                        {/* Bills in this category */}
                        {billsByCategory.get(category)!.map((bill: any) => {
                          const isExpanded = expandedBills.has(bill.col);
                          return (
                            <div
                              key={bill.col}
                              className="border-b border-[#E7ECF2] dark:border-slate-900"
                            >
                              {/* Collapsed view - always visible */}
                              <div
                                className="grid hover:bg-slate-50 dark:hover:bg-white/5 transition cursor-pointer w-full"
                                style={{
                                  gridTemplateColumns: isMobile ? "1fr 0.6fr" : "40px calc(100% - 320px) 100px 180px",
                                  alignItems: "center",
                                }}
                                onClick={() => {
                                  setExpandedBills(prev => {
                                    const next = new Set(prev);
                                    if (next.has(bill.col)) {
                                      next.delete(bill.col);
                                    } else {
                                      next.add(bill.col);
                                    }
                                    return next;
                                  });
                                }}
                              >
                                {/* Expand/Collapse Button */}
                                <div
                                  className="px-2 py-3 items-center justify-center hidden md:flex"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedBills(prev => {
                                      const next = new Set(prev);
                                      if (next.has(bill.col)) {
                                        next.delete(bill.col);
                                      } else {
                                        next.add(bill.col);
                                      }
                                      return next;
                                    });
                                  }}
                                >
                                  <svg
                                    className={clsx(
                                      "w-3 h-3 transition-transform text-slate-500 dark:text-slate-400",
                                      isExpanded && "rotate-90"
                                    )}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>

                                {/* Bill Info - Chamber, Category, Title */}
                                <div
                                  className="py-3 text-sm text-slate-800 dark:text-white pl-4 pr-3 min-w-0"
                                >
                                  {/* Title */}
                                  <button
                                    className="text-sm font-bold text-slate-700 dark:text-slate-200 hover:text-[#4B8CFB] dark:hover:text-[#4B8CFB] text-left transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedBill({ meta: bill.meta, column: bill.col });
                                    }}
                                  >
                                    {bill.meta.display_name || bill.meta.short_title || bill.meta.bill_number || bill.col}
                                  </button>
                                  {/* Description */}
                                  {bill.meta.description && (
                                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 hidden md:block">
                                      {bill.meta.description}
                                    </div>
                                  )}
                                </div>

                                {/* NIAC Action Position */}
                                <div
                                  className="py-3 text-sm text-slate-800 dark:text-white flex items-center justify-center"
                                >
                                  <span className={clsx(
                                    "px-1 rounded text-[10px] font-medium border",
                                    bill.position === "SUPPORT"
                                      ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700"
                                      : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700"
                                  )}>
                                    {bill.position === "SUPPORT" ? "Support" : "Oppose"}
                                  </span>
                                </div>

                                {/* Sponsor */}
                                <div
                                  className="py-3 text-sm text-slate-800 dark:text-white pl-4 pr-3 hidden md:block min-w-0"
                                >
                                  {bill.sponsor ? (
                                    <div className="flex items-center gap-2 max-w-full">
                                      {bill.sponsor.photo_url ? (
                                        <img
                                          src={String(bill.sponsor.photo_url)}
                                          alt=""
                                          className="h-8 w-8 rounded-full object-cover bg-slate-200 dark:bg-white/10 flex-shrink-0"
                                        />
                                      ) : (
                                        <div className="h-8 w-8 rounded-full bg-slate-300 dark:bg-white/10 flex-shrink-0" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100 break-words leading-tight">
                                          {bill.sponsor.full_name}
                                        </div>
                                        <div className="flex items-center gap-1 text-xs mt-0.5">
                                          <span
                                            className="px-1 py-0.5 rounded text-[10px] font-medium"
                                            style={partyBadgeStyle(bill.sponsor.party)}
                                          >
                                            {partyLabel(bill.sponsor.party)}
                                          </span>
                                          <span className="text-slate-500 dark:text-slate-400 text-[10px]">
                                            {stateCodeOf(bill.sponsor.state)}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-slate-500 dark:text-slate-400">No sponsor</div>
                                  )}
                                </div>
                              </div>

                              {/* Expanded view - Status and Analysis */}
                              {isExpanded && (
                                <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-3 border-t border-[#E7ECF2] dark:border-slate-900">
                                  <div className="space-y-3">
                                    {/* Status */}
                                    <div>
                                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 mr-2">Status:</span>
                                      <span className="text-xs text-slate-600 dark:text-slate-400">
                                        {(() => {
                                          const { voteResult, dateIntroduced } = extractVoteInfo(bill.meta);
                                          if (voteResult) {
                                            return voteResult;
                                          } else if (dateIntroduced) {
                                            return `Introduced ${dateIntroduced}`;
                                          }
                                          return "Pending";
                                        })()}
                                      </span>
                                      {!extractVoteInfo(bill.meta).voteResult && bill.meta.cosponsors && (
                                        <>
                                          <span className="text-xs text-slate-400 dark:text-slate-500 mx-2">•</span>
                                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 mr-1">Cosponsors:</span>
                                          <span className="text-xs text-slate-600 dark:text-slate-400">{bill.meta.cosponsors}</span>
                                        </>
                                      )}
                                    </div>

                                    {/* Analysis */}
                                    {bill.meta.analysis && (
                                      <div>
                                        <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Analysis:</div>
                                        <div className="text-xs text-slate-600 dark:text-slate-300">
                                          {bill.meta.analysis}
                                        </div>
                                      </div>
                                    )}

                                    {/* More Information Link */}
                                    <div className="pt-2">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedBill({ meta: bill.meta, column: bill.col });
                                        }}
                                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                                      >
                                        More Information
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function Filters({ filteredCount, metaByCol, cols, selectedMapBill, setSelectedMapBill, rows }: { categories: string[]; filteredCount: number; metaByCol: Map<string, Meta>; cols: string[]; selectedMapBill: string; setSelectedMapBill: (value: string) => void; rows: Row[] }) {
  const f = useFilters();
  // Always start with same initial state on server and client to avoid hydration mismatch
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  // Auto-expand filters in map view; on mobile, collapse in summary/category/tracker modes
  useEffect(() => {
    const checkMobile = () => window.innerWidth < 768;
    const isMobile = checkMobile();

    if (f.viewMode === "map") {
      setFiltersExpanded(true);
    } else if (isMobile) {
      // On mobile, collapse chamber/party/state filters in summary, category, and tracker modes
      // (category buttons are always visible, so we only need to toggle chamber/party/state)
      setFiltersExpanded(false);
    } else {
      // On desktop, always keep filters expanded
      setFiltersExpanded(true);
    }
  }, [f.viewMode]);

  // Filter bills to only show those with actual data (at least some members have numeric values)
  const billsWithData = useMemo(() => {
    const filtered = cols.filter(col => {
      // Skip manual actions
      const meta = metaByCol.get(col);
      if (meta?.type === 'MANUAL') return false;

      // Count how many members have data for this bill
      let count = 0;
      for (const row of rows) {
        const value = row[col];
        // Skip empty values
        if (value === undefined || value === null || value === '' || value === -1) continue;
        const numVal = Number(value);
        // Accept any numeric value (including point scores like 7.0)
        if (!isNaN(numVal)) {
          count++;
          // Require at least 5 members to have data for the bill to be meaningful
          if (count >= 5) return true;
        }
      }
      return false;
    });

    // Sort bills: letters before numbers, then by bill number
    return filtered.sort((a, b) => {
      const metaA = metaByCol.get(a);
      const metaB = metaByCol.get(b);
      // Use bill_number field for proper numeric sorting
      const nameA = metaA?.bill_number || metaA?.display_name || metaA?.short_title || a;
      const nameB = metaB?.bill_number || metaB?.display_name || metaB?.short_title || b;

      // Check if bill starts with a number vs letter
      // Bills starting with letters (H.R., S., etc.) come before bills starting with numbers (119.H.Amdt., etc.)
      const startsWithNumberA = /^\d/.test(nameA);
      const startsWithNumberB = /^\d/.test(nameB);

      if (startsWithNumberA !== startsWithNumberB) {
        return startsWithNumberA ? 1 : -1; // Bills starting with numbers come after
      }

      // Match bill number pattern: "H.R.123", "S.456", "H.Con.Res.78", etc.
      const billRegex = /^([A-Z]+(?:\.[A-Z]+)*)\s*(\d+)/i;
      const matchA = nameA.match(billRegex);
      const matchB = nameB.match(billRegex);

      // If both have bill numbers, compare bill type first, then number numerically
      if (matchA && matchB) {
        const typeA = matchA[1];
        const typeB = matchB[1];
        const numA = parseInt(matchA[2], 10);
        const numB = parseInt(matchB[2], 10);

        // Compare bill type (H.R. vs S. vs H.Con.Res., etc.)
        const typeCompare = typeA.localeCompare(typeB);
        if (typeCompare !== 0) return typeCompare;

        // Compare bill number numerically
        if (numA !== numB) return numA - numB;
      }

      // Fall back to full alphanumeric comparison for the rest
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [cols, rows, metaByCol]);

  // Territories without senators
  const territoriesWithoutSenate = ["VI", "PR", "DC", "AS", "GU", "MP"];

  // Handler for bill selection that auto-switches chamber filter
  const handleBillSelect = (billColumn: string) => {
    setSelectedMapBill(billColumn);

    if (!billColumn) {
      // Reset to no chamber filter when clearing bill selection
      return;
    }

    // AIPAC and Partisan selections can work with any chamber
    if (billColumn === "__AIPAC__" || billColumn === "__PARTISAN__") {
      // If currently on "All", switch to House by default
      if (!f.chamber) {
        f.set({ chamber: 'HOUSE' });
      }
      return;
    }

    // For regular bills, use inferChamber to determine eligibility
    const meta = metaByCol.get(billColumn);
    const billChamber = inferChamber(meta, billColumn);

    // Auto-switch chamber if bill is single-chamber and we're not already on the right chamber
    if (billChamber === 'HOUSE' && f.chamber !== 'HOUSE') {
      f.set({ chamber: 'HOUSE' });
    } else if (billChamber === 'SENATE' && f.chamber !== 'SENATE') {
      f.set({ chamber: 'SENATE' });
    } else if (billChamber === '' && !f.chamber) {
      // Multi-chamber bill but "All" is selected - switch to House by default
      f.set({ chamber: 'HOUSE' });
    }
  };

  return (
    <div className="mb-1 space-y-2">
      {/* First row: Map/Scorecard/Tracker buttons + Search */}
      <div className="flex flex-wrap items-center gap-2 px-2 md:px-0">
        {/* Desktop: Show both text buttons (≥768px) */}
        <div className="md:inline-flex hidden rounded-lg border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-white/5 p-1">
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
            onClick={() => {
              // When switching from map to scorecard, clear chamber filter
              const newState: { viewMode: "summary"; categories: Set<string>; chamber?: "" } = {
                viewMode: "summary",
                categories: new Set()
              };
              if (f.viewMode === "map") {
                newState.chamber = "";
              }
              f.set(newState);
            }}
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
          <button
            onClick={() => f.set({ viewMode: "tracker", categories: new Set() })}
            className={clsx(
              "px-3 h-9 rounded-md text-sm",
              f.viewMode === "tracker" && f.categories.size === 0
                ? "bg-[#4B8CFB] text-white"
                : f.viewMode === "tracker" && f.categories.size > 0
                ? "bg-[#93c5fd] text-slate-900"
                : "hover:bg-slate-50 dark:hover:bg-white/10"
            )}
          >
            Tracker
          </button>
        </div>

        {/* Bill selector for map view - Desktop */}
        {f.viewMode === "map" && (
          <select
            className="hidden md:block select !text-xs !h-9 !px-2 max-w-[200px]"
            value={selectedMapBill}
            onChange={(e) => handleBillSelect(e.target.value)}
          >
            <option value="">Grade</option>
            <option value="__PARTISAN__">Partisan</option>
            <option value="__AIPAC__">AIPAC & DMFI Support</option>
            <optgroup label="Bills & Actions">
              {billsWithData.map(col => {
                const m = metaByCol.get(col);
                if (!m) return null;
                return (
                  <option key={col} value={col}>
                    {m.display_name || m.short_title || col}
                  </option>
                );
              })}
            </optgroup>
          </select>
        )}

        {/* Mobile: Show icon buttons (<768px) */}
        <div className="md:hidden inline-flex rounded-lg border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-white/5 p-1">
          <button
            onClick={() => f.set({ viewMode: "map", categories: new Set(), state: "" })}
            className={clsx(
              "p-2 h-9 w-9 rounded-md flex items-center justify-center",
              f.viewMode === "map"
                ? "bg-[#4B8CFB] text-white"
                : "hover:bg-slate-50 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400"
            )}
            title="Map view"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </button>
          <button
            onClick={() => {
              // When switching from map to scorecard, clear chamber filter
              const newState: { viewMode: "summary"; categories: Set<string>; chamber?: "" } = {
                viewMode: "summary",
                categories: new Set()
              };
              if (f.viewMode === "map") {
                newState.chamber = "";
              }
              f.set(newState);
            }}
            className={clsx(
              "p-2 h-9 w-9 rounded-md flex items-center justify-center",
              (f.viewMode === "summary" || f.viewMode === "all" || f.viewMode === "category") && f.categories.size === 0
                ? "bg-[#4B8CFB] text-white"
                : (f.viewMode === "summary" || f.viewMode === "all" || f.viewMode === "category") && f.categories.size > 0
                ? "bg-[#93c5fd] text-slate-900"
                : "hover:bg-slate-50 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400"
            )}
            title="Scorecard view"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>
            </svg>
          </button>
          <button
            onClick={() => f.set({ viewMode: "tracker", categories: new Set() })}
            className={clsx(
              "p-2 h-9 w-9 rounded-md flex items-center justify-center",
              f.viewMode === "tracker" && f.categories.size === 0
                ? "bg-[#4B8CFB] text-white"
                : f.viewMode === "tracker" && f.categories.size > 0
                ? "bg-[#93c5fd] text-slate-900"
                : "hover:bg-slate-50 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400"
            )}
            title="Legislation tracker"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>
            </svg>
          </button>
        </div>

        {/* Filter button - mobile only, hide in map mode */}
        {f.viewMode !== "map" && (() => {
          // Check if there are active chamber/party/state filters (NOT categories - those are always visible)
          const hasActiveFilters = f.chamber || (f.viewMode !== "tracker" && (f.party || f.state));

          return (
            <button
              className={clsx(
                "md:hidden p-2 h-9 w-9 rounded-md flex items-center justify-center border transition-colors",
                filtersExpanded
                  ? "bg-[#4B8CFB] text-white border-[#4B8CFB]"
                  : hasActiveFilters
                  ? "bg-[#93c5fd] text-slate-900 border-[#93c5fd] hover:bg-[#7db8f9]"
                  : "bg-white dark:bg-white/5 border-[#E7ECF2] dark:border-slate-900 hover:bg-slate-50 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300"
              )}
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              title="Filters"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M3 3h14a1 1 0 011 1v1.5l-5.5 6v4l-3 1.5v-5.5l-5.5-6V4a1 1 0 011-1z" />
              </svg>
            </button>
          );
        })()}

        {/* Search - right-aligned for both map and scorecard */}
        <div className="ml-auto">
          <UnifiedSearch
            filteredCount={filteredCount}
            metaByCol={metaByCol}
            isMapView={f.viewMode === "map"}
            isTrackerView={f.viewMode === "tracker"}
          />
        </div>
      </div>

      {/* Second row: Category filter buttons - Always visible on mobile, hide in map mode */}
      {f.viewMode !== "map" && (
        <div className="flex items-center gap-2 px-2 md:px-0">
          {/* Border around issue buttons */}
          <div className="flex items-center flex-wrap gap-1 md:gap-1 px-1.5 md:px-2 py-1 md:py-1 rounded-lg border border-slate-200 dark:border-slate-900 bg-white dark:bg-white/5">
            {/* Individual issue buttons - bright blue when active */}
            <button
              onClick={() => {
                // Toggle: if already selected, go back to summary/all view
                if (f.categories.has("Civil Rights & Immigration")) {
                  f.set({ viewMode: f.viewMode === "tracker" ? "tracker" : "summary", categories: new Set() });
                } else {
                  f.set({ viewMode: f.viewMode === "tracker" ? "tracker" : "category", categories: new Set(["Civil Rights & Immigration"]) });
                }
              }}
              className={clsx(
                "px-2.5 md:px-2 py-1.5 md:py-0 md:h-7 rounded-md text-xs md:text-sm leading-tight text-center",
                f.categories.has("Civil Rights & Immigration")
                  ? "bg-[#4B8CFB] text-white"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              Civil Rights &<br className="md:hidden" /> Immigration
            </button>
            <button
              onClick={() => {
                // Toggle: if already selected, go back to summary/all view
                if (f.categories.has("Iran")) {
                  f.set({ viewMode: f.viewMode === "tracker" ? "tracker" : "summary", categories: new Set() });
                } else {
                  f.set({ viewMode: f.viewMode === "tracker" ? "tracker" : "category", categories: new Set(["Iran"]) });
                }
              }}
              className={clsx(
                "px-2 md:px-2 h-7 md:h-7 rounded-md text-xs md:text-sm whitespace-nowrap",
                f.categories.has("Iran")
                  ? "bg-[#4B8CFB] text-white"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              Iran
            </button>
            <button
              onClick={() => {
                // Toggle: if already selected, go back to summary/all view
                if (f.categories.has("Israel-Gaza")) {
                  f.set({ viewMode: f.viewMode === "tracker" ? "tracker" : "summary", categories: new Set() });
                } else {
                  f.set({ viewMode: f.viewMode === "tracker" ? "tracker" : "category", categories: new Set(["Israel-Gaza"]) });
                }
              }}
              className={clsx(
                "px-2 md:px-2 h-7 md:h-7 rounded-md text-xs md:text-sm whitespace-nowrap",
                f.categories.has("Israel-Gaza")
                  ? "bg-[#4B8CFB] text-white"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              Israel-Gaza
            </button>
            <button
              onClick={() => {
                // Toggle: if already selected, go back to summary view
                if (f.categories.has("AIPAC") && f.viewMode === "category") {
                  f.set({ viewMode: "summary", categories: new Set() });
                } else {
                  f.set({ viewMode: "category", categories: new Set(["AIPAC"]) });
                }
              }}
              className={clsx(
                "px-2 md:px-2 h-7 md:h-7 rounded-md text-xs md:text-sm whitespace-nowrap",
                f.categories.has("AIPAC") && f.viewMode === "category"
                  ? "bg-[#4B8CFB] text-white"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              AIPAC
            </button>
          </div>
        </div>
      )}

      {/* Third row: Map view - chamber filter */}
      {f.viewMode === "map" && (
        <div className="flex items-center gap-3 px-2 md:px-0">
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
            disabledOptions={(() => {
              const disabled: string[] = [];
              // If a bill or AIPAC is selected, disable "All"
              if (selectedMapBill) {
                disabled.push("All");

                // For regular bills (not AIPAC), check chamber eligibility
                if (selectedMapBill !== "__AIPAC__") {
                  const meta = metaByCol.get(selectedMapBill);
                  const billChamber = inferChamber(meta, selectedMapBill);

                  // Check if this bill was voted on in both chambers
                  const voteTallies = (meta?.vote_tallies || "").toLowerCase();
                  const hasHouseVote = voteTallies.includes("house");
                  const hasSenateVote = voteTallies.includes("senate");
                  const votedInBothChambers = hasHouseVote && hasSenateVote;

                  // Only disable chambers if bill was NOT voted in both chambers
                  if (!votedInBothChambers) {
                    // If bill is House-only, disable Senate
                    if (billChamber === "HOUSE") {
                      disabled.push("Senate");
                    }
                    // If bill is Senate-only, disable House
                    else if (billChamber === "SENATE") {
                      disabled.push("House");
                    }
                  }
                }
              }
              return disabled;
            })()}
          />
        </div>
      )}

      {/* Third row: Scorecard view - Filters */}
      {f.viewMode !== "map" && filtersExpanded && (
      <div className="relative flex items-center gap-2 px-2 md:px-0">
        {/* Desktop: Filter expand button */}
        <button
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          className="hidden md:flex items-center gap-2 text-sm text-slate-700 dark:text-white hover:text-slate-900 dark:hover:text-slate-300"
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
        </button>

        {/* Single X button when filters are active but collapsed (desktop) */}
        {!filtersExpanded && (f.chamber || (f.viewMode !== "tracker" && (f.party || f.state))) && (
          <button
            onClick={() => f.set({ chamber: "", party: "", state: "" })}
            className="hidden md:flex items-center justify-center w-6 h-6 rounded-md bg-slate-600 dark:bg-slate-500 text-white hover:bg-slate-700 dark:hover:bg-slate-600"
            title="Clear filters"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}

        <div
          className="flex items-center gap-1.5"
        >
          {/* Mobile: Chamber buttons (no All option) */}
          <div className="md:hidden inline-flex rounded-lg border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-white/5 p-0.5">
            <button
              onClick={() => f.set({ chamber: "HOUSE" })}
              className={clsx(
                "px-1.5 h-6 rounded-md text-[10px]",
                f.chamber === "HOUSE"
                  ? "bg-[#4B8CFB] text-white"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              House
            </button>
            <button
              onClick={() => f.set({ chamber: "SENATE" })}
              className={clsx(
                "px-1.5 h-6 rounded-md text-[10px]",
                f.chamber === "SENATE"
                  ? "bg-[#4B8CFB] text-white"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              Senate
            </button>
          </div>

          {/* Desktop: Segmented with All option */}
          <div className="hidden md:block">
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
          {f.viewMode !== "tracker" && (
            <>
              {/* Party buttons with tinted letters */}
              <div className="inline-flex rounded-lg border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-white/5 p-0.5 gap-0.5">
                <button
                  onClick={() => f.set({ party: f.party === "Democratic" ? "" : "Democratic" })}
                  className={clsx(
                    "w-6 h-6 rounded-md text-[10px] font-bold transition-colors",
                    f.party === "Democratic"
                      ? "bg-blue-500 text-white"
                      : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                  )}
                  title="Democratic (includes Independents)"
                >
                  D
                </button>
                <button
                  onClick={() => f.set({ party: f.party === "Republican" ? "" : "Republican" })}
                  className={clsx(
                    "w-6 h-6 rounded-md text-[10px] font-bold transition-colors",
                    f.party === "Republican"
                      ? "bg-red-500 text-white"
                      : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50"
                  )}
                  title="Republican"
                >
                  R
                </button>
              </div>
              {/* Mobile: State abbreviations */}
              <select
                className="md:hidden select !text-[10px] !h-6 !px-1.5 !max-w-[70px]"
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
                    {s.code}
                  </option>
                ))}
              </select>

              {/* Desktop: Full state names */}
              <select
                className="hidden md:block select !text-xs !h-8 !px-2 !max-w-[140px]"
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
            </>
          )}

          {/* Single X button to clear all active filters */}
          {(f.chamber || (f.viewMode !== "tracker" && (f.party || f.state))) && (
            <button
              onClick={() => f.set({ chamber: "", party: "", state: "" })}
              className="flex items-center justify-center w-6 h-6 rounded-md bg-slate-600 dark:bg-slate-500 text-white hover:bg-slate-700 dark:hover:bg-slate-600"
              title="Clear filters"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function UnifiedSearch({ filteredCount, metaByCol, isMapView, isTrackerView = false }: { filteredCount: number; metaByCol: Map<string, Meta>; isMapView: boolean; isTrackerView?: boolean }) {
  const f = useFilters();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [searchType, setSearchType] = useState<"zip" | "name" | "legislation">(
    isMapView ? "zip" : isTrackerView ? "legislation" : "name"
  );
  const [searchValue, setSearchValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Update search type when view mode changes
  useEffect(() => {
    setSearchType(isMapView ? "zip" : isTrackerView ? "legislation" : "name");
  }, [isMapView, isTrackerView]);

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

        // Switch to summary (scorecard) mode when searching from map or tracker
        if (f.viewMode === "map" || f.viewMode === "tracker") {
          f.set({ myLawmakers: names, viewMode: "summary" });
          setSearchValue("");
          setIsOpen(false);
        } else {
          f.set({ myLawmakers: names });
          setSearchValue("");
          setIsOpen(false);
        }
      } else {
        setError('No lawmakers found for this address');
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to find lawmakers: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleBillSearch = () => {
    if (!searchValue.trim()) return;

    const query = searchValue.toLowerCase().trim();

    // Normalize bill number for flexible matching
    // e.g., "HR 23", "H.R.23", "Hr23", "H.R. 23" all become "hr23"
    const normalizeBillNumber = (str: string) => {
      return str
        .toLowerCase()
        .replace(/\s+/g, '') // Remove spaces
        .replace(/\./g, '') // Remove periods
        .replace(/^(h|s)\s*(r|res|con\s*res|j\s*res)/i, '$1$2'); // Normalize prefixes
    };

    const normalizedQuery = normalizeBillNumber(query);

    // Search through all columns in metaByCol to find matching bills
    const matchingColumns: string[] = [];
    for (const [column, meta] of metaByCol.entries()) {
      const billNumber = (meta.bill_number || "").toLowerCase();
      const displayName = (meta.display_name || "").toLowerCase();
      const shortTitle = (meta.short_title || "").toLowerCase();
      const description = (meta.description || "").toLowerCase();
      const analysis = (meta.analysis || "").toLowerCase();
      const notes = (meta.notes || "").toLowerCase();

      // Check direct matches in bill number, display name, short title, description, analysis, or notes
      if (
        billNumber.includes(query) ||
        displayName.includes(query) ||
        shortTitle.includes(query) ||
        description.includes(query) ||
        analysis.includes(query) ||
        notes.includes(query)
      ) {
        matchingColumns.push(column);
        continue;
      }

      // Check normalized bill number match
      const normalizedBillNumber = normalizeBillNumber(billNumber);
      if (normalizedBillNumber.includes(normalizedQuery) || normalizedQuery.includes(normalizedBillNumber)) {
        matchingColumns.push(column);
      }
    }

    if (matchingColumns.length > 0) {
      // Store the search query and switch to tracker view with filtered results
      // We'll use a custom state to filter the tracker
      f.set({
        viewMode: "tracker",
        billColumn: query // Store the search query for filtering tracker
      });
      setIsOpen(false);
    } else {
      setError('No bills found matching your search');
    }
  };

  const handleSearch = () => {
    if (searchType === "zip") {
      handleZipSearch();
    } else if (searchType === "name") {
      // If in map or tracker mode, automatically switch to summary mode when searching
      if (f.viewMode === "map" || f.viewMode === "tracker") {
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
    if (searchType === "zip") return "Enter address or zipcode";
    if (searchType === "name") return "Enter lawmaker name…";
    return "Enter bill number or title…";
  };

  const isActive = f.myLawmakers.length > 0 || f.search.length > 0;

  // All views: show dropdown button
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
        <div className="absolute top-full mt-1 right-0 z-50 bg-white dark:bg-slate-800 border border-[#E7ECF2] dark:border-slate-900 rounded-lg shadow-lg p-4 min-w-[300px]">
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
                className="px-3 py-1.5 text-sm border border-[#E7ECF2] dark:border-slate-900 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700"
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
  onBillClick,
  hideTooltip,
}: {
  col: string;
  meta?: Meta;
  onSort?: () => void;
  active?: boolean;
  dir?: "GOOD_FIRST" | "BAD_FIRST";
  onBillClick?: (meta: Meta, column: string) => void;
  hideTooltip?: boolean;
}) {
  // Build simple system tooltip
  const tooltipText = meta
    ? `${meta.display_name || meta.short_title || col}${meta.description ? `\n\n${meta.description}` : ''}`
    : col;

  return (
    <div
      className="th group group/header relative select-none flex flex-col max-w-[14rem]"
      title={tooltipText}
    >
      {/* Bill number - always reserve space for alignment */}
      <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5 h-[14px]">
        {meta?.bill_number || '\u00A0'}
      </div>
      {/* Bill title - clickable to view details with fixed 2-line height */}
      <div className="h-[2.5rem] flex items-start justify-start overflow-hidden">
        <span
          className="line-clamp-2 cursor-pointer hover:text-[#4B8CFB] transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            if (meta && onBillClick) {
              onBillClick(meta, col);
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
            "text-[10px] text-slate-700 dark:text-slate-200 font-light mt-0.5 mb-0 flex items-center gap-1",
            onSort && "cursor-pointer hover:text-slate-900 dark:hover:text-slate-100"
          )}
          onClick={onSort}
        >
          {(() => {
            const position = (meta?.position_to_score || '').toUpperCase();
            const isSupport = position === 'SUPPORT';
            const label = isSupport ? 'Support' : 'Oppose';

            return (
              <span
                className={clsx(
                  "px-1 py-0.5 rounded font-medium",
                  isSupport
                    ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                    : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                )}
              >
                {label}
              </span>
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
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
  disabledOptions = [],
}: {
  options: string[];
  value?: string;
  onChange: (v: string) => void;
  disabledOptions?: string[];
}) {
  const current = value || options[0];
  return (
    <div className="inline-flex rounded-lg border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-white/5 p-0.5">
      {options.map((opt) => {
        const isActive = current === opt;
        const isDisabled = disabledOptions.includes(opt);
        return (
          <button
            key={opt}
            onClick={() => !isDisabled && onChange(opt)}
            disabled={isDisabled}
            className={clsx(
              "px-2 h-7 rounded-md text-xs transition-all",
              isDisabled
                ? "opacity-40 cursor-not-allowed"
                : isActive
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
  const color = grade.startsWith("A") ? GRADE_COLORS.A
    : grade.startsWith("B") ? GRADE_COLORS.B
    : grade.startsWith("C") ? GRADE_COLORS.C
    : grade.startsWith("D") ? GRADE_COLORS.D
    : grade.startsWith("F") ? GRADE_COLORS.F
    : GRADE_COLORS.default;
  const opacity = isOverall ? "FF" : "E6"; // fully opaque for overall, 90% opaque (10% transparent) for others
  const textColor = grade.startsWith("A") ? "#ffffff" // white for A grades
    : grade.startsWith("B") ? "#4b5563" // dark grey for B grades
    : grade.startsWith("C") ? "#4b5563" // dark grey for C grades
    : "#4b5563"; // dark grey for D and F grades
  const border = isOverall ? "2px solid #000000" : "none"; // black border for overall grades
  return <span className="inline-flex items-center justify-center rounded-full px-1.5 md:px-2.5 py-0.5 md:py-1 text-xs font-bold min-w-[2.25rem] md:min-w-[2.75rem]"
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

