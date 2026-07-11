"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { loadData, loadManualScoringMeta } from "@/lib/loadCsv";
import type { Row, Meta } from "@/lib/types";
import {
  consolidatedWarPowersVotes,
  warPowersVoteState,
  warPowersSummary,
  type WarPowersVote,
} from "@/lib/warPowers";
import {
  partyBadgeStyle,
  partyLabel,
  partyCaucus,
  stateCodeOf,
  getPhotoUrl,
  isNonVotingDelegate,
} from "@/lib/utils";
import { MemberModal } from "@/components/MemberModal";
import { BillModal } from "@/components/BillModal";
import { VoteIcon } from "@/components/GradeChip";

// Consolidated headline for a member's card. A single yes vote on any of the
// consolidated war-powers resolutions counts as supporting an end to the war.
// Members who never had a votable opportunity (non-voting delegates, or members
// not yet in office for any of these votes) get a neutral line rather than being
// labeled as having voted against.
function getWarPowersHeadline(member: Row, votedYes: boolean, hasData: boolean): React.ReactNode {
  const nameParts = (member.full_name || "").split(",");
  const lastName = nameParts[0]?.trim() || "";
  const title = member.chamber === "SENATE" ? "Sen." : "Rep.";
  const name = `${title} ${lastName}`;

  if (!hasData) {
    return <>{name} has not cast a vote on ending the war on Iran.</>;
  }

  return votedYes ? (
    <>{name} voted <strong>to end</strong> the war on Iran.</>
  ) : (
    <>{name} voted <strong>against</strong> ending the war on Iran.</>
  );
}

// Small circular dash icon (member did not / could not cast a yes/no vote),
// styled to match the check/X circles from VoteIcon.
function DashIcon({ className = "h-4 w-4 flex-shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" role="img">
      <circle cx="10" cy="10" r="8" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2.5" />
      <rect x="5.5" y="8.75" width="9" height="2.5" rx="1.25" fill="#CBD5E1" />
    </svg>
  );
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
  heightClassName = "h-[90px]",
}: {
  members: { isSupport: boolean; party: string }[];
  label: string;
  numRows: number;
  innerRadius: number;
  rowSpacing: number;
  dotRadius: number;
  heightClassName?: string;
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

  // Sort seats left → right; assign members in order (support first, then oppose).
  // Shape encodes vote (circle = support, X = oppose); color encodes party.
  const dotsBySeatIdx = useMemo(() => {
    const order = seats.map((s, i) => ({ i, x: s.x })).sort((a, b) => a.x - b.x);
    const dots = new Array(seats.length).fill(null).map(() => ({ shape: "x" as "circle" | "x", color: "#94A3B8" }));
    order.forEach(({ i }, idx) => {
      const member = members[idx];
      if (!member) return;
      const party = (member.party || "").toLowerCase();
      const color = party.startsWith("rep") ? "#DC2626" : party.startsWith("dem") ? "#2563EB" : "#94A3B8";
      dots[i] = { shape: member.isSupport ? "circle" : "x", color };
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
      <div className={`w-full ${heightClassName}`}>
        <svg viewBox={`0 ${topClip} ${W} ${H - topClip}`} className="w-full h-full block">
          {seats.map((seat, i) => {
            const dot = dotsBySeatIdx[i];
            const r = dotRadius - 0.5;
            if (dot.shape === "x") {
              const d = r * 0.65;
              return (
                <g key={i}>
                  <line x1={seat.x - d} y1={seat.y - d} x2={seat.x + d} y2={seat.y + d} stroke={dot.color} strokeWidth={r * 0.6} strokeLinecap="round" />
                  <line x1={seat.x + d} y1={seat.y - d} x2={seat.x - d} y2={seat.y + d} stroke={dot.color} strokeWidth={r * 0.6} strokeLinecap="round" />
                </g>
              );
            }
            return (
              <circle key={i} cx={seat.x} cy={seat.y} r={r} fill="none" stroke={dot.color} strokeWidth={r * 0.5} />
            );
          })}
        </svg>
      </div>
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
  const [chamberFilter, setChamberFilter] = useState<("HOUSE" | "SENATE")[]>([]);
  const [partyFilter, setPartyFilter] = useState<("Democrat" | "Republican")[]>([]);
  const [statusFilter, setStatusFilter] = useState<"support" | "oppose" | "flips" | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Ref for scrolling to results
  const resultsRef = useRef<HTMLDivElement>(null);

  // Filter expand state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterBarOpen, setFilterBarOpen] = useState(false);

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

  // Consolidated war-powers votes per chamber (driven by the war_powers_consolidated
  // meta flag), sorted chronologically. The card icon, headline, per-vote row,
  // hemicycle dots and whip counts all derive from this so they stay consistent.
  const wpVotes = useMemo(
    () => ({
      HOUSE: consolidatedWarPowersVotes(metaByCol, "HOUSE"),
      SENATE: consolidatedWarPowersVotes(metaByCol, "SENATE"),
    }),
    [metaByCol]
  );

  const votesForMember = (m: Row): WarPowersVote[] =>
    m.chamber === "SENATE" ? wpVotes.SENATE : wpVotes.HOUSE;

  // Filter members
  const filtered = useMemo(() => {
    // Exclude members no longer in office from display
    let result = rows.filter(r => String((r as Record<string, unknown>).in_office ?? '1') !== '0');

    // Chamber filter
    if (chamberFilter.length > 0) {
      result = result.filter((r) => chamberFilter.includes(r.chamber as "HOUSE" | "SENATE"));
    }

    // Party filter
    if (partyFilter.length > 0) {
      result = result.filter((r) => partyFilter.includes(partyCaucus(String(r.party || ''), String(r.bioguide_id || '')) as "Democrat" | "Republican"));
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

    // Status filter: only include members who actually cast a vote on at least
    // one consolidated resolution (hasData). Excludes non-voting delegates and
    // members who weren't in office for any of these votes.
    if (statusFilter === "support" || statusFilter === "oppose") {
      result = result.filter((r) => {
        const { votedYes, hasData } = warPowersSummary(r, r.chamber === "SENATE" ? wpVotes.SENATE : wpVotes.HOUSE);
        if (!hasData) return false;
        return statusFilter === "support" ? votedYes : !votedYes;
      });
    }

    if (statusFilter === "flips") {
      result = result.filter((r) => {
        const votes = r.chamber === "SENATE" ? wpVotes.SENATE : wpVotes.HOUSE;
        let hasYes = false, hasNo = false;
        for (const v of votes) {
          const st = warPowersVoteState(r, v.col);
          if (st === "yes") hasYes = true;
          if (st === "no") hasNo = true;
        }
        return hasYes && hasNo;
      });
    }

    // Sort by chamber (Senate first), then name
    return result.sort((a, b) => {
      if (a.chamber !== b.chamber) {
        return a.chamber === "SENATE" ? -1 : 1;
      }
      return (a.full_name || "").localeCompare(b.full_name || "");
    });
  }, [rows, chamberFilter, partyFilter, searchTab, searchQuery, myLawmakers, statusFilter, wpVotes]);

  // Sorted member lists for hemicycle dots, left → right.
  // A member is plotted if they cast at least one yes/no across the consolidated
  // resolutions; support = voted yes on any of them. Dots are ordered so the
  // party-consistent members sit at the ends (Democrats who voted to end the war
  // on the left, Republicans who voted against on the right) and the party
  // crossovers are clustered in the center: Democrats who voted against and
  // Republicans who voted for. Independents are grouped with the party they
  // caucus with (so e.g. Sanders/King count as Democrats / blue).
  const hemicycleMembers = useMemo(() => {
    const fromVotes = (chamberRows: Row[], votes: WarPowersVote[]) => {
      const demMatch: { isSupport: boolean; party: string }[] = []; // Dem, voted yes
      const demCross: { isSupport: boolean; party: string }[] = []; // Dem, voted no (crossover)
      const repCross: { isSupport: boolean; party: string }[] = []; // Rep, voted yes (crossover)
      const repMatch: { isSupport: boolean; party: string }[] = []; // Rep, voted no
      chamberRows.forEach((m) => {
        if (isNonVotingDelegate(m)) return;
        const { votedYes, hasData } = warPowersSummary(m, votes);
        if (!hasData) return; // never in office to cast any of these votes
        const isRepublican = partyCaucus(String(m.party || ''), String(m.bioguide_id || ''))
          .toLowerCase()
          .startsWith('rep');
        const party = isRepublican ? "Republican" : "Democratic";
        const entry = { isSupport: votedYes, party };
        if (!isRepublican && votedYes) demMatch.push(entry);
        else if (!isRepublican && !votedYes) demCross.push(entry);
        else if (isRepublican && votedYes) repCross.push(entry);
        else repMatch.push(entry);
      });
      // Ends = party-consistent; center = crossovers (demCross + repCross).
      return [...demMatch, ...demCross, ...repCross, ...repMatch];
    };

    // Only plot members currently in office, so a member who voted and then left
    // (e.g. a resigned/replaced senator) isn't counted alongside their successor.
    const inOffice = rows.filter(r => String((r as Record<string, unknown>).in_office ?? '1') !== '0');
    return {
      SENATE: fromVotes(inOffice.filter(r => r.chamber === "SENATE"), wpVotes.SENATE),
      HOUSE:  fromVotes(inOffice.filter(r => r.chamber === "HOUSE"), wpVotes.HOUSE),
    };
  }, [rows, wpVotes]);

  // Partisan headcount per chamber (independents grouped by the party they caucus
  // with). Counts all currently-seated voting members, independent of whether they
  // have a recorded war-powers vote yet — this is the chamber's party breakdown,
  // not the support/oppose tally.
  const chamberPartyCounts = useMemo(() => {
    const count = (chamber: "SENATE" | "HOUSE") => {
      let dem = 0, rep = 0;
      rows.forEach((m) => {
        if (m.chamber !== chamber) return;
        if (String((m as Record<string, unknown>).in_office ?? '1') === '0') return;
        if (isNonVotingDelegate(m)) return;
        const isRepublican = partyCaucus(String(m.party || ''), String(m.bioguide_id || ''))
          .toLowerCase()
          .startsWith('rep');
        if (isRepublican) rep++; else dem++;
      });
      return { dem, rep };
    };
    return { SENATE: count("SENATE"), HOUSE: count("HOUSE") };
  }, [rows]);

  // Handle search
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setStatusFilter(null);
    setChamberFilter([]);

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
    chamberFilter.length > 0 ||
    partyFilter.length > 0;

  const resultsTitle = useMemo(() => {
    if (!hasResults) return null;
    const count = filtered.length;
    const partyPart =
      partyFilter.length === 1
        ? partyFilter[0] === "Democrat"
          ? "Democratic "
          : "Republican "
        : "";
    const memberType =
      chamberFilter.length === 1
        ? chamberFilter[0] === "SENATE"
          ? count === 1 ? "Senator" : "Senators"
          : count === 1 ? "Representative" : "Representatives"
        : count === 1 ? "Lawmaker" : "Lawmakers";
    const positionPart =
      statusFilter === "support"
        ? " in favor of ending the war on Iran"
        : statusFilter === "oppose"
        ? " opposed to ending the war on Iran"
        : statusFilter === "flips"
        ? " who flipped their vote on war powers"
        : "";
    return `${count} ${partyPart}${memberType}${positionPart}`;
  }, [hasResults, filtered, partyFilter, chamberFilter, statusFilter]);

  const toggleChamber = (c: "SENATE" | "HOUSE") =>
    setChamberFilter(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const toggleParty = (p: "Democrat" | "Republican") =>
    setPartyFilter(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const handleChamberClick = (chamber: "SENATE" | "HOUSE") => {
    setChamberFilter([chamber]);
    setStatusFilter(null);
    setSearchQuery("");
    setMyLawmakers([]);
    localStorage.removeItem("niac-address");
    localStorage.removeItem("niac-lawmakers");
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const handleQuickFilter = (party: "Democrat" | "Republican", status: "support" | "oppose") => {
    if (partyFilter.includes(party) && partyFilter.length === 1 && statusFilter === status) {
      setPartyFilter([]);
      setStatusFilter(null);
    } else {
      setPartyFilter([party]);
      setStatusFilter(status);
      setChamberFilter([]);
      setSearchQuery("");
      setMyLawmakers([]);
      localStorage.removeItem("niac-address");
      localStorage.removeItem("niac-lawmakers");
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  };

  const handleFlapClick = (chamber: "SENATE" | "HOUSE", status: "support" | "oppose") => {
    if (chamberFilter.includes(chamber) && chamberFilter.length === 1 && statusFilter === status) {
      setStatusFilter(null);
      setChamberFilter([]);
    } else {
      setChamberFilter([chamber]);
      setStatusFilter(status);
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
                  onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); setStatusFilter(null); setChamberFilter([]); }}
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
                              setChamberFilter([]);
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
            <div className="cursor-pointer w-full" onClick={() => handleChamberClick("SENATE")}>
            <HemicycleChart
              members={hemicycleMembers.SENATE}
              label=""
              numRows={4}
              innerRadius={32}
              rowSpacing={16}
              dotRadius={3.5}
              heightClassName="h-[90px] md:h-[130px] lg:h-[160px]"
            />
            </div>
            <div className="flex justify-between w-full px-1 -mt-1 text-[10px] font-semibold">
              <span style={{ color: "#2563EB" }}>Democrats: {chamberPartyCounts.SENATE.dem}</span>
              <span style={{ color: "#DC2626" }}>Republicans: {chamberPartyCounts.SENATE.rep}</span>
            </div>
            <div className="flex gap-1.5 justify-center">
              <ScoreFlap count={hemicycleMembers.SENATE.filter(m => m.isSupport).length} color="green" label="Support" small active={chamberFilter.includes("SENATE") && chamberFilter.length === 1 && statusFilter === "support"} onClick={() => handleFlapClick("SENATE", "support")} />
              <ScoreFlap count={hemicycleMembers.SENATE.filter(m => !m.isSupport).length} color="red" label="Oppose" small active={chamberFilter.includes("SENATE") && chamberFilter.length === 1 && statusFilter === "oppose"} onClick={() => handleFlapClick("SENATE", "oppose")} />
            </div>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 text-center mt-0.5">Across {wpVotes.SENATE.length} war powers votes</p>
          </div>

          {/* House */}
          <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer hover:text-[#30558C] transition-colors" onClick={() => handleChamberClick("HOUSE")}>House</h3>
            <div className="cursor-pointer w-full" onClick={() => handleChamberClick("HOUSE")}>
            <HemicycleChart
              members={hemicycleMembers.HOUSE}
              label=""
              numRows={9}
              innerRadius={16}
              rowSpacing={10}
              dotRadius={2}
              heightClassName="h-[90px] md:h-[130px] lg:h-[160px]"
            />
            </div>
            <div className="flex justify-between w-full px-1 -mt-1 text-[10px] font-semibold">
              <span style={{ color: "#2563EB" }}>Democrats: {chamberPartyCounts.HOUSE.dem}</span>
              <span style={{ color: "#DC2626" }}>Republicans: {chamberPartyCounts.HOUSE.rep}</span>
            </div>
            <div className="flex gap-1.5 justify-center">
              <ScoreFlap count={hemicycleMembers.HOUSE.filter(m => m.isSupport).length} color="green" label="Support" small active={chamberFilter.includes("HOUSE") && chamberFilter.length === 1 && statusFilter === "support"} onClick={() => handleFlapClick("HOUSE", "support")} />
              <ScoreFlap count={hemicycleMembers.HOUSE.filter(m => !m.isSupport).length} color="red" label="Oppose" small active={chamberFilter.includes("HOUSE") && chamberFilter.length === 1 && statusFilter === "oppose"} onClick={() => handleFlapClick("HOUSE", "oppose")} />
            </div>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 text-center mt-0.5">Across {wpVotes.HOUSE.length} war powers votes</p>
          </div>

        </div>
      </div>

      {/* Filter bar */}
      <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        {/* Toggle row — always visible */}
        <button
          onClick={() => setFilterBarOpen((o) => !o)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 8h10M11 12h4" />
          </svg>
          Filters
          {(chamberFilter.length > 0 || partyFilter.length > 0 || statusFilter !== null) && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#30558C]" />
          )}
          <svg className={`w-3 h-3 transition-transform ${filterBarOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Expandable content */}
        {filterBarOpen && (
          <div className="px-4 pb-3 max-w-2xl mx-auto flex flex-col gap-2">
            {/* Row 1: Chamber / Party / Position (wide) + mobile Filters button */}
            <div className="flex items-center gap-4 justify-center flex-wrap">
              <div className="hidden md:flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Chamber</span>
                {(["SENATE", "HOUSE"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => toggleChamber(c)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      chamberFilter.includes(c)
                        ? "bg-[#30558C] text-white"
                        : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20"
                    }`}
                  >
                    {c === "SENATE" ? "Senate" : "House"}
                  </button>
                ))}
                {chamberFilter.length > 0 && (
                  <button onClick={() => setChamberFilter([])} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors text-sm leading-none">✕</button>
                )}
              </div>
              <div className="hidden md:block w-px h-4 bg-slate-200 dark:bg-slate-700 flex-shrink-0" />

              <div className="hidden md:flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Party</span>
                {([["Democrat", "D"], ["Republican", "R"]] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => toggleParty(val)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      partyFilter.includes(val)
                        ? "bg-[#30558C] text-white"
                        : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {partyFilter.length > 0 && (
                  <button onClick={() => setPartyFilter([])} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors text-sm leading-none">✕</button>
                )}
              </div>
              <div className="hidden md:block w-px h-4 bg-slate-200 dark:bg-slate-700 flex-shrink-0" />

              <div className="hidden md:flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Position</span>
                {([["support", "Support"], ["oppose", "Oppose"]] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setStatusFilter(statusFilter === val ? null : val)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      statusFilter === val
                        ? "bg-[#30558C] text-white"
                        : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {(statusFilter === "support" || statusFilter === "oppose") && (
                  <button onClick={() => setStatusFilter(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors text-sm leading-none">✕</button>
                )}
              </div>

              <button
                onClick={() => setFiltersOpen((o) => !o)}
                className={`md:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  filtersOpen || chamberFilter.length > 0 || partyFilter.length > 0
                    ? "bg-[#30558C] text-white"
                    : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20"
                }`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 8h10M11 12h4" />
                </svg>
                Filters
              </button>
            </div>

            {/* Row 2: Quick Filters */}
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Quick Filters</span>
              {([
                { party: "Democrat" as const,   status: "oppose" as const,  label: "Dem Opponents" },
                { party: "Republican" as const, status: "support" as const, label: "Rep Supporters" },
              ]).map(({ party, status, label }) => (
                <button
                  key={label}
                  onClick={() => handleQuickFilter(party, status)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    partyFilter.includes(party) && partyFilter.length === 1 && statusFilter === status
                      ? "bg-[#30558C] text-white"
                      : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20"
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => {
                  if (statusFilter === "flips") {
                    setStatusFilter(null);
                  } else {
                    setStatusFilter("flips");
                    setPartyFilter([]);
                    setChamberFilter([]);
                    setSearchQuery("");
                    setMyLawmakers([]);
                    localStorage.removeItem("niac-address");
                    localStorage.removeItem("niac-lawmakers");
                    setTimeout(() => { resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
                  }
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === "flips"
                    ? "bg-[#30558C] text-white"
                    : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20"
                }`}
              >
                Flips
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Results Section */}
      <div ref={resultsRef} className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Filters toggle + expandable panel */}


        {/* Results Grid */}
        {hasResults && (
          <div className="space-y-3">
            {resultsTitle && (
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400 px-1">
                {resultsTitle}
              </p>
            )}
            {filtered.map((member) => {
              const votes = votesForMember(member);
              const { votedYes, hasData } = warPowersSummary(member, votes);
              const legText = getWarPowersHeadline(member, votedYes, hasData);

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
                      {hasData ? (
                        <VoteIcon ok={votedYes} size="medium-large" />
                      ) : (
                        <DashIcon className="h-12 w-12 flex-shrink-0" />
                      )}
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

                      {/* Per-resolution vote row: date + check / X / dash */}
                      {votes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1.5">
                          {votes.map((v) => {
                            const st = warPowersVoteState(member, v.col);
                            const tip = `${v.fullDate || v.col}${
                              st === "yes" ? " — voted yes" : st === "no" ? " — voted no" : " — did not vote"
                            }`;
                            return (
                              <button
                                key={v.col}
                                type="button"
                                title={tip}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const m = metaByCol.get(v.col);
                                  if (m) setSelectedBillModal({ meta: m, column: v.col });
                                }}
                                className="flex flex-col items-center cursor-pointer hover:opacity-70 transition-opacity"
                              >
                                <span className="text-[9px] leading-none text-slate-400 dark:text-slate-500 mb-1 tabular-nums">
                                  {v.shortDate || "—"}
                                </span>
                                {st === "none" ? <DashIcon /> : <VoteIcon ok={st === "yes"} size="tiny" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
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

      {/* Filter panel — mobile only, opened via "More Filters" chip */}
      {filtersOpen && (
        <div className="md:hidden">
          <div className="fixed inset-0 z-30" onClick={() => setFiltersOpen(false)} />
          <div className="fixed left-4 top-1/2 -translate-y-1/2 z-40 bg-white dark:bg-slate-800 shadow-xl rounded-xl border border-slate-200 dark:border-slate-700 p-4 w-48 space-y-4">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Chamber</p>
            <div className="flex flex-col gap-1.5">
              {(["SENATE", "HOUSE"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => toggleChamber(c)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium text-left transition-colors ${
                    chamberFilter.includes(c)
                      ? "bg-[#30558C] text-white"
                      : "bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20"
                  }`}
                >
                  {c === "SENATE" ? "Senate" : "House"}
                </button>
              ))}
              {chamberFilter.length > 0 && (
                <button onClick={() => setChamberFilter([])} className="px-3 py-1.5 rounded-lg text-sm font-medium text-left bg-slate-100 dark:bg-white/10 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors">Clear</button>
              )}
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Party</p>
            <div className="flex flex-col gap-1.5">
              {(["Democrat", "Republican"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => toggleParty(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium text-left transition-colors ${
                    partyFilter.includes(p)
                      ? "bg-[#30558C] text-white"
                      : "bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20"
                  }`}
                >
                  {p}
                </button>
              ))}
              {partyFilter.length > 0 && (
                <button onClick={() => setPartyFilter([])} className="px-3 py-1.5 rounded-lg text-sm font-medium text-left bg-slate-100 dark:bg-white/10 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors">Clear</button>
              )}
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Position</p>
            <div className="flex flex-col gap-1.5">
              {([["", "All"], ["support", "Support"], ["oppose", "Oppose"]] as const).map(([val, label]) => (
                <button
                  key={val || "all"}
                  onClick={() => setStatusFilter(val === "" ? null : val)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium text-left transition-colors ${
                    (val === "" ? statusFilter === null : statusFilter === val)
                      ? "bg-[#30558C] text-white"
                      : "bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
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
