/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";
import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
// react-window available but not used yet due to complexity of row rendering
// import { List } from "react-window";
import { loadData, loadManualScoringMeta } from "@/lib/loadCsv";
import { useFilters } from "@/lib/store";
import type { Row, Meta } from "@/lib/types";
import { loadPacData, isAipacEndorsed, isDmfiEndorsed, type PacData } from "@/lib/pacData";
import { GRADE_COLORS, extractVoteInfo, inferChamber, partyBadgeStyle, partyLabel, isGradeIncomplete, getPhotoUrl, gradeColor, isTrackerOnly } from "@/lib/utils";
import { getProxiedImageUrl } from "@/lib/imageProxy";
import USMap from "@/components/USMap";
import { MemberModal } from "@/components/MemberModal";
import { BillModal } from "@/components/BillModal";
import { AipacModal } from "@/components/AipacModal";
import { GradeChip, VoteIcon } from "@/components/GradeChip";
import { loadSentenceRules, generateSentencesSync, type Sentence } from "@/lib/generateSentences";

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

function formatNameFirstLast(name: string | unknown): string {
  const nameStr = String(name || '');
  if (nameStr.includes(', ')) {
    const [last, first] = nameStr.split(', ');
    return `${first} ${last}`;
  }
  return nameStr;
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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{rowId: string, col: string} | null>(null);
  const [selectedBill, setSelectedBill] = useState<{ meta: Meta; column: string; initialStateFilter?: string } | null>(null);
  const [pacDataMap, setPacDataMap] = useState<Map<string, PacData>>(new Map());
  const [manualScoringMeta, setManualScoringMeta] = useState<Map<string, string>>(new Map());
  const [sentenceRules, setSentenceRules] = useState<Awaited<ReturnType<typeof loadSentenceRules>>>([]);
  const [showAipacModal, setShowAipacModal] = useState<boolean>(false);

  // Modal history stack for back navigation
  type ModalHistoryItem =
    | { type: 'member'; data: Row }
    | { type: 'bill'; data: { meta: Meta; column: string } }
    | { type: 'aipac'; data: null };
  const [modalHistory, setModalHistory] = useState<ModalHistoryItem[]>([]);

  // Helper to navigate to a modal while preserving history
  const pushMemberModal = useCallback((member: Row, category?: string) => {
    // Save current modal to history if one is open
    if (selected) {
      setModalHistory(prev => [...prev, { type: 'member', data: selected }]);
    } else if (selectedBill) {
      setModalHistory(prev => [...prev, { type: 'bill', data: selectedBill }]);
    }
    setSelected(member);
    setSelectedBill(null);
    // Set the category if provided (e.g., from bill modal click)
    if (category) {
      setSelectedCategory(category);
    }
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
    setSelectedCategory(null);
    setSelectedBill(null);
    setShowAipacModal(false);
    setModalHistory([]);
  }, []);

  // Open share page for a member (used from scorecard hover overlay)
  const openSharePage = useCallback((row: Row) => {
    const fullName = String(row.full_name || '');
    const commaIdx = fullName.indexOf(',');
    const displayName = commaIdx > -1
      ? `${fullName.slice(commaIdx + 1).trim()} ${fullName.slice(0, commaIdx).trim()}`
      : fullName;

    const chamber = row.chamber === 'SENATE' ? 'Senator' : 'Representative';
    const party = row.party === 'Democratic' ? 'D' : row.party === 'Republican' ? 'R' : 'I';
    const location = row.chamber === 'SENATE' ? row.state : row.district ? `${row.state}-${row.district}` : row.state;

    const pacData = pacDataMap.get(String(row.bioguide_id));
    const pacTotalLastElection = pacData ? (
      (pacData.aipac_total_2022 || 0) + (pacData.dmfi_total_2022 || 0) +
      (pacData.aipac_total_2024 || 0) + (pacData.dmfi_total_2024 || 0)
    ) : 0;
    const pacTotal2026 = pacData ? (
      (pacData.aipac_total_2026 || 0) + (pacData.dmfi_total_2026 || 0)
    ) : 0;

    // Check if member has ANY PAC money at all (for "Not supported" message)
    const hasAnyPacMoney = pacData ? (
      (pacData.aipac_total_2022 || 0) + (pacData.dmfi_total_2022 || 0) +
      (pacData.aipac_total_2024 || 0) + (pacData.dmfi_total_2024 || 0) +
      (pacData.aipac_total_2026 || 0) + (pacData.dmfi_total_2026 || 0)
    ) > 0 : false;

    // Check if member has any AIPAC/DMFI support flags
    const aipacSupport = pacData ? Boolean(
      pacData.aipac_supported_2022 || pacData.aipac_supported_2024 || pacData.aipac_supported_2026
    ) : false;
    const dmfiSupport = pacData ? Boolean(
      pacData.dmfi_supported_2022 || pacData.dmfi_supported_2024 || pacData.dmfi_supported_2026
    ) : false;
    const hasLobbySupport = aipacSupport || dmfiSupport;
    const pacDataLoaded = pacDataMap.size > 0;

    const sentences = generateSentencesSync(row, sentenceRules, pacTotalLastElection, pacTotal2026, hasAnyPacMoney, hasLobbySupport, pacDataLoaded, aipacSupport, dmfiSupport, metaByCol);

    const params = new URLSearchParams({
      name: displayName,
      grade: String(row.Grade || 'N/A'),
      total: String(Math.round(Number(row.Total || 0))),
      max: String(Math.round(Number(row.Max_Possible || 0))),
      chamber,
      party,
      location: String(location || ''),
      photo: getPhotoUrl(String(row.bioguide_id), '450x550'),
      photoFallback: String(row.photo_url || ''),
      sentences: encodeURIComponent(JSON.stringify(sentences)),
    });

    window.open(`/member/${row.bioguide_id}/share?${params.toString()}`, '_blank');
  }, [pacDataMap, sentenceRules, metaByCol]);

  useEffect(() => { (async () => {
    const [data, pacData, manualMeta, rules] = await Promise.all([loadData(), loadPacData(), loadManualScoringMeta(), loadSentenceRules()]);
    const { rows, columns, metaByCol, categories } = data;
    setRows(rows); setCols(columns); setMeta(metaByCol); setCategories(categories);
    setPacDataMap(pacData);
    setManualScoringMeta(manualMeta);
    setSentenceRules(rules);
  })(); }, []);

  const f = useFilters();
  const router = useRouter();

  // Check for view query parameter on mount, and handle first visit logic
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    const billParam = urlParams.get('bill');

    if (viewParam === 'tracker' || viewParam === 'map' || viewParam === 'summary' || viewParam === 'all' || viewParam === 'category' || viewParam === 'find') {
      f.set({ viewMode: viewParam });
    } else {
      // Default to Find view
      f.set({ viewMode: "find" });
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
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const [selectedMapBill, setSelectedMapBill] = useState<string>("");

  // Track expanded bills in tracker accordion
  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());

  // Tracker sort state: column and direction
  const [trackerSort, setTrackerSort] = useState<{ col: 'position' | 'bill' | 'title' | null; dir: 'asc' | 'desc' }>({ col: null, dir: 'asc' });

  // Find view state
  const [findTab, setFindTab] = useState<"name" | "location" | "bill" | "issues">("location");
  const [findQuery, setFindQuery] = useState("");
  const [findState, setFindState] = useState("");
  const [findLoading, setFindLoading] = useState(false);
  const [findError, setFindError] = useState("");
  const [showFindDropdown, setShowFindDropdown] = useState(true);

  // Prevent body scroll when in Find view
  useEffect(() => {
    if (f.viewMode === "find") {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [f.viewMode]);

  // Ref for the scrollable table container
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  // Ref for the tracker container
  const trackerScrollRef = useRef<HTMLDivElement | null>(null);

  // Ref for the loading indicator (used for IntersectionObserver)
  const loadingIndicatorRef = useRef<HTMLDivElement | null>(null);

  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Progressive row loading for performance
  const INITIAL_ROWS = 100;
  const LOAD_MORE_ROWS = 50;
  const [visibleRowCount, setVisibleRowCount] = useState(INITIAL_ROWS);

  // Track mobile viewport for responsive column widths
  useEffect(() => {
    const checkViewport = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsLargeScreen(width > 1150);
    };

    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // Check for horizontal overflow to conditionally enable scrolling
  useEffect(() => {
    const checkOverflow = () => {
      if (tableScrollRef.current) {
        // Check the first grid child (header or first row) width vs container
        const gridChild = tableScrollRef.current.querySelector('.grid');
        if (gridChild) {
          const hasOverflow = gridChild.scrollWidth > tableScrollRef.current.clientWidth;
          setHasHorizontalOverflow(hasOverflow);
        }
      }
    };

    // Initial check with delay to ensure DOM is ready
    const timer = setTimeout(checkOverflow, 150);

    window.addEventListener('resize', checkOverflow);

    // Use ResizeObserver to detect content changes
    const observer = new ResizeObserver(checkOverflow);
    if (tableScrollRef.current) {
      observer.observe(tableScrollRef.current);
      // Also observe the grid content
      const gridChild = tableScrollRef.current.querySelector('.grid');
      if (gridChild) {
        observer.observe(gridChild);
      }
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkOverflow);
      observer.disconnect();
    };
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

  // Progressive loading - only render visible rows for performance
  const visibleRows = useMemo(() => sorted.slice(0, visibleRowCount), [sorted, visibleRowCount]);
  const hasMoreRows = visibleRowCount < sorted.length;

  // Reset visible row count when filters change
  useEffect(() => {
    setVisibleRowCount(INITIAL_ROWS);
  }, [f.state, f.party, f.chamber, f.categories, f.billColumn, sortCol, sortDir]);

  // IntersectionObserver for progressive loading - more reliable than scroll events across browsers
  useEffect(() => {
    if (!loadingIndicatorRef.current || !hasMoreRows) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // When the loading indicator becomes visible, load more rows
        if (entries[0].isIntersecting) {
          setVisibleRowCount(prev => Math.min(prev + LOAD_MORE_ROWS, sorted.length));
        }
      },
      {
        root: tableScrollRef.current,
        rootMargin: '200px', // Start loading 200px before the indicator is visible
        threshold: 0.1,
      }
    );

    observer.observe(loadingIndicatorRef.current);

    return () => {
      observer.disconnect();
    };
  }, [hasMoreRows, sorted.length]);

  // Scroll handler - hide tooltips while scrolling
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
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
  // Excludes tracker_only bills (those only appear in Tracker view)
  const allBillCols = useMemo(() => {
    // Filter out tracker_only bills from scorecard and member modal
    let out = cols.filter((c) => {
      const meta = metaByCol.get(c);
      return !isTrackerOnly(meta);
    });

    // Chamber filter: keep only bills for the selected chamber
    // Bills with empty chamber or voted in both chambers should appear in both filters
    if (f.chamber) {
      out = out.filter((c) => {
        const meta = metaByCol.get(c);
        const ch = inferChamber(meta, c);

        // Check if voted in both chambers
        const voteTallies = (meta?.vote_tallies || "").toLowerCase();
        const hasHouseVote = voteTallies.includes("house");
        const hasSenateVote = voteTallies.includes("senate");
        const votedInBothChambers = hasHouseVote && hasSenateVote;

        return ch === "" || ch === f.chamber || votedInBothChambers;
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

  // Map pair_key -> preferred column name (for efficient lookup)
  const preferredColByPairKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const col of cols) {
      const meta = metaByCol.get(col);
      if (meta?.pair_key && isTrue((meta as any).preferred)) {
        map.set(meta.pair_key, col);
      }
    }
    return map;
  }, [cols, metaByCol]);

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
    const billsPart = billCols.map(() => isMobile ? "minmax(168px, 168px)" : (isLargeScreen ? "minmax(210px, 210px)" : "minmax(186px, 186px)")).join(" ");
    const gradesPart = gradeColumns.map(() => isMobile ? "minmax(85px, 85px)" : (isLargeScreen ? "minmax(180px, 180px)" : "minmax(160px, 160px)")).join(" ");
    // Member column: wider on mobile for comfortable reading
    // Mobile: min 126px to fit stacked names, max 40vw for responsive sizing
    // Desktop: fixed 300px for comfortable reading with photos
    // Large screens (>1150px): 400px for more spacious layout
    const memberCol = isMobile ? "minmax(90px, min(40vw, 120px))" : (isLargeScreen ? "400px" : "300px");
    // Endorsements column: fixed on mobile/desktop, grows on large screens
    const endorsementsCol = isLargeScreen ? "minmax(9.6rem, 1fr)" : "9.6rem";

    // In summary mode: member col + grade cols + endorsements col
    if (f.viewMode === "summary") {
      return `${memberCol} ${gradesPart} ${endorsementsCol}`;
    }
    // AIPAC mode: member col + overall grade + endorsements col + other grade cols + dynamic bill cols
    if (f.categories.has("AIPAC")) {
      // First grade column is Overall Grade (135px on mobile), then endorsements (9.6rem), then remaining grade columns
      const restGradesPart = gradeColumns.slice(1).map(() => isMobile ? "minmax(135px, 135px)" : (isLargeScreen ? "minmax(180px, 180px)" : "minmax(160px, 160px)")).join(" ");
      return `${memberCol} ${isMobile ? "minmax(135px, 135px)" : (isLargeScreen ? "minmax(180px, 180px)" : "minmax(160px, 160px)")} ${endorsementsCol} ${restGradesPart} ${billsPart}`;
    }
    // Civil Rights & Immigration mode: member col + grade cols + dynamic bill cols
    // Wider grade columns on mobile to fit "Rights & Immigration" text
    if (f.categories.has("Civil Rights & Immigration")) {
      const civilRightsGradesPart = gradeColumns.map(() => isMobile ? "minmax(135px, 135px)" : (isLargeScreen ? "minmax(180px, 180px)" : "minmax(160px, 160px)")).join(" ");
      return `${memberCol} ${civilRightsGradesPart} ${billsPart}`;
    }
    // member col + grade cols + dynamic bill cols + endorsements col
    return `${memberCol} ${gradesPart} ${billsPart} ${endorsementsCol}`;
  }, [billCols, gradeColumns, f.viewMode, f.categories, isMobile, isLargeScreen]);

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
    <div className={`flex flex-col h-[100dvh] ${f.viewMode === "find" ? "overflow-hidden" : ""}`}>
      {/* Header Band - breaks out of max-w-7xl container */}
      <div className="bg-[#002b49] dark:bg-slate-900 py-2 px-0 md:px-4 border-b border-[#001a2e] dark:border-slate-900 w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw]">
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

      <div className={`flex-1 flex flex-col min-h-0 ${f.viewMode === "find" ? "p-0" : "space-y-2 px-0 pt-2 pb-2 md:p-3"}`}>
        {f.viewMode !== "find" ? (
          <Filters filteredCount={sorted.length} metaByCol={metaByCol} selectedMapBill={selectedMapBill} setSelectedMapBill={setSelectedMapBill} setSortCol={setSortCol} setSortDir={setSortDir} tableScrollRef={tableScrollRef} rows={rows} cols={cols} onSelectMember={setSelected} />
        ) : null}
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
          initialCategory={selectedCategory || (selectedFromAipac ? "AIPAC" : null)}
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
          onMemberClick={(member, category) => pushMemberModal(member, category)}
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

      {/* Views Container */}
      <div className="relative flex-1 flex flex-col min-h-0 pb-16">
        {/* Find View */}
        {f.viewMode === "find" && (
        <div
          className="overflow-hidden relative flex-1 flex flex-col"
        >
          {/* Capitol Background */}
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url('/capitol-bg.jpg')" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />

          <div className="relative p-4 md:p-6 max-w-xl mx-auto w-full flex-1 flex flex-col justify-center">
            {/* Big Heading */}
            <h1 className="text-2xl md:text-3xl font-bold text-center text-white mb-6 drop-shadow-lg">
              Find Your Lawmakers
            </h1>

            {/* Tabbed Selector */}
            <div className="flex rounded-lg bg-white/20 backdrop-blur-sm p-1 mb-4">
              <button
                onClick={() => { setFindTab("name"); setFindError(""); }}
                className={clsx(
                  "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors",
                  findTab === "name"
                    ? "bg-[#4B8CFB] text-white shadow-sm"
                    : "text-white hover:bg-white/20"
                )}
              >
                Name
              </button>
              <button
                onClick={() => { setFindTab("location"); setFindError(""); }}
                className={clsx(
                  "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors",
                  findTab === "location"
                    ? "bg-[#4B8CFB] text-white shadow-sm"
                    : "text-white hover:bg-white/20"
                )}
              >
                Location
              </button>
              <button
                onClick={() => { setFindTab("bill"); setFindError(""); }}
                className={clsx(
                  "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors",
                  findTab === "bill"
                    ? "bg-[#4B8CFB] text-white shadow-sm"
                    : "text-white hover:bg-white/20"
                )}
              >
                Bill
              </button>
              <button
                onClick={() => { setFindTab("issues"); setFindError(""); }}
                className={clsx(
                  "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors",
                  findTab === "issues"
                    ? "bg-[#4B8CFB] text-white shadow-sm"
                    : "text-white hover:bg-white/20"
                )}
              >
                Issues
              </button>
            </div>

            {/* Search Input */}
            <div className="mb-4 relative">
              {findTab === "location" ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={findQuery}
                    onChange={(e) => setFindQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        document.getElementById("find-search-btn")?.click();
                      }
                    }}
                    placeholder="Enter address or zip..."
                    className="flex-1 px-4 py-3 rounded-lg border-0 bg-white/90 backdrop-blur-sm text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white focus:bg-white shadow-lg"
                  />
                  <select
                    value={findState}
                    onChange={(e) => setFindState(e.target.value)}
                    className="w-28 px-2 py-3 rounded-lg border-0 bg-white/90 backdrop-blur-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-white focus:bg-white shadow-lg"
                  >
                    <option value="">State</option>
                    {STATES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code}
                      </option>
                    ))}
                  </select>
                </div>
              ) : findTab === "name" ? (
                <div className="relative">
                  <input
                    type="text"
                    value={findQuery}
                    onChange={(e) => { setFindQuery(e.target.value); setShowFindDropdown(true); }}
                    onFocus={() => setShowFindDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setShowFindDropdown(false);
                        document.getElementById("find-search-btn")?.click();
                      }
                    }}
                    placeholder="Enter lawmaker's name..."
                    className="w-full px-4 py-3 rounded-lg border-0 bg-white/90 backdrop-blur-sm text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white focus:bg-white shadow-lg"
                  />
                  {/* Name Autocomplete Dropdown */}
                  {showFindDropdown && findQuery.trim().length >= 2 && (() => {
                    const query = findQuery.toLowerCase();
                    const matches = rows
                      .filter(r => {
                        const name = String(r.full_name || "").toLowerCase();
                        return name.includes(query);
                      })
                      .slice(0, 6);
                    if (matches.length === 0) return null;
                    return (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowFindDropdown(false)} />
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                          {matches.map((member, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setFindQuery(String(member.full_name || ""));
                                setShowFindDropdown(false);
                                setTimeout(() => document.getElementById("find-search-btn")?.click(), 50);
                              }}
                              className="w-full px-4 py-2.5 text-left hover:bg-slate-100 flex items-center gap-2 border-b border-slate-100 last:border-0"
                            >
                              <span className="text-slate-800 font-medium">{String(member.full_name || "")}</span>
                              <span className="text-slate-500 text-sm">
                                ({member.party === "Democratic" ? "D" : member.party === "Republican" ? "R" : "I"}) {member.state}-{member.chamber === "SENATE" ? "Sen" : member.district}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : findTab === "bill" ? (
                <div className="relative">
                  <input
                    type="text"
                    value={findQuery}
                    onChange={(e) => { setFindQuery(e.target.value); setShowFindDropdown(true); }}
                    onFocus={() => setShowFindDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setShowFindDropdown(false);
                        document.getElementById("find-search-btn")?.click();
                      }
                    }}
                    placeholder="Enter bill number or title..."
                    className="w-full px-4 py-3 rounded-lg border-0 bg-white/90 backdrop-blur-sm text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white focus:bg-white shadow-lg"
                  />
                  {/* Bill Autocomplete Dropdown */}
                  {showFindDropdown && findQuery.trim().length >= 2 && (() => {
                    const query = findQuery.toLowerCase();
                    const matches = cols
                      .map(col => {
                        const meta = metaByCol.get(col);
                        return { col, meta };
                      })
                      .filter(({ col, meta }) => {
                        if (!meta) return false;
                        const displayName = (meta.display_name || "").toLowerCase();
                        const colLower = col.toLowerCase();
                        return displayName.includes(query) || colLower.includes(query);
                      })
                      .slice(0, 6);
                    if (matches.length === 0) return null;
                    return (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowFindDropdown(false)} />
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                          {matches.map(({ col, meta }, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setFindQuery(meta?.display_name || col);
                                setShowFindDropdown(false);
                                setTimeout(() => document.getElementById("find-search-btn")?.click(), 50);
                              }}
                              className="w-full px-4 py-2.5 text-left hover:bg-slate-100 border-b border-slate-100 last:border-0"
                            >
                              <span className="text-slate-800 font-medium block">{meta?.display_name || col}</span>
                              {meta?.categories && (
                                <span className="text-slate-500 text-xs">{meta.categories}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                /* Issues Tab - Category Filter */
                <div className="flex gap-1.5 w-full">
                  <button
                    onClick={() => {
                      f.set({ categories: new Set() });
                    }}
                    className={clsx(
                      "flex-1 py-2.5 rounded-lg text-xs font-medium transition-colors shadow-sm whitespace-nowrap",
                      f.categories.size === 0
                        ? "bg-[#4B8CFB] text-white"
                        : "bg-white text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    All
                  </button>
                  <button
                    onClick={() => {
                      f.set({ categories: new Set(["Civil Rights & Immigration"]) });
                    }}
                    className={clsx(
                      "flex-1 py-2.5 rounded-lg text-xs font-medium transition-colors shadow-sm whitespace-nowrap",
                      f.categories.has("Civil Rights & Immigration")
                        ? "bg-[#4B8CFB] text-white"
                        : "bg-white text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    Civil Rights
                  </button>
                  <button
                    onClick={() => {
                      f.set({ categories: new Set(["Iran"]) });
                    }}
                    className={clsx(
                      "flex-1 py-2.5 rounded-lg text-xs font-medium transition-colors shadow-sm whitespace-nowrap",
                      f.categories.has("Iran")
                        ? "bg-[#4B8CFB] text-white"
                        : "bg-white text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    Iran
                  </button>
                  <button
                    onClick={() => {
                      f.set({ categories: new Set(["Israel-Gaza"]) });
                    }}
                    className={clsx(
                      "flex-1 py-2.5 rounded-lg text-xs font-medium transition-colors shadow-sm whitespace-nowrap",
                      f.categories.has("Israel-Gaza")
                        ? "bg-[#4B8CFB] text-white"
                        : "bg-white text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    Israel-Gaza
                  </button>
                  <button
                    onClick={() => {
                      f.set({ categories: new Set(["AIPAC"]) });
                    }}
                    className={clsx(
                      "flex-1 py-2.5 rounded-lg text-xs font-medium transition-colors shadow-sm whitespace-nowrap",
                      f.categories.has("AIPAC")
                        ? "bg-[#4B8CFB] text-white"
                        : "bg-white text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    AIPAC
                  </button>
                </div>
              )}
            </div>

            {/* Error message */}
            {findError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/90 text-white text-sm shadow-lg">
                {findError}
              </div>
            )}

            {/* Search Button */}
            <button
              id="find-search-btn"
              disabled={findLoading || (findTab !== "issues" && !findQuery.trim() && !findState)}
              onClick={async () => {
                const query = findQuery.trim();
                const hasCategory = f.categories.size > 0;
                const hasState = !!findState;

                // For issues tab, always allow (just go to scorecard with category filter)
                if (findTab === "issues") {
                  f.set({ viewMode: hasCategory ? "category" : "summary" });
                  return;
                }

                // If no query and no filters, do nothing
                if (!query && !hasCategory && !hasState) return;

                setFindError("");
                setFindLoading(true);

                try {
                  if (findTab === "name") {
                    // Name search - check how many matches
                    const matches = rows.filter(r =>
                      String(r.full_name || "").toLowerCase().includes(query.toLowerCase())
                    );
                    if (matches.length === 1) {
                      // Single match - open member modal directly
                      setSelected(matches[0]);
                      setFindQuery("");
                    } else {
                      // Multiple matches - go to scorecard with search filter
                      f.set({ search: query, viewMode: hasCategory ? "category" : "summary" });
                      setFindQuery("");
                    }
                  } else if (findTab === "location") {
                    if (query) {
                      // Location search with address - call API
                      const res = await fetch("/api/find-lawmakers", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ address: query }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        setFindError(data.error || "Could not find lawmakers for this location");
                      } else if (data.lawmakers && data.lawmakers.length > 0) {
                        const names = data.lawmakers.map((lm: { name: string }) => lm.name);
                        f.setMyLawmakers(names);
                        f.set({ viewMode: hasCategory ? "category" : "summary", state: findState || "" });
                        setFindQuery("");
                        setFindState("");
                      } else {
                        setFindError("No lawmakers found for this location");
                      }
                    } else if (hasState) {
                      // Just state filter - go to scorecard with state
                      f.set({ viewMode: hasCategory ? "category" : "summary", state: findState });
                      setFindState("");
                    } else {
                      // Just category - go to scorecard
                      f.set({ viewMode: "category" });
                    }
                  } else if (findTab === "bill") {
                    // Bill search - set billColumn filter and go to tracker
                    f.set({ billColumn: query, viewMode: "tracker" });
                    setFindQuery("");
                  }
                } catch (err) {
                  setFindError("Search failed. Please try again.");
                } finally {
                  setFindLoading(false);
                }
              }}
              className={clsx(
                "w-full py-3 rounded-lg font-semibold transition-colors shadow-lg",
                findLoading || (findTab !== "issues" && !findQuery.trim() && !findState)
                  ? "bg-white/30 text-white/60 cursor-not-allowed"
                  : "bg-white text-[#30558C] hover:bg-white/90"
              )}
            >
              {findLoading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>
        )}

        {/* Map View */}
        <div
          className={clsx(
            "card rounded-lg md:rounded-2xl p-0 md:p-4",
            f.viewMode !== "map" && "hidden"
          )}
        >
          <USMap
            stateColors={stateColors}
            onStateClick={(stateCode) => {
              // Go to scorecard filtered by state
              // If in Senate mode, also set chamber to Senate
              f.set({
                state: stateCode,
                viewMode: "summary",
                chamber: f.chamber === "SENATE" ? "SENATE" : ""
              });
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
              // This is no longer used since we simplified click behavior
            }}
          />
        </div>

        {/* Table View */}
        <div
          className={clsx(
            "card rounded-lg md:rounded-2xl overflow-visible w-fit max-w-full",
            (f.viewMode === "map" || f.viewMode === "tracker" || f.viewMode === "find") && "hidden"
          )}
        >
          <div ref={tableScrollRef} className={clsx("overflow-y-auto min-h-[300px] max-h-[calc(100dvh-11rem)] pb-20 md:pb-4 rounded-lg md:rounded-2xl scrollbar-hide", hasHorizontalOverflow ? "overflow-x-auto" : "overflow-x-hidden")} onScroll={handleScroll} style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: hasHorizontalOverflow ? 'pan-x pan-y' : 'pan-y' }}>
            {/* Header wrapper - extends full width for shadow */}
            <div className="sticky top-0 z-30 min-w-max w-full bg-white/70 dark:bg-slate-900/85 backdrop-blur-xl border-b border-[#E7ECF2] dark:border-slate-900 shadow-sm">
            {/* Header */}
            <div
              className="grid min-w-max"
              style={{
                gridTemplateColumns: gridTemplate,
              }}
            >
            {/* Member column header */}
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

            {/* Endorsements column header - in AIPAC view */}
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
                    AIPAC or DMFI Support
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

            {!f.categories.has("AIPAC") && gradeColumns.map((gradeCol, idx) => {
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
                      <div className="uppercase leading-tight">
                        {gradeCol.header === "Civil Rights & Immigration" ? (
                          <>
                            <span className="hidden md:inline">Civil </span>
                            <span>Rights & Immigration</span>
                          </>
                        ) : gradeCol.header}
                      </div>
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
                "th group relative select-none flex flex-col",
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
                    AIPAC or DMFI Support
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
          </div>

          {/* Rows Container */}
          <div style={{ minWidth: 'max-content' }}>
          {visibleRows.map((r, i) => (
            <div
              key={i}
              className={clsx(
                "grid min-w-max transition group items-center",
                "hover:bg-slate-50 dark:hover:bg-slate-800",
                "border-b border-[#E7ECF2] dark:border-slate-900"
              )}
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {/* member + photo */}
              <div
                className="td pl-0 md:pl-4 py-0 md:py-3 flex flex-col md:flex-row items-center md:items-start justify-start gap-0 md:gap-3 cursor-pointer sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition border-r border-[#E7ECF2] dark:border-slate-900 self-stretch relative group/member"
                onClick={() => setSelected(r)}
              >
                {/* Hover overlay with action buttons - desktop only */}
                <div className="hidden md:flex absolute inset-0 bg-slate-900/80 dark:bg-slate-900/90 opacity-0 group-hover/member:opacity-100 transition-opacity duration-200 items-center justify-center gap-2 xl:gap-3 z-30 rounded-lg flex-col xl:flex-row">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(r);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 rounded-lg font-medium text-sm transition-colors shadow-lg"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    View Profile
                  </button>
                  {!isGradeIncomplete(r.bioguide_id) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openSharePage(r);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 bg-[#30558C] hover:bg-[#254470] text-white rounded-lg font-medium text-sm transition-colors shadow-lg"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Summarize
                    </button>
                  )}
                </div>
                {/* Photo - shown second on mobile, first on desktop */}
                {(r.bioguide_id || r.photo_url) ? (
                  <img
                    src={getPhotoUrl(String(r.bioguide_id || ''), '225x275') || getProxiedImageUrl(String(r.photo_url)) || ''}
                    alt=""
                    loading="lazy"
                    className="w-[80%] md:w-[105px] xl:w-[140px] aspect-square rounded-full object-cover bg-slate-200 dark:bg-white/10 flex-shrink-0 order-2 md:order-1 mx-auto md:mx-0"
                    style={{ height: 'auto' }}
                    onError={(e) => {
                      // Try fallback to photo_url if bioguide CDN fails
                      const target = e.currentTarget;
                      if (!target.dataset.fallback && r.photo_url) {
                        target.dataset.fallback = '1';
                        target.src = getProxiedImageUrl(String(r.photo_url)) || '';
                      }
                    }}
                  />
                ) : (
                  <div
                    className="w-[80%] md:w-[105px] xl:w-[140px] aspect-square rounded-full bg-slate-300 dark:bg-white/10 flex-shrink-0 order-2 md:order-1 mx-auto md:mx-0"
                    style={{ height: 'auto' }}
                  />
                )}

                {/* Desktop: Text section with name and badges */}
                <div className="hidden md:flex md:flex-col min-w-0 flex-1 md:order-2">
                  {/* Name */}
                  <div className="font-bold text-[24px] xl:text-[28px] leading-6 xl:leading-7 text-slate-800 dark:text-white mb-1 text-center">
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

                  {/* Badges - chamber and party */}
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2 whitespace-nowrap flex-wrap mb-1">
                    {/* Chamber */}
                    <span
                      className="px-1.5 py-0.5 rounded-md text-[14px] xl:text-[16px] font-semibold"
                      style={{
                        color: '#64748b',
                        backgroundColor: `${chamberColor(r.chamber)}20`,
                      }}
                    >
                      {r.chamber === "HOUSE" ? "House" : r.chamber === "SENATE" ? "Senate" : (r.chamber || "")}
                    </span>

                    {/* Party - just letter */}
                    <span
                      className="px-1.5 py-0.5 rounded-md text-[14px] xl:text-[16px] font-medium border"
                      style={partyBadgeStyle(r.party)}
                    >
                      {(() => {
                        const p = (r.party ?? "").trim().toLowerCase();
                        if (p.startsWith("dem")) return "D";
                        if (p.startsWith("rep")) return "R";
                        if (p.startsWith("ind")) return "I";
                        return (r.party ?? "").charAt(0).toUpperCase();
                      })()}
                    </span>
                  </div>

                  {/* State and District */}
                  <div className="text-[14px] xl:text-[16px] text-slate-600 dark:text-slate-400 text-center">
                    {(() => {
                      const stateCode = stateCodeOf(r.state);
                      // Get full state name from the state code
                      const stateName = r.state || stateCode;
                      const district = r.chamber === "HOUSE" && r.district ? ` • District ${r.district}` : "";
                      return `${stateName}${district}`;
                    })()}
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

              {/* Endorsements column - in AIPAC view (replaces grade columns) */}
              {f.categories.has("AIPAC") && (
                <div className="td px-2 flex items-center">
                  {(() => {
                    // Check if member has reject AIPAC commitment text (takes priority)
                    const rejectCommitment = r.reject_aipac_commitment;
                    const rejectLink = r.reject_aipac_link;
                    const hasRejectCommitment = rejectCommitment && String(rejectCommitment).length > 10;

                    if (hasRejectCommitment) {
                      return (
                        <div className="flex items-start gap-1">
                          <VoteIcon ok={true} size="tiny" />
                          <span className="text-xs md:text-sm lg:text-base xl:text-lg text-slate-800 dark:text-white font-bold">
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
                          <VoteIcon ok={false} size="tiny" />
                          <span className="text-xs md:text-sm lg:text-base xl:text-lg text-slate-800 dark:text-white">Supported by AIPAC and DMFI</span>
                        </div>
                      );
                    }

                    if (aipac || dmfi) {
                      return (
                        <div className="space-y-0.5">
                          {aipac && (
                            <div className="flex items-center gap-1">
                              <VoteIcon ok={false} size="tiny" />
                              <span className="text-xs md:text-sm lg:text-base xl:text-lg text-slate-800 dark:text-white">Supported by AIPAC</span>
                            </div>
                          )}
                          {dmfi && (
                            <div className="flex items-center gap-1">
                              <VoteIcon ok={false} size="tiny" />
                              <span className="text-xs md:text-sm lg:text-base xl:text-lg text-slate-800 dark:text-white">Supported by DMFI</span>
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="flex items-center gap-1">
                        <VoteIcon ok={true} size="tiny" />
                        <span className="text-xs md:text-sm lg:text-base xl:text-lg text-slate-800 dark:text-white">Not supported by AIPAC or DMFI</span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {!f.categories.has("AIPAC") && gradeColumns.map((gradeCol, idx) => {
                const isOverall = idx === 0;
                const isSummaryMode = f.viewMode === "summary";
                const isLastGrade = idx === gradeColumns.length - 1;
                // Only add border-r if last grade AND not in summary mode (summary has endorsements after)
                const shouldHaveBorder = isLastGrade && !isSummaryMode;

                return (
                  <React.Fragment key={gradeCol.field}>
                    <div
                      className={clsx(
                        "td flex items-center justify-center !py-0 h-full cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10",
                        shouldHaveBorder && "border-r border-[#E7ECF2] dark:border-slate-900"
                      )}
                      onClick={() => {
                        if (isOverall) {
                          // Overall grade opens member card
                          setSelectedCategory(null);
                          setSelected(r);
                        } else {
                          // Category grade opens member card with that category activated
                          setSelectedCategory(gradeCol.header);
                          setSelected(r);
                        }
                      }}
                      title={isOverall ? "Click to view member details" : `Click to view ${gradeCol.header} details`}
                    >
                      <GradeChip grade={isGradeIncomplete(r.bioguide_id) ? "Inc" : String(r[gradeCol.field] || "N/A")} />
                    </div>
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
                      <div key={c} className="td !px-0 py-0 md:py-3 flex items-center justify-center text-sm tabular">
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
                      <div key={c} className="td !px-0 py-0 md:py-3 flex items-center justify-center text-sm tabular font-medium">
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
                    <div key={c} className="td !px-0 py-0 md:py-3 flex items-center justify-center text-sm tabular">
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

                // Check if we need dash for preferred pair (member supported the preferred bill)
                let showDashForPreferredPair = false;
                if (meta?.pair_key && !isTrue((meta as any).preferred) && val === 0 && !notApplicable) {
                  const preferredCol = preferredColByPairKey.get(meta.pair_key);
                  if (preferredCol) {
                    const preferredVal = Number((r as Record<string, unknown>)[preferredCol] ?? 0);
                    const preferredCosponsor = Number((r as Record<string, unknown>)[`${preferredCol}_cosponsor`] ?? 0) === 1;
                    showDashForPreferredPair = preferredVal > 0 || preferredCosponsor;
                  }
                }

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
                    className="group/cell relative td !px-0 !py-0 h-full flex items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
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
                        {meta.description && (
                          <div className="text-xs text-slate-700 dark:text-slate-200 mt-2 normal-case font-normal">
                            {meta.description}{' '}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCell(null);
                                setSelectedBill({ meta, column: c });
                              }}
                              className="text-[#4B8CFB] hover:text-[#3B7CEB] font-medium cursor-pointer"
                            >
                              More &gt;&gt;
                            </button>
                          </div>
                        )}
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

                        {/* View member scorecard button */}
                        <div className="mt-3 pt-3 border-t border-[#E7ECF2] dark:border-slate-900">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCell(null);
                              const firstCategory = meta.categories?.split(';')[0]?.trim();
                              setSelectedCategory(firstCategory || null);
                              setSelected(r);
                            }}
                            className="w-full text-center text-sm font-medium text-[#4B8CFB] hover:text-[#3B7CEB] py-2 px-4 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          >
                            View {lastName(String(r.full_name || "")).charAt(0).toUpperCase() + lastName(String(r.full_name || "")).slice(1)}&apos;s full scorecard
                          </button>
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
                  className="td px-2 flex items-center cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 self-stretch"
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
                          <VoteIcon ok={true} size="tiny" />
                          <span className="text-xs md:text-sm lg:text-base xl:text-lg text-slate-800 dark:text-white font-bold">
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
                          <VoteIcon ok={false} size="tiny" />
                          <span className="text-xs md:text-sm lg:text-base xl:text-lg text-slate-800 dark:text-white">Supported by AIPAC and DMFI</span>
                        </div>
                      );
                    }

                    if (aipac || dmfi) {
                      return (
                        <div className="space-y-0.5">
                          {aipac && (
                            <div className="flex items-center gap-1">
                              <VoteIcon ok={false} size="tiny" />
                              <span className="text-xs md:text-sm lg:text-base xl:text-lg text-slate-800 dark:text-white">Supported by AIPAC</span>
                            </div>
                          )}
                          {dmfi && (
                            <div className="flex items-center gap-1">
                              <VoteIcon ok={false} size="tiny" />
                              <span className="text-xs md:text-sm lg:text-base xl:text-lg text-slate-800 dark:text-white">Supported by DMFI</span>
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="flex items-center gap-1">
                        <VoteIcon ok={true} size="tiny" />
                        <span className="text-xs md:text-sm lg:text-base xl:text-lg text-slate-800 dark:text-white">Not supported by AIPAC or DMFI</span>
                      </div>
                    );
                  })()}
                </div>
              )}

            </div>
          ))}
          {/* Loading indicator for progressive loading */}
          {hasMoreRows && (
            <div ref={loadingIndicatorRef} className="flex items-center justify-center py-8 text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Loading more ({visibleRows.length} of {sorted.length})...</span>
              </div>
            </div>
          )}
          </div>
        </div>
        </div>

        {/* Tracker View */}
        <div
          className={clsx(
            "card rounded-lg md:rounded-2xl overflow-visible",
            f.viewMode !== "tracker" && "hidden"
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
          <div ref={trackerScrollRef} className="overflow-hidden overflow-y-auto min-h-[300px] max-h-[calc(100dvh-11rem)] pb-20 md:pb-4 rounded-lg md:rounded-2xl w-full relative" style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }} onScroll={(e) => { e.currentTarget.scrollLeft = 0; }}>
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

              // Apply custom sort if active
              const sortedBills = [...bills];
              if (trackerSort.col) {
                sortedBills.sort((a: any, b: any) => {
                  let cmp = 0;
                  if (trackerSort.col === 'position') {
                    // Support first, then Oppose
                    cmp = (a.position === 'SUPPORT' ? 0 : 1) - (b.position === 'SUPPORT' ? 0 : 1);
                  } else if (trackerSort.col === 'bill') {
                    const billA = a.meta?.bill_number || a.col;
                    const billB = b.meta?.bill_number || b.col;
                    cmp = billA.localeCompare(billB, undefined, { numeric: true, sensitivity: 'base' });
                  } else if (trackerSort.col === 'title') {
                    const titleA = a.meta?.short_title || a.meta?.display_name || a.col;
                    const titleB = b.meta?.short_title || b.meta?.display_name || b.col;
                    cmp = titleA.localeCompare(titleB, undefined, { sensitivity: 'base' });
                  }
                  return trackerSort.dir === 'desc' ? -cmp : cmp;
                });
              }

              // Group bills by category (only when not custom sorting)
              const billsByCategory = new Map<string, any[]>();
              if (!trackerSort.col) {
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
              }

              // Sort categories
              const sortedCategories = Array.from(billsByCategory.keys()).sort();

              return (
                <>
                  {/* Header */}
                  <div
                    className="grid sticky top-0 z-30 bg-white/70 dark:bg-slate-900/85 backdrop-blur-xl border-b border-[#E7ECF2] dark:border-slate-900 shadow-sm w-full"
                    style={{
                      gridTemplateColumns: isMobile ? "70px 120px 1fr 70px" : "40px 80px 140px calc(100% - 580px) 240px 80px",
                    }}
                  >
                    <div className="th px-2 hidden md:block"></div>
                    <button
                      className="th text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors flex items-center justify-center gap-1"
                      onClick={() => setTrackerSort(prev => ({ col: 'position', dir: prev.col === 'position' && prev.dir === 'asc' ? 'desc' : 'asc' }))}
                    >
                      Position
                      {trackerSort.col === 'position' && (
                        <span className="text-[10px]">{trackerSort.dir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </button>
                    <button
                      className="th cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors flex items-center justify-center gap-1"
                      onClick={() => setTrackerSort(prev => ({ col: 'bill', dir: prev.col === 'bill' && prev.dir === 'asc' ? 'desc' : 'asc' }))}
                    >
                      Bill
                      {trackerSort.col === 'bill' && (
                        <span className="text-[10px]">{trackerSort.dir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </button>
                    <button
                      className="th pl-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors flex items-center gap-1"
                      onClick={() => setTrackerSort(prev => ({ col: 'title', dir: prev.col === 'title' && prev.dir === 'asc' ? 'desc' : 'asc' }))}
                    >
                      Title
                      {trackerSort.col === 'title' && (
                        <span className="text-[10px]">{trackerSort.dir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </button>
                    <div className="th text-center">Sponsor</div>
                    <div className="th text-center hidden md:block">Status</div>
                  </div>

                  {/* Bill Rows */}
                  <div className="w-full max-w-full pb-8 md:pb-4">
                    {trackerSort.col ? (
                      /* Flat sorted list when column sort is active */
                      sortedBills.map((bill: any) => {
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
                                gridTemplateColumns: isMobile ? "70px 120px 1fr 70px" : "40px 80px 140px calc(100% - 580px) 240px 80px",
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

                              {/* NIAC Position - First Column */}
                              <div
                                className="py-3 text-sm text-slate-800 dark:text-white flex flex-col items-center justify-center gap-1"
                              >
                                <span
                                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                                  style={{
                                    backgroundColor: bill.position === "SUPPORT" ? "#0A6F7A" : "#A96A63"
                                  }}
                                >
                                  {bill.position === "SUPPORT" ? "Support" : "Oppose"}
                                </span>
                              </div>

                              {/* Bill Number */}
                              <div
                                className="text-xs font-semibold text-slate-600 dark:text-slate-400 px-2 self-center md:self-start md:pt-[17px] min-w-0 overflow-hidden truncate text-center"
                              >
                                {bill.meta.bill_number || bill.col}
                              </div>

                              {/* Bill Title + Description */}
                              <div
                                className="py-3 text-sm text-slate-800 dark:text-white pl-2 pr-3 min-w-0"
                              >
                                <button
                                  className="text-sm font-bold text-slate-700 dark:text-slate-200 hover:text-[#4B8CFB] dark:hover:text-[#4B8CFB] text-left transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedBill({ meta: bill.meta, column: bill.col });
                                  }}
                                >
                                  {bill.meta.short_title || bill.meta.display_name?.replace(/\s*\([^)]*\)\s*$/, '') || bill.col}
                                </button>
                                {bill.meta.description && (
                                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 hidden md:block">
                                    {bill.meta.description}
                                  </div>
                                )}
                              </div>

                              {/* Sponsor */}
                              <div
                                className="py-3 text-sm text-slate-800 dark:text-white px-2 md:pl-4 md:pr-3 min-w-0 overflow-hidden"
                              >
                                {bill.sponsor ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelected(bill.sponsor);
                                    }}
                                    className="flex items-center gap-1 md:gap-2 max-w-full hover:bg-slate-100 dark:hover:bg-white/10 rounded px-1 -mx-1 transition-colors cursor-pointer text-left w-full overflow-hidden"
                                  >
                                    {bill.sponsor.photo_url ? (
                                      <img
                                        src={getProxiedImageUrl(String(bill.sponsor.photo_url))}
                                        alt=""
                                        loading="lazy"
                                        className="h-8 w-8 md:h-11 md:w-11 rounded-full object-cover bg-slate-200 dark:bg-white/10 flex-shrink-0"
                                      />
                                    ) : (
                                      <div className="h-8 w-8 md:h-11 md:w-11 rounded-full bg-slate-300 dark:bg-white/10 flex-shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0 hidden md:block">
                                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100 break-words leading-tight">
                                        {formatNameFirstLast(bill.sponsor.full_name)}
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
                                    <div className="flex-1 min-w-0 md:hidden overflow-hidden">
                                      <div className="text-[10px] font-medium text-slate-900 dark:text-slate-100 leading-tight truncate">
                                        {formatNameFirstLast(bill.sponsor.full_name)}
                                      </div>
                                      <div className="text-[9px] text-slate-500 dark:text-slate-400 truncate">
                                        {stateCodeOf(bill.sponsor.state)}
                                      </div>
                                    </div>
                                  </button>
                                ) : (
                                  <div className="text-xs text-slate-500 dark:text-slate-400">—</div>
                                )}
                              </div>

                              {/* Status */}
                              <div
                                className="py-3 text-[10px] text-slate-600 dark:text-slate-400 items-center justify-center text-center px-1 hidden md:flex"
                              >
                                {(() => {
                                  const voteTallies = bill.meta.vote_tallies || '';
                                  const isCosponsor = bill.actionType.includes('cosponsor');
                                  const isVote = bill.actionType.includes('vote');

                                  if (voteTallies) {
                                    const parts = voteTallies.split('|').map((s: string) => s.trim());
                                    const lastPart = parts[parts.length - 1];
                                    if (lastPart.toLowerCase().includes('passed')) {
                                      return "Passed";
                                    } else if (lastPart.toLowerCase().includes('failed')) {
                                      return "Failed";
                                    }
                                    return lastPart.split('(')[0].trim();
                                  } else if (isCosponsor) {
                                    return "Active";
                                  } else if (isVote) {
                                    return "Pending";
                                  }
                                  return "—";
                                })()}
                              </div>
                            </div>

                            {/* Expanded view */}
                            {isExpanded && (
                              <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-3 border-t border-[#E7ECF2] dark:border-slate-900">
                                <div className="space-y-3">
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
                                  {bill.meta.analysis && (
                                    <div>
                                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Analysis:</div>
                                      <div className="text-xs text-slate-600 dark:text-slate-300">
                                        {bill.meta.analysis}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      /* Grouped by category when no sort is active */
                      sortedCategories.map((category) => (
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
                                  gridTemplateColumns: isMobile ? "70px 120px 1fr 70px" : "40px 80px 140px calc(100% - 580px) 240px 80px",
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

                                {/* NIAC Position - First Column */}
                                <div
                                  className="py-3 text-sm text-slate-800 dark:text-white flex flex-col items-center justify-center gap-1"
                                >
                                  <span
                                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                                    style={{
                                      backgroundColor: bill.position === "SUPPORT" ? "#0A6F7A" : "#A96A63"
                                    }}
                                  >
                                    {bill.position === "SUPPORT" ? "Support" : "Oppose"}
                                  </span>
                                </div>

                                {/* Bill Number */}
                                <div
                                  className="text-xs font-semibold text-slate-600 dark:text-slate-400 px-2 self-center md:self-start md:pt-[17px] min-w-0 overflow-hidden truncate text-center"
                                >
                                  {bill.meta.bill_number || bill.col}
                                </div>

                                {/* Bill Title + Description */}
                                <div
                                  className="py-3 text-sm text-slate-800 dark:text-white pl-2 pr-3 min-w-0"
                                >
                                  {/* Title */}
                                  <button
                                    className="text-sm font-bold text-slate-700 dark:text-slate-200 hover:text-[#4B8CFB] dark:hover:text-[#4B8CFB] text-left transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedBill({ meta: bill.meta, column: bill.col });
                                    }}
                                  >
                                    {bill.meta.short_title || bill.meta.display_name?.replace(/\s*\([^)]*\)\s*$/, '') || bill.col}
                                  </button>
                                  {/* Description */}
                                  {bill.meta.description && (
                                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 hidden md:block">
                                      {bill.meta.description}
                                    </div>
                                  )}
                                </div>

                                {/* Sponsor */}
                                <div
                                  className="py-3 text-sm text-slate-800 dark:text-white px-2 md:pl-4 md:pr-3 min-w-0 overflow-hidden"
                                >
                                  {bill.sponsor ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelected(bill.sponsor);
                                      }}
                                      className="flex items-center gap-1 md:gap-2 max-w-full hover:bg-slate-100 dark:hover:bg-white/10 rounded px-1 -mx-1 transition-colors cursor-pointer text-left w-full overflow-hidden"
                                    >
                                      {bill.sponsor.photo_url ? (
                                        <img
                                          src={getProxiedImageUrl(String(bill.sponsor.photo_url))}
                                          alt=""
                                          loading="lazy"
                                          className="h-8 w-8 md:h-11 md:w-11 rounded-full object-cover bg-slate-200 dark:bg-white/10 flex-shrink-0"
                                        />
                                      ) : (
                                        <div className="h-8 w-8 md:h-11 md:w-11 rounded-full bg-slate-300 dark:bg-white/10 flex-shrink-0" />
                                      )}
                                      <div className="flex-1 min-w-0 hidden md:block">
                                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100 break-words leading-tight">
                                          {formatNameFirstLast(bill.sponsor.full_name)}
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
                                      <div className="flex-1 min-w-0 md:hidden overflow-hidden">
                                        <div className="text-[10px] font-medium text-slate-900 dark:text-slate-100 leading-tight truncate">
                                          {formatNameFirstLast(bill.sponsor.full_name)}
                                        </div>
                                        <div className="text-[9px] text-slate-500 dark:text-slate-400 truncate">
                                          {stateCodeOf(bill.sponsor.state)}
                                        </div>
                                      </div>
                                    </button>
                                  ) : (
                                    <div className="text-xs text-slate-500 dark:text-slate-400">—</div>
                                  )}
                                </div>

                                {/* Status */}
                                <div
                                  className="py-3 text-[10px] text-slate-600 dark:text-slate-400 items-center justify-center text-center px-1 hidden md:flex"
                                >
                                  {(() => {
                                    const voteTallies = bill.meta.vote_tallies || '';
                                    const isCosponsor = bill.actionType.includes('cosponsor');
                                    const isVote = bill.actionType.includes('vote');

                                    if (voteTallies) {
                                      const parts = voteTallies.split('|').map((s: string) => s.trim());
                                      const lastPart = parts[parts.length - 1];
                                      if (lastPart.toLowerCase().includes('passed')) {
                                        return "Passed";
                                      } else if (lastPart.toLowerCase().includes('failed')) {
                                        return "Failed";
                                      }
                                      return lastPart.split('(')[0].trim();
                                    } else if (isCosponsor) {
                                      return "Active";
                                    } else if (isVote) {
                                      return "Pending";
                                    }
                                    return "—";
                                  })()}
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
                    ))
                    )}
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

function Filters({ filteredCount, metaByCol, selectedMapBill, setSelectedMapBill, setSortCol, setSortDir, tableScrollRef, rows, cols, onSelectMember }: { filteredCount: number; metaByCol: Map<string, Meta>; selectedMapBill: string; setSelectedMapBill: (value: string) => void; setSortCol: (col: string) => void; setSortDir: (dir: "GOOD_FIRST" | "BAD_FIRST") => void; tableScrollRef: React.RefObject<HTMLDivElement | null>; rows: Row[]; cols: string[]; onSelectMember?: (member: Row) => void }) {
  const f = useFilters();

  // Territories without senators
  const territoriesWithoutSenate = ["VI", "PR", "DC", "AS", "GU", "MP"];

  // Handler for map view selection that auto-switches chamber filter
  const handleBillSelect = (selection: string) => {
    setSelectedMapBill(selection);

    if (!selection) {
      // Reset to no chamber filter when clearing selection
      return;
    }

    // Partisan with "Both" shows 2024 Presidential map - don't auto-switch
    if (selection === '__PARTISAN__') {
      // Allow "Both" to stay selected for presidential map
      return;
    }

    // Category grades and AIPAC selections work with any chamber
    // Just switch to House by default if currently on "Both"
    if (!f.chamber) {
      f.set({ chamber: 'HOUSE' });
    }
  };

  // Map view filters
  if (f.viewMode === "map") {
    return (
      <div className="mb-1 px-2 md:px-0">
        <div className="flex items-end gap-2 overflow-x-auto pb-1">
          {/* Chamber - Mobile dropdown */}
          <div className="flex flex-col gap-0.5 flex-shrink-0 md:hidden">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">Chamber</span>
            <select
              className={clsx(
                "select !text-xs !h-8 !pl-2 !pr-6 !cursor-pointer",
                f.chamber
                  ? "!bg-[#4B8CFB] !text-white !border-[#4B8CFB]"
                  : ""
              )}
              value={f.chamber}
              onChange={(e) => f.set({ chamber: e.target.value as any })}
            >
              <option value="" disabled={!!selectedMapBill && selectedMapBill !== '__PARTISAN__'}>
                {selectedMapBill === '__PARTISAN__' ? 'President' : 'Both'}
              </option>
              <option value="HOUSE">House</option>
              <option value="SENATE">Senate</option>
            </select>
          </div>

          {/* Chamber - Desktop Segmented */}
          <div className="hidden md:flex flex-col gap-0.5 flex-shrink-0">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">Chamber</span>
            <Segmented
              options={selectedMapBill === '__PARTISAN__' ? ["President", "House","Senate"] : ["Both", "House","Senate"]}
              value={f.chamber ? (f.chamber.charAt(0) + f.chamber.slice(1).toLowerCase()) : (selectedMapBill === '__PARTISAN__' ? "President" : "Both")}
              onChange={(v)=>{
                if (v === "Both" || v === "President") {
                  f.set({ chamber: "" });
                } else {
                  f.set({ chamber: v.toUpperCase() as any });
                }
              }}
              disabledOptions={(() => {
                const disabled: string[] = [];
                // Disable "Both" for all map selections except Partisan (which shows presidential map)
                if (selectedMapBill && selectedMapBill !== '__PARTISAN__') {
                  disabled.push("Both");
                }
                return disabled;
              })()}
            />
          </div>

          {/* Map selector for map view */}
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">Map</span>
            <select
              className="select !text-xs !h-8 !px-2 max-w-[200px]"
              value={selectedMapBill}
              onChange={(e) => handleBillSelect(e.target.value)}
            >
              <option value="">Overall Grade</option>
              <option value="__PARTISAN__">Partisan</option>
              <option value="__AIPAC__">AIPAC & DMFI Support</option>
              <optgroup label="Category Grades">
                <option value="Grade_Iran">Iran</option>
                <option value="Grade_Israel_Gaza">Israel-Gaza</option>
                <option value="Grade_Civil_Rights_Immigration">Civil Rights & Immigration</option>
              </optgroup>
            </select>
          </div>
        </div>
      </div>
    );
  }

  // Tracker view filters
  if (f.viewMode === "tracker") {
    return (
      <div className="mb-1 px-2 md:px-0 space-y-1">
        {/* Row 1: Chamber + Search (mobile) / Issues + Chamber + Search (desktop) */}
        <div className="flex items-end gap-2 md:gap-3 overflow-x-auto pb-1">
          {/* Issues dropdown - Desktop only on first row */}
          <div className="hidden md:flex flex-col gap-0.5 flex-shrink-0">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">Issues</span>
            <select
              className={clsx(
                "select !text-xs !h-8 !px-2 !cursor-pointer",
                f.categories.size > 0
                  ? "!bg-[#4B8CFB] !text-white !border-[#4B8CFB]"
                  : ""
              )}
              value={f.categories.size > 0 ? Array.from(f.categories)[0] : ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  f.set({ categories: new Set([val]) });
                } else {
                  f.set({ categories: new Set() });
                }
              }}
            >
              <option value="">All Issues</option>
              <option value="Civil Rights & Immigration">Civil Rights & Immigration</option>
              <option value="Iran">Iran</option>
              <option value="Israel-Gaza">Israel-Gaza</option>
            </select>
          </div>

          {/* Chamber - Mobile dropdown */}
          <div className="flex flex-col gap-0.5 flex-shrink-0 md:hidden">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">Chamber</span>
            <select
              className={clsx(
                "select !text-xs !h-8 !px-2 !cursor-pointer",
                f.chamber
                  ? "!bg-[#4B8CFB] !text-white !border-[#4B8CFB]"
                  : ""
              )}
              value={f.chamber}
              onChange={(e) => f.set({ chamber: e.target.value as any })}
            >
              <option value="">Both</option>
              <option value="HOUSE">House</option>
              <option value="SENATE">Senate</option>
            </select>
          </div>

          {/* Chamber - Desktop buttons */}
          <div className="hidden md:flex flex-col gap-0.5 flex-shrink-0">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">Chamber</span>
            <div className="inline-flex rounded-lg border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-white/5 p-0.5">
              <button
                onClick={() => f.set({ chamber: "" })}
                className={clsx(
                  "px-2 h-6 rounded-md text-xs",
                  !f.chamber
                    ? "bg-[#4B8CFB] text-white"
                    : "hover:bg-slate-50 dark:hover:bg-white/10"
                )}
              >
                Both
              </button>
              <button
                onClick={() => f.set({ chamber: "HOUSE" })}
                className={clsx(
                  "px-2 h-6 rounded-md text-xs",
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
                  "px-2 h-6 rounded-md text-xs",
                  f.chamber === "SENATE"
                    ? "bg-[#4B8CFB] text-white"
                    : "hover:bg-slate-50 dark:hover:bg-white/10"
                )}
              >
                Senate
              </button>
            </div>
          </div>

          {/* Search button - pushed to far right */}
          <div className="flex-1 flex justify-end">
            <div className="flex flex-col gap-0.5 flex-shrink-0">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">Search</span>
              <UnifiedSearch
                filteredCount={filteredCount}
                metaByCol={metaByCol}
                isMapView={false}
                isTrackerView={true}
                rows={rows}
                cols={cols}
                onSelectMember={onSelectMember}
              />
            </div>
          </div>
        </div>

        {/* Row 2: Issues dropdown - Mobile only */}
        <div className="flex md:hidden items-end gap-2">
          <div className="flex flex-col gap-0.5 flex-1">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">Issues</span>
            <select
              className={clsx(
                "select !text-xs !h-8 !px-2 !cursor-pointer w-full",
                f.categories.size > 0
                  ? "!bg-[#4B8CFB] !text-white !border-[#4B8CFB]"
                  : ""
              )}
              value={f.categories.size > 0 ? Array.from(f.categories)[0] : ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  f.set({ categories: new Set([val]) });
                } else {
                  f.set({ categories: new Set() });
                }
              }}
            >
              <option value="">All Issues</option>
              <option value="Civil Rights & Immigration">Civil Rights & Immigration</option>
              <option value="Iran">Iran</option>
              <option value="Israel-Gaza">Israel-Gaza</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  // Scorecard view filters - single line: Issues | Chamber | Party | State | Search
  return (
    <div className="mb-1 px-2 md:px-0 space-y-1">
      {/* Row 1: Chamber + Party + State + Search (mobile) / All filters (desktop) */}
      <div className="flex items-end gap-2 md:gap-3 overflow-x-auto pb-1">
        {/* Issues dropdown - Desktop only on first row */}
        <div className="hidden md:flex flex-col gap-0.5 flex-shrink-0">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">Issues</span>
          <select
            className={clsx(
              "select !text-xs !h-8 !px-2 !cursor-pointer",
              f.categories.size > 0
                ? "!bg-[#4B8CFB] !text-white !border-[#4B8CFB]"
                : ""
            )}
            value={f.categories.size > 0 ? Array.from(f.categories)[0] : ""}
            onChange={(e) => {
              const val = e.target.value;
              if (val) {
                f.set({ viewMode: "category", categories: new Set([val]) });
              } else {
                f.set({ viewMode: "summary", categories: new Set() });
              }
            }}
          >
            <option value="">All Issues</option>
            <option value="Civil Rights & Immigration">Civil Rights & Immigration</option>
            <option value="Iran">Iran</option>
            <option value="Israel-Gaza">Israel-Gaza</option>
            <option value="AIPAC">AIPAC</option>
          </select>
        </div>

        {/* Chamber - Mobile dropdown */}
        <div className="flex flex-col gap-0.5 flex-1 md:hidden">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">Chamber</span>
          <select
            className={clsx(
              "select !text-xs !h-8 !px-2 !cursor-pointer w-full",
              f.chamber
                ? "!bg-[#4B8CFB] !text-white !border-[#4B8CFB]"
                : ""
            )}
            value={f.chamber}
            onChange={(e) => f.set({ chamber: e.target.value as any })}
          >
            <option value="">Both</option>
            <option value="HOUSE">House</option>
            <option value="SENATE">Senate</option>
          </select>
        </div>

        {/* Chamber - Desktop buttons */}
        <div className="hidden md:flex flex-col gap-0.5 flex-shrink-0">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">Chamber</span>
          <div className="inline-flex rounded-lg border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-white/5 p-0.5">
            <button
              onClick={() => f.set({ chamber: "" })}
              className={clsx(
                "px-2 h-6 rounded-md text-xs",
                !f.chamber
                  ? "bg-[#4B8CFB] text-white"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              Both
            </button>
            <button
              onClick={() => f.set({ chamber: "HOUSE" })}
              className={clsx(
                "px-2 h-6 rounded-md text-xs",
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
                "px-2 h-6 rounded-md text-xs",
                f.chamber === "SENATE"
                  ? "bg-[#4B8CFB] text-white"
                  : "hover:bg-slate-50 dark:hover:bg-white/10"
              )}
            >
              Senate
            </button>
          </div>
        </div>

        {/* Party - Mobile dropdown */}
        <div className="flex flex-col gap-0.5 flex-1 md:hidden">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">Party</span>
          <select
            className={clsx(
              "select !text-xs !h-8 !px-2 !cursor-pointer w-full",
              f.party
                ? "!bg-[#4B8CFB] !text-white !border-[#4B8CFB]"
                : ""
            )}
            value={f.party}
            onChange={(e) => f.set({ party: e.target.value })}
          >
            <option value="">All</option>
            <option value="Democratic">Dem</option>
            <option value="Republican">Rep</option>
          </select>
        </div>

        {/* Party - Desktop buttons */}
        <div className="hidden md:flex flex-col gap-0.5 flex-shrink-0">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">Party</span>
          <div className="inline-flex rounded-lg border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-white/5 p-0.5 gap-0.5">
            <button
              onClick={() => f.set({ party: f.party === "Democratic" ? "" : "Democratic" })}
              className={clsx(
                "w-6 h-6 rounded-md text-xs font-bold transition-colors",
                f.party === "Democratic"
                  ? "text-white"
                  : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"
              )}
              style={f.party === "Democratic" ? { backgroundColor: "#2563EB" } : undefined}
              title="Democratic (includes Independents)"
            >
              D
            </button>
            <button
              onClick={() => f.set({ party: f.party === "Republican" ? "" : "Republican" })}
              className={clsx(
                "w-6 h-6 rounded-md text-xs font-bold transition-colors",
                f.party === "Republican"
                  ? "text-white"
                  : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50"
              )}
              style={f.party === "Republican" ? { backgroundColor: "#DC2626" } : undefined}
              title="Republican"
            >
              R
            </button>
          </div>
        </div>

        {/* State - Mobile (abbreviations) */}
        <div className="flex flex-col gap-0.5 flex-1 md:hidden">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">State</span>
          <select
            className={clsx(
              "select !text-xs !h-8 !px-2 !cursor-pointer w-full",
              f.state
                ? "!bg-[#4B8CFB] !text-white !border-[#4B8CFB]"
                : ""
            )}
            value={f.state || ""}
            onChange={(e) => {
              const selectedState = e.target.value;
              if (selectedState && territoriesWithoutSenate.includes(selectedState)) {
                f.set({ state: selectedState, chamber: "HOUSE" });
              } else {
                f.set({ state: selectedState });
              }
              if (selectedState && tableScrollRef.current) {
                setTimeout(() => {
                  tableScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }, 50);
              }
            }}
          >
            <option value="">All</option>
            {STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code}
              </option>
            ))}
          </select>
        </div>

        {/* State - Desktop (full names) */}
        <div className="hidden md:flex flex-col gap-0.5 flex-shrink-0">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">State</span>
          <select
            className={clsx(
              "select !text-xs !h-8 !px-2 !cursor-pointer",
              f.state
                ? "!bg-[#4B8CFB] !text-white !border-[#4B8CFB]"
                : ""
            )}
            value={f.state || ""}
            onChange={(e) => {
              const selectedState = e.target.value;
              if (selectedState && territoriesWithoutSenate.includes(selectedState)) {
                f.set({ state: selectedState, chamber: "HOUSE" });
              } else {
                f.set({ state: selectedState });
              }
              if (selectedState && tableScrollRef.current) {
                setTimeout(() => {
                  tableScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }, 50);
              }
            }}
          >
            <option value="">All</option>
            {STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Search button - pushed to far right */}
        <div className="flex-1 flex justify-end">
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">Search</span>
            <UnifiedSearch
              filteredCount={filteredCount}
              metaByCol={metaByCol}
              isMapView={false}
              isTrackerView={false}
              rows={rows}
              cols={cols}
              onSelectMember={onSelectMember}
            />
          </div>
        </div>
      </div>

      {/* Row 2: Issues dropdown - Mobile only */}
      <div className="flex md:hidden items-end gap-2">
        <div className="flex flex-col gap-0.5 flex-1">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium px-1">Issues</span>
          <select
            className={clsx(
              "select !text-xs !h-8 !px-2 !cursor-pointer w-full",
              f.categories.size > 0
                ? "!bg-[#4B8CFB] !text-white !border-[#4B8CFB]"
                : ""
            )}
            value={f.categories.size > 0 ? Array.from(f.categories)[0] : ""}
            onChange={(e) => {
              const val = e.target.value;
              if (val) {
                f.set({ viewMode: "category", categories: new Set([val]) });
              } else {
                f.set({ viewMode: "summary", categories: new Set() });
              }
            }}
          >
            <option value="">All Issues</option>
            <option value="Civil Rights & Immigration">Civil Rights & Immigration</option>
            <option value="Iran">Iran</option>
            <option value="Israel-Gaza">Israel-Gaza</option>
            <option value="AIPAC">AIPAC</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function UnifiedSearch({ filteredCount, metaByCol, isMapView, isTrackerView = false, rows, cols, onSelectMember }: { filteredCount: number; metaByCol: Map<string, Meta>; isMapView: boolean; isTrackerView?: boolean; rows: Row[]; cols: string[]; onSelectMember?: (member: Row) => void }) {
  const f = useFilters();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [searchType, setSearchType] = useState<"zip" | "name" | "legislation">(
    isMapView ? "zip" : isTrackerView ? "legislation" : "name"
  );
  const [searchValue, setSearchValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDropdown, setShowDropdown] = useState(true);

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
      // Check for single match - open modal directly
      const matches = rows.filter(r =>
        String(r.full_name || "").toLowerCase().includes(searchValue.toLowerCase())
      );
      if (matches.length === 1 && onSelectMember) {
        onSelectMember(matches[0]);
        setSearchValue("");
        setIsOpen(false);
      } else {
        // Multiple matches - go to scorecard
        if (f.viewMode === "map" || f.viewMode === "tracker") {
          f.set({ search: searchValue, viewMode: "summary" });
        } else {
          f.set({ search: searchValue });
        }
        setIsOpen(false);
      }
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
          className="h-8 w-8 rounded-lg border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 flex items-center justify-center"
          onClick={() => setIsOpen(!isOpen)}
          title={isTrackerView ? "Find a bill" : "Find your lawmakers"}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      )}

      {isOpen && (
        <>
          {/* Backdrop to close on click outside */}
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setIsOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white dark:bg-slate-800 border border-[#E7ECF2] dark:border-slate-900 rounded-lg shadow-2xl p-4 w-[90vw] max-w-[340px]">
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

            <div className="relative">
              <input
                type="text"
                placeholder={getPlaceholder()}
                className="input !w-full"
                value={searchValue}
                onChange={(e) => { setSearchValue(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setShowDropdown(false); handleSearch(); } }}
                disabled={loading}
                autoFocus
              />
              {/* Name Autocomplete */}
              {showDropdown && searchType === "name" && searchValue.trim().length >= 2 && (() => {
                const query = searchValue.toLowerCase();
                const matches = rows
                  .filter(r => {
                    const name = String(r.full_name || "").toLowerCase();
                    return name.includes(query);
                  })
                  .slice(0, 5);
                if (matches.length === 0) return null;
                return (
                  <>
                    <div className="fixed inset-0 z-[45]" onClick={() => setShowDropdown(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-700 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-600">
                      {matches.map((member, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setShowDropdown(false);
                            setIsOpen(false);
                            // Directly open member modal or search
                            if (onSelectMember) {
                              onSelectMember(member);
                            } else {
                              f.set({ search: String(member.full_name || ""), viewMode: f.viewMode === "map" || f.viewMode === "tracker" ? "summary" : f.viewMode });
                            }
                            setSearchValue("");
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-600 text-sm border-b border-slate-100 dark:border-slate-600 last:border-0"
                        >
                          <span className="text-slate-800 dark:text-slate-200 font-medium">{String(member.full_name || "")}</span>
                          <span className="text-slate-500 dark:text-slate-400 text-xs ml-2">
                            ({member.party === "Democratic" ? "D" : member.party === "Republican" ? "R" : "I"}) {member.state}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
              {/* Bill Autocomplete */}
              {showDropdown && searchType === "legislation" && searchValue.trim().length >= 2 && (() => {
                const query = searchValue.toLowerCase();
                const matches = cols
                  .map(col => ({ col, meta: metaByCol.get(col) }))
                  .filter(({ col, meta }) => {
                    if (!meta) return false;
                    const displayName = (meta.display_name || "").toLowerCase();
                    const colLower = col.toLowerCase();
                    return displayName.includes(query) || colLower.includes(query);
                  })
                  .slice(0, 5);
                if (matches.length === 0) return null;
                return (
                  <>
                    <div className="fixed inset-0 z-[45]" onClick={() => setShowDropdown(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-700 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-600">
                      {matches.map(({ col, meta }, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setShowDropdown(false);
                            setIsOpen(false);
                            // Directly go to bill in tracker
                            f.set({ billColumn: meta?.display_name || col, viewMode: "tracker" });
                            setSearchValue("");
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-600 text-sm border-b border-slate-100 dark:border-slate-600 last:border-0"
                        >
                          <span className="text-slate-800 dark:text-slate-200 font-medium block text-xs">{meta?.display_name || col}</span>
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
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
        </>
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

