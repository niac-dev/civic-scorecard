"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { loadData, loadManualScoringMeta } from "@/lib/loadCsv";
import type { Row, Meta } from "@/lib/types";
import { IRAN_WAR_POWERS_CONFIG } from "@/lib/iranWarPowersConfig";
import {
  partyBadgeStyle,
  partyLabel,
  stateCodeOf,
  getPhotoUrl,
} from "@/lib/utils";
import { MemberModal } from "@/components/MemberModal";
import { BillModal } from "@/components/BillModal";
import { VoteIcon } from "@/components/GradeChip";

type PositionStatus = "support" | "likely_support" | "likely_oppose" | "oppose";

// Read position directly from the CSV column computed by backend
function getOverallPosition(member: Row): PositionStatus {
  const pos = String(member.iran_war_powers_position || "").trim();
  if (pos === "support" || pos === "likely_support" || pos === "likely_oppose" || pos === "oppose") {
    return pos;
  }
  return member.party === "Democratic" ? "likely_support" : "likely_oppose";
}

// Generate legislative action text for card display
// HConRes38: 10+ = cosponsored+voted yes, 5 = voted yes only, 0 = voted against
// SJRes104:   7+ = cosponsored+voted yes, 5 = voted yes only, 0 = voted against
function getLegislationText(member: Row): React.ReactNode {
  const nameParts = (member.full_name || "").split(",");
  const lastName = nameParts[0]?.trim() || "";
  const title = member.chamber === "SENATE" ? "Sen." : "Rep.";
  const name = `${title} ${lastName}`;

  if (member.chamber === "HOUSE") {
    const val = member[IRAN_WAR_POWERS_CONFIG.house.preferred.column];
    if (val != null && val !== "") {
      const n = Number(val);
      if (n >= 10) return <>{name} cosponsored and voted <strong>in favor</strong> of the Massie-Khanna Iran War Powers Resolution.</>;
      if (n === 5)  return <>{name} voted <strong>in favor</strong> of the Massie-Khanna Iran War Powers Resolution.</>;
      if (n === 0)  return <>{name} voted <strong>against</strong> the Massie-Khanna Iran War Powers Resolution.</>;
    }
    return `${name} has not cosponsored the war powers resolution.`;
  } else {
    const cosponsorVal = member["S.J.Res.104 — Iran War Powers Resolution 2026"];
    if (cosponsorVal != null && cosponsorVal !== "") {
      const n = Number(cosponsorVal);
      if (n >= 7) return <>{name} voted <strong>in favor</strong> of the Iran War Powers Resolution.</>;
      if (n === 5) return <>{name} voted <strong>in favor</strong> of the Iran War Powers Resolution.</>;
      if (n === 0) return <>{name} voted <strong>against</strong> the Iran War Powers Resolution.</>;
    }
    // Fallback: older SJRes59 vote
    const voteVal = member[IRAN_WAR_POWERS_CONFIG.senate.column];
    if (voteVal !== null && voteVal !== undefined && voteVal !== "") {
      const n = Number(voteVal);
      if (n > 0) return <>{name} voted <strong>in favor</strong> of the Iran War Powers Resolution.</>;
      if (n === 0) return <>{name} voted <strong>against</strong> the Iran War Powers Resolution.</>;
    }
    return `${name} has not voted on the Iran War Powers Resolution.`;
  }
}

// Determine the icon status for the legislation line (based on legislative action only)
// Party default is NOT used here — "no action" always shows the orange dash
function getLegislationStatus(member: Row): PositionStatus {
  if (member.chamber === "HOUSE") {
    const val = member[IRAN_WAR_POWERS_CONFIG.house.preferred.column];
    if (val != null && val !== "") {
      const n = Number(val);
      if (n > 0) return "support";
      if (n === 0) return "oppose";
    }
  } else {
    const cosponsorVal = member["S.J.Res.104 — Iran War Powers Resolution 2026"];
    if (cosponsorVal != null && cosponsorVal !== "") {
      const n = Number(cosponsorVal);
      if (n > 0) return "support";
      if (n === 0) return "oppose";
    }
    const voteVal = member[IRAN_WAR_POWERS_CONFIG.senate.column];
    if (voteVal !== null && voteVal !== undefined && voteVal !== "") {
      const n = Number(voteVal);
      if (n > 0) return "support";
      if (n === 0) return "oppose";
    }
  }
  return "likely_oppose";
}

// Format member name as "Title First Last"
function formatMemberName(member: Row): string {
  const nameParts = (member.full_name || "").split(",");
  const lastName = nameParts[0]?.trim() || "";
  const firstName = nameParts[1]?.trim().split(" ")[0] || "";
  const title = member.chamber === "SENATE" ? "Senator" : "Representative";
  return `${title} ${firstName} ${lastName}`;
}

// Build the "first last" key used to look up war statements (matches loadWarStatements key format)
function memberStatementKey(fullName: string): string {
  const parts = (fullName || "").split(",");
  const last = parts[0]?.trim() || "";
  const first = parts[1]?.trim().split(" ")[0] || "";
  return `${first} ${last}`.toLowerCase();
}

// Flexible name matching - handles "First Last", "Last, First", partial matches
function matchesName(fullName: string, query: string): boolean {
  const q = query.toLowerCase().trim();
  const name = (fullName || "").toLowerCase();

  // Direct match
  if (name.includes(q)) return true;

  // Parse "Last, First" format
  const nameParts = name.split(",");
  const lastName = nameParts[0]?.trim() || "";
  const firstName = nameParts[1]?.trim() || "";

  // Check if query matches "First Last" format
  const queryParts = q.split(/\s+/);
  if (queryParts.length >= 2) {
    const queryFirst = queryParts[0];
    const queryLast = queryParts.slice(1).join(" ");
    // "First Last" -> check if firstName starts with queryFirst and lastName starts with queryLast
    if (firstName.startsWith(queryFirst) && lastName.startsWith(queryLast)) return true;
    // Also try "Last First" order
    if (lastName.startsWith(queryFirst) && firstName.startsWith(queryLast)) return true;
  }

  // Check individual parts
  if (firstName.includes(q) || lastName.includes(q)) return true;

  return false;
}

// ── Hemicycle (parliament-style) helpers ─────────────────────────────────────

function generateHemicycleSeats(
  total: number,
  numRows: number,
  innerRadius: number,
  rowSpacing: number,
  cx: number,
  cy: number
): Array<{ x: number; y: number }> {
  if (total === 0) return [];

  const radii = Array.from({ length: numRows }, (_, i) => innerRadius + i * rowSpacing);
  const radiusSum = radii.reduce((a, b) => a + b, 0);

  // Distribute seats proportional to arc length (radius)
  const seatsPerRow = radii.map((r) => Math.round((total * r) / radiusSum));

  // Fix rounding so total matches exactly
  let diff = total - seatsPerRow.reduce((a, b) => a + b, 0);
  let row = numRows - 1;
  while (diff > 0) { seatsPerRow[row]++; diff--; row = (row - 1 + numRows) % numRows; }
  while (diff < 0) { seatsPerRow[row]--; diff++; row = (row - 1 + numRows) % numRows; }

  const seats: Array<{ x: number; y: number }> = [];

  for (let r = 0; r < numRows; r++) {
    const radius = radii[r];
    const n = seatsPerRow[r];
    for (let i = 0; i < n; i++) {
      // Sweep from π (left edge) → 0 (right edge)
      const angle = n === 1 ? Math.PI / 2 : Math.PI * (1 - i / (n - 1));
      seats.push({
        x: cx + radius * Math.cos(angle),
        y: cy - radius * Math.sin(angle),
      });
    }
  }

  return seats;
}

function HemicycleChart({
  members,
  label,
  numRows,
  innerRadius,
  rowSpacing,
  dotRadius,
}: {
  members: { isSupport: boolean; party: string }[];
  label: string;
  numRows: number;
  innerRadius: number;
  rowSpacing: number;
  dotRadius: number;
}) {
  const total = members.length;
  const W = 220, cx = 110, cy = 118;
  const H = cy + dotRadius + 2;
  const outerRadius = innerRadius + (numRows - 1) * rowSpacing;
  const topClip = Math.max(0, cy - outerRadius - dotRadius - 4);

  const seats = useMemo(
    () => generateHemicycleSeats(total, numRows, innerRadius, rowSpacing, cx, cy),
    [total, numRows, innerRadius, rowSpacing]
  );

  // Sort seats left → right; assign support members to left seats, oppose to right
  // Each dot: fill = green (support) or F-grade burgundy (oppose); stroke = party color
  const dotsBySeatIdx = useMemo(() => {
    const order = seats.map((s, i) => ({ i, x: s.x })).sort((a, b) => a.x - b.x);
    // members is already sorted: support first, then oppose
    const dots = new Array(seats.length).fill(null).map(() => ({ fill: "#A96A63", stroke: "#94A3B8" }));
    order.forEach(({ i }, idx) => {
      const member = members[idx];
      if (!member) return;
      const fill = member.isSupport ? "#0A6F7A" : "#A96A63";
      const party = (member.party || "").toLowerCase();
      const stroke = party.startsWith("rep") ? "#DC2626" : party.startsWith("dem") ? "#2563EB" : "#94A3B8";
      dots[i] = { fill, stroke };
    });
    return dots;
  }, [seats, members]);

  if (total === 0) return null;

  return (
    <div>
      {label && (
        <p className="text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5 uppercase tracking-wide">
          {label}
        </p>
      )}
      <svg viewBox={`0 ${topClip} ${W} ${H - topClip}`} className="w-full block">
        {seats.map((seat, i) => (
          <circle
            key={i}
            cx={seat.x}
            cy={seat.y}
            r={dotRadius - 0.5}
            fill={dotsBySeatIdx[i].fill}
            stroke={dotsBySeatIdx[i].stroke}
            strokeWidth={0.8}
          />
        ))}
      </svg>
    </div>
  );
}

function ScoreFlap({
  count,
  color,
  label,
  small = false,
  active = false,
  onClick,
}: {
  count: number;
  color: "green" | "amber" | "orange" | "red";
  label: string;
  small?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const textColor =
    color === "green" ? "#6BBEC4" : color === "amber" ? "#fbbf24" : color === "orange" ? "#fb923c" : "#f87171";
  const ringColor =
    color === "green" ? "#0A6F7A" : color === "amber" ? "#f59e0b" : color === "orange" ? "#f97316" : "#ef4444";
  const w = small ? 40 : 44;
  const h = small ? 48 : 52;
  const fs = small ? (count >= 100 ? 15 : 20) : (count >= 100 ? 17 : 22);
  const labelFs = small ? 8 : 9;
  return (
    <div
      className={`flex flex-col items-center gap-0.5 ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div
        className="relative rounded overflow-hidden flex items-center justify-center transition-all"
        style={{
          width: w,
          height: h,
          background: "linear-gradient(to bottom, #0c1220 50%, #161f32 50%)",
          boxShadow: active
            ? `inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 2px ${ringColor}`
            : "inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 6px rgba(0,0,0,0.5)",
        }}
      >
        {/* Midline split */}
        <div
          className="absolute inset-x-0 z-10"
          style={{ top: "calc(50% - 1px)", height: 2, background: "#000" }}
        />
        <span
          className="relative z-20 font-bold tabular-nums leading-none"
          style={{ color: textColor, fontSize: fs }}
        >
          {count}
        </span>
      </div>
      <span
        className="text-center leading-tight text-slate-500 dark:text-slate-400"
        style={{ fontSize: labelFs, maxWidth: w + 6 }}
      >
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function IranWarPowersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [metaByCol, setMetaByCol] = useState<Map<string, Meta>>(new Map());
  const [categories, setCategories] = useState<string[]>([]);
  const [manualScoringMeta, setManualScoringMeta] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  // Search state
  const [searchTab, setSearchTab] = useState<"name" | "location">("location");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [myLawmakers, setMyLawmakers] = useState<string[]>([]);
  const [chamberFilter, setChamberFilter] = useState<"" | "HOUSE" | "SENATE">("");
  const [partyFilter, setPartyFilter] = useState<"" | "Democratic" | "Republican" | "Independent">("");
  const [statusFilter, setStatusFilter] = useState<"support" | "oppose" | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Ref for scrolling to results
  const resultsRef = useRef<HTMLDivElement>(null);

  // Filter expand state
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Modal state
  const [selectedMember, setSelectedMember] = useState<Row | null>(null);
  const [selectedBillModal, setSelectedBillModal] = useState<{ meta: Meta; column: string } | null>(null);

  // Header hide/show on scroll
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollingDown = currentScrollY > lastScrollY.current;
      const scrolledPastThreshold = currentScrollY > 100;

      if (scrollingDown && scrolledPastThreshold) {
        setHeaderVisible(false);
      } else {
        setHeaderVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Load data
  useEffect(() => {
    (async () => {
      const [data, manualMeta] = await Promise.all([
        loadData(),
        loadManualScoringMeta(),
      ]);
      setRows(data.rows);
      setCols(data.columns);
      setMetaByCol(data.metaByCol);
      setCategories(data.categories);
      setManualScoringMeta(manualMeta);
      setLoading(false);
    })();
  }, []);

  // Filter members
  const filtered = useMemo(() => {
    let result = rows;

    // Chamber filter
    if (chamberFilter) {
      result = result.filter((r) => r.chamber === chamberFilter);
    }

    // Party filter
    if (partyFilter) {
      result = result.filter((r) => r.party === partyFilter);
    }

    // Name search (when tab is name and there's a query)
    if (searchTab === "name" && searchQuery.trim()) {
      const search = searchQuery.toLowerCase().trim();
      result = result.filter((r) => {
        const name = (r.full_name || "").toLowerCase();
        return name.includes(search);
      });
    }

    // My lawmakers filter (from location search)
    if (searchTab === "location" && myLawmakers.length > 0) {
      result = result.filter((r) => {
        const dbName = (r.full_name || "");
        return myLawmakers.some((apiName) => {
          const [dbLast, dbFirst] = dbName.split(",").map((s) => s?.trim().toLowerCase());
          const [apiLast, apiFirst] = apiName.split(",").map((s) => s?.trim().toLowerCase());
          if (dbLast !== apiLast || !dbFirst || !apiFirst) return false;
          const dbFirstBase = dbFirst.split(" ")[0];
          const apiFirstBase = apiFirst.split(" ")[0];
          return dbFirstBase.startsWith(apiFirstBase) || apiFirstBase.startsWith(dbFirstBase);
        });
      });
    }

    // Status filter (from whip count flap clicks) — "support" group includes likely_support
    if (statusFilter === "support") {
      result = result.filter((r) => {
        const p = getOverallPosition(r);
        return p === "support" || p === "likely_support";
      });
    } else if (statusFilter === "oppose") {
      result = result.filter((r) => {
        const p = getOverallPosition(r);
        return p === "likely_oppose" || p === "oppose";
      });
    }

    // Sort by chamber (Senate first), then name
    return result.sort((a, b) => {
      if (a.chamber !== b.chamber) {
        return a.chamber === "SENATE" ? -1 : 1;
      }
      return (a.full_name || "").localeCompare(b.full_name || "");
    });
  }, [rows, chamberFilter, partyFilter, searchTab, searchQuery, myLawmakers, statusFilter]);

  // Compute position stats for hemicycle / flap display
  const chamberStats = useMemo(() => {
    const stats = {
      SENATE: { support: 0, likely_support: 0, likely_oppose: 0, oppose: 0, total: 0 },
      HOUSE:  { support: 0, likely_support: 0, likely_oppose: 0, oppose: 0, total: 0 },
    };

    rows.forEach((member) => {
      const chamber = member.chamber as "SENATE" | "HOUSE";
      if (!stats[chamber]) return;
      const pos = getOverallPosition(member);
      stats[chamber][pos]++;
      stats[chamber].total++;
    });

    return stats;
  }, [rows]);

  // Sorted member lists for hemicycle dots (support left, oppose right)
  const hemicycleMembers = useMemo(() => {
    const toEntry = (m: Row) => ({
      isSupport: ["support", "likely_support"].includes(getOverallPosition(m)),
      party: String(m.party || ""),
    });
    const sort = (list: Row[]) => [
      ...list.filter(m => ["support", "likely_support"].includes(getOverallPosition(m))),
      ...list.filter(m => !["support", "likely_support"].includes(getOverallPosition(m))),
    ].map(toEntry);
    return {
      SENATE: sort(rows.filter(r => r.chamber === "SENATE")),
      HOUSE:  sort(rows.filter(r => r.chamber === "HOUSE")),
    };
  }, [rows]);

  // Handle search
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setStatusFilter(null);
    setChamberFilter("");

    if (searchTab === "location") {
      setSearchLoading(true);
      setSearchError(null);

      try {
        const res = await fetch(`/api/find-lawmakers?address=${encodeURIComponent(searchQuery)}`);
        if (!res.ok) throw new Error("Failed to find representatives");

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const names = (data.lawmakers || []).map((o: { name: string }) => o.name);
        setMyLawmakers(names);
        localStorage.setItem("niac-address", searchQuery);
        localStorage.setItem("niac-lawmakers", JSON.stringify(names));
        // Scroll to results after a brief delay for DOM update
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "Failed to look up address");
      } finally {
        setSearchLoading(false);
      }
    }
  };

  const handleClear = () => {
    setSearchQuery("");
    setMyLawmakers([]);
    setSearchError(null);
    localStorage.removeItem("niac-address");
    localStorage.removeItem("niac-lawmakers");
  };

  const hasResults =
    (searchTab === "name" ? searchQuery.trim().length > 0 : myLawmakers.length > 0) ||
    statusFilter !== null ||
    chamberFilter !== "";

  const handleChamberClick = (chamber: "SENATE" | "HOUSE") => {
    setChamberFilter(chamber);
    setStatusFilter(null);
    setSearchQuery("");
    setMyLawmakers([]);
    localStorage.removeItem("niac-address");
    localStorage.removeItem("niac-lawmakers");
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const handleFlapClick = (chamber: "SENATE" | "HOUSE", status: "support" | "oppose") => {
    if (chamberFilter === chamber && statusFilter === status) {
      // Toggle off
      setStatusFilter(null);
      setChamberFilter("");
    } else {
      setChamberFilter(chamber);
      setStatusFilter(status);
      // Clear any active search
      setSearchQuery("");
      setMyLawmakers([]);
      localStorage.removeItem("niac-address");
      localStorage.removeItem("niac-lawmakers");
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-white dark:bg-slate-900">
      {/* Google Font for handwriting style */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&display=swap');
      `}</style>

      {/* Header Band */}
      <div className={`fixed top-0 left-0 right-0 bg-[#002b49] dark:bg-slate-900 py-2 px-0 md:px-4 border-b border-[#001a2e] dark:border-slate-900 z-50 transition-transform duration-300 ${headerVisible ? "translate-y-0" : "-translate-y-full"}`}>
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

      {/* Hero Section with Background */}
      <div className="relative bg-black pt-20 md:pt-24">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10 overflow-hidden">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        <div className="relative z-10 px-4 py-8 md:py-12 max-w-2xl mx-auto text-center">
          {/* Large Handwriting Title */}
          <h1
            className="text-4xl md:text-5xl lg:text-6xl text-white mb-6 leading-tight"
            style={{ fontFamily: "'Caveat', cursive", fontWeight: 600 }}
          >
            Where do <span className="text-yellow-300">YOUR</span> lawmakers stand on <span className="uppercase">ending</span> the war on Iran?
          </h1>

          {/* Search Tabs */}
          <div className="flex rounded-lg bg-white/20 backdrop-blur-sm p-1 mb-4 max-w-md mx-auto">
            <button
              onClick={() => { setSearchTab("name"); setSearchError(null); setMyLawmakers([]); }}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
                searchTab === "name"
                  ? "bg-white text-[#30558C] shadow-sm"
                  : "text-white hover:bg-white/20"
              }`}
            >
              Search by Name
            </button>
            <button
              onClick={() => { setSearchTab("location"); setSearchError(null); }}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
                searchTab === "location"
                  ? "bg-white text-[#30558C] shadow-sm"
                  : "text-white hover:bg-white/20"
              }`}
            >
              Search by Location
            </button>
          </div>

          {/* Search Input */}
          <div className="max-w-md mx-auto relative">
            {searchTab === "name" ? (
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); setStatusFilter(null); setChamberFilter(""); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Enter lawmaker's name..."
                  className="w-full px-4 py-3.5 rounded-lg border-0 bg-white/95 backdrop-blur-sm text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white focus:bg-white shadow-lg text-base"
                />
                {/* Name Autocomplete Dropdown */}
                {showDropdown && searchQuery.trim().length >= 2 && (() => {
                  const query = searchQuery.trim();
                  const matches = rows
                    .filter(r => matchesName(r.full_name || "", query))
                    .slice(0, 6);
                  if (matches.length === 0) return null;
                  return (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                        {matches.map((member, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              setSearchQuery(String(member.full_name || ""));
                              setShowDropdown(false);
                              setStatusFilter(null);
                              setChamberFilter("");
                              // Scroll to results
                              setTimeout(() => {
                                resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                              }, 100);
                            }}
                            className="w-full px-4 py-2.5 text-left hover:bg-slate-100 flex items-center gap-2 border-b border-slate-100 last:border-0"
                          >
                            <span className="text-slate-800 font-medium">{formatMemberName(member)}</span>
                            <span className="text-slate-500 text-sm">
                              ({member.party === "Democratic" ? "D" : member.party === "Republican" ? "R" : "I"}) {stateCodeOf(member.state)}{member.chamber === "HOUSE" ? `-${member.district}` : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Enter address or ZIP code..."
                  className="flex-1 px-4 py-3.5 rounded-lg border-0 bg-white/95 backdrop-blur-sm text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white focus:bg-white shadow-lg text-base"
                />
                <button
                  onClick={handleSearch}
                  disabled={searchLoading || !searchQuery.trim()}
                  className="px-6 py-3.5 bg-yellow-400 text-slate-900 rounded-lg font-semibold hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
                >
                  {searchLoading ? "..." : "Find"}
                </button>
              </div>
            )}
            {searchError && <p className="text-red-300 text-sm mt-2 text-left">{searchError}</p>}
          </div>

          {/* Results indicator */}
          {myLawmakers.length > 0 && searchTab === "location" && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="text-white/80 text-sm">
                Found {myLawmakers.length} lawmakers for your address
              </span>
              <button onClick={handleClear} className="text-yellow-300 text-sm hover:underline">
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Whip Count Bar */}
      <div className="border-y border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
        <div className="flex items-start gap-2 max-w-2xl mx-auto">

          {/* Senate */}
          <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer hover:text-[#30558C] transition-colors" onClick={() => handleChamberClick("SENATE")}>Senate</h3>
            <div className="cursor-pointer w-full" onClick={() => {
              const col = "S.J.Res.104 — Iran War Powers Resolution 2026";
              const m = metaByCol.get(col);
              if (m) setSelectedBillModal({ meta: m, column: col });
            }}>
            <HemicycleChart
              members={hemicycleMembers.SENATE}
              label=""
              numRows={4}
              innerRadius={32}
              rowSpacing={16}
              dotRadius={3.5}
            />
            </div>
            <div className="flex gap-1.5 justify-center">
              <ScoreFlap count={chamberStats.SENATE.support + chamberStats.SENATE.likely_support} color="green" label="Support" small active={chamberFilter === "SENATE" && statusFilter === "support"} onClick={() => handleFlapClick("SENATE", "support")} />
              <ScoreFlap count={chamberStats.SENATE.likely_oppose + chamberStats.SENATE.oppose} color="red" label="Oppose" small active={chamberFilter === "SENATE" && statusFilter === "oppose"} onClick={() => handleFlapClick("SENATE", "oppose")} />
            </div>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 text-center mt-0.5">March 4, 2026</p>
          </div>

          {/* House */}
          <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer hover:text-[#30558C] transition-colors" onClick={() => handleChamberClick("HOUSE")}>House</h3>
            <div className="cursor-pointer w-full" onClick={() => {
              const col = IRAN_WAR_POWERS_CONFIG.house.preferred.column;
              const m = metaByCol.get(col);
              if (m) setSelectedBillModal({ meta: m, column: col });
            }}>
            <HemicycleChart
              members={hemicycleMembers.HOUSE}
              label=""
              numRows={9}
              innerRadius={16}
              rowSpacing={10}
              dotRadius={2}
            />
            </div>
            <div className="flex gap-1.5 justify-center">
              <ScoreFlap count={chamberStats.HOUSE.support + chamberStats.HOUSE.likely_support} color="green" label="Support" small active={chamberFilter === "HOUSE" && statusFilter === "support"} onClick={() => handleFlapClick("HOUSE", "support")} />
              <ScoreFlap count={chamberStats.HOUSE.likely_oppose + chamberStats.HOUSE.oppose} color="red" label="Oppose" small active={chamberFilter === "HOUSE" && statusFilter === "oppose"} onClick={() => handleFlapClick("HOUSE", "oppose")} />
            </div>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 text-center mt-0.5">March 5, 2026</p>
          </div>

        </div>
      </div>

      {/* Results Section */}
      <div ref={resultsRef} className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Filters toggle + expandable panel */}


        {/* Results Grid */}
        {hasResults && (
          <div className="space-y-3">
            {filtered.map((member) => {
              const overallStatus = getOverallPosition(member);
              const legText = getLegislationText(member);

              return (
                <div
                  key={member.bioguide_id || member.full_name}
                  onClick={() => setSelectedMember(member)}
                  className="card p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    {/* Photo */}
                    <div className="flex-shrink-0">
                      {member.bioguide_id ? (
                        <img
                          src={getPhotoUrl(String(member.bioguide_id), "225x275")}
                          alt=""
                          loading="lazy"
                          className="w-14 h-14 sm:w-28 sm:h-28 rounded-full object-cover bg-slate-200 dark:bg-white/10"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (!target.dataset.fallback && member.photo_url) {
                              target.dataset.fallback = "1";
                              target.src = String(member.photo_url);
                            }
                          }}
                        />
                      ) : (
                        <div className="w-14 h-14 sm:w-28 sm:h-28 rounded-full bg-slate-300 dark:bg-white/10" />
                      )}
                    </div>

                    {/* Vote Icon */}
                    <div className="flex-shrink-0 pt-1">
                      <VoteIcon ok={overallStatus === "support" || overallStatus === "likely_support"} size="medium-large" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {/* Name */}
                      <h3 className="font-bold text-slate-900 dark:text-white">
                        {formatMemberName(member)}
                      </h3>

                      {/* Party and State-District */}
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className="px-1.5 py-0.5 rounded text-xs font-medium"
                          style={partyBadgeStyle(member.party)}
                        >
                          {partyLabel(member.party)}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {stateCodeOf(member.state)}
                          {member.chamber === "HOUSE" && member.district ? `-${member.district}` : ""}
                        </span>
                      </div>

                      {/* How they voted */}
                      <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-200">
                        {legText}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Take Action Section */}
        <div className="pt-6 pb-4">
          <h2 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-4">🚨 ACT NOW: Urge Your Lawmakers to Support the Iran War Powers Resolution</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="https://niacouncil.org/campaign/demand-congress-oppose-war-with-iran/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-4 px-6 bg-yellow-400 hover:bg-yellow-300 text-slate-900 text-center text-base font-bold rounded-xl shadow-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Send a message
            </a>
            <a
              href="https://niacouncil.org/campaign/urgent-call-congress-now-hands-off-iran/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-4 px-6 bg-emerald-500 hover:bg-emerald-400 text-white text-center text-base font-bold rounded-xl shadow-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call 1-844-ACT-NIAC
            </a>
          </div>
        </div>
      </div>

      {/* Fixed left-side filter button + popup */}
      {hasResults && (
        <div className="fixed left-0 top-1/2 -translate-y-1/2 z-40 flex items-start">
          {/* Popup panel */}
          {filtersOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setFiltersOpen(false)} />
              <div className="relative z-40 ml-0 bg-white dark:bg-slate-800 shadow-xl rounded-r-xl border border-l-0 border-slate-200 dark:border-slate-700 p-4 w-48 space-y-4">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Chamber</p>
                <div className="flex flex-col gap-1.5">
                  {(["", "SENATE", "HOUSE"] as const).map((c) => (
                    <button
                      key={c || "all"}
                      onClick={() => setChamberFilter(c)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium text-left transition-colors ${
                        chamberFilter === c
                          ? "bg-[#30558C] text-white"
                          : "bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20"
                      }`}
                    >
                      {c === "" ? "All" : c === "SENATE" ? "Senate" : "House"}
                    </button>
                  ))}
                </div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Party</p>
                <div className="flex flex-col gap-1.5">
                  {(["", "Democratic", "Republican", "Independent"] as const).map((p) => (
                    <button
                      key={p || "all"}
                      onClick={() => setPartyFilter(p)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium text-left transition-colors ${
                        partyFilter === p
                          ? "bg-[#30558C] text-white"
                          : "bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20"
                      }`}
                    >
                      {p === "" ? "All" : p === "Democratic" ? "Democrat" : p}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {/* Toggle tab */}
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className="relative z-40 flex flex-col items-center justify-center gap-1 bg-white dark:bg-slate-800 border border-l-0 border-slate-200 dark:border-slate-700 shadow-md rounded-r-lg px-1.5 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 8h10M11 12h4" />
            </svg>
            <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>Filter</span>
            {(chamberFilter || partyFilter) && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#30558C]" />
            )}
          </button>
        </div>
      )}

      {/* Bill Modal */}
      {selectedBillModal && (
        <BillModal
          meta={selectedBillModal.meta}
          column={selectedBillModal.column}
          rows={rows}
          manualScoringMeta={manualScoringMeta}
          onClose={() => setSelectedBillModal(null)}
          onMemberClick={(member) => {
            setSelectedBillModal(null);
            setSelectedMember(member);
          }}
        />
      )}

      {/* Member Modal */}
      {selectedMember && (
        <MemberModal
          row={selectedMember}
          billCols={cols}
          metaByCol={metaByCol}
          categories={categories}
          manualScoringMeta={manualScoringMeta}
          onClose={() => setSelectedMember(null)}
          initialCategory="Iran"
        />
      )}
    </div>
  );
}
