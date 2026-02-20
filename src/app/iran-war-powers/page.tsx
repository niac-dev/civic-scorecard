"use client";

import { useState, useEffect, useMemo } from "react";
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

type PositionStatus = "positive" | "alternative" | "negative";

interface Position {
  status: PositionStatus;
  text: string;
}

function getPosition(member: Row): Position {
  // Extract first name and last name from "Last, First" format
  const nameParts = member.full_name?.split(",") || [];
  const lastName = nameParts[0]?.trim() || "";
  const firstName = nameParts[1]?.trim().split(" ")[0] || "";

  // Custom text for lead sponsors
  const leadSponsorsPreferred = ["Massie", "Khanna"];
  const leadSponsorsAlternative = ["Smith", "Meeks"];
  const leadSponsorSenate = ["Kaine"];

  if (member.chamber === "HOUSE") {
    // Check if lead sponsor of preferred bill (Massie-Khanna)
    if (leadSponsorsPreferred.includes(lastName)) {
      return {
        status: "positive",
        text: `Rep. ${firstName} is the lead sponsor of the Iran War Powers Resolution!`,
      };
    }
    // Check if lead sponsor of alternative bill (Smith-Meeks)
    if (leadSponsorsAlternative.includes(lastName)) {
      return {
        status: "alternative",
        text: `Rep. ${firstName} is the lead sponsor of the Smith-Meeks War Powers Resolution, which is positive but includes an exemption for U.S. military action in defense of Israel.`,
      };
    }

    const preferredCol = IRAN_WAR_POWERS_CONFIG.house.preferred.column;
    const altCol = IRAN_WAR_POWERS_CONFIG.house.alternative.column;

    const preferredValue = member[preferredCol];
    const altValue = member[altCol];

    if (preferredValue != null && Number(preferredValue) > 0) {
      return {
        status: "positive",
        text: IRAN_WAR_POWERS_CONFIG.house.preferred.positive.replace("{name}", firstName),
      };
    }
    if (altValue != null && Number(altValue) > 0) {
      return {
        status: "alternative",
        text: IRAN_WAR_POWERS_CONFIG.house.alternative.positive.replace("{name}", firstName),
      };
    }
    return {
      status: "negative",
      text: IRAN_WAR_POWERS_CONFIG.house.negative.replace("{name}", firstName),
    };
  } else {
    // Senate
    // Check if lead sponsor (Kaine)
    if (leadSponsorSenate.includes(lastName)) {
      return {
        status: "positive",
        text: `Sen. ${firstName} is the lead sponsor of the Iran War Powers Resolution!`,
      };
    }

    const voteCol = IRAN_WAR_POWERS_CONFIG.senate.column;
    const voteValue = member[voteCol];

    if (voteValue != null && Number(voteValue) > 0) {
      return {
        status: "positive",
        text: IRAN_WAR_POWERS_CONFIG.senate.positive.replace("{name}", firstName),
      };
    }
    return {
      status: "negative",
      text: IRAN_WAR_POWERS_CONFIG.senate.negative.replace("{name}", firstName),
    };
  }
}

function PositionIcon({ status }: { status: PositionStatus }) {
  if (status === "positive") {
    return (
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
        <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (status === "alternative") {
    return (
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
      <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
  );
}

export default function IranWarPowersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [metaByCol, setMetaByCol] = useState<Map<string, Meta>>(new Map());
  const [categories, setCategories] = useState<string[]>([]);
  const [manualScoringMeta, setManualScoringMeta] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  // Search state
  const [searchTab, setSearchTab] = useState<"name" | "location">("name");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [myLawmakers, setMyLawmakers] = useState<string[]>([]);
  const [chamberFilter, setChamberFilter] = useState<"" | "HOUSE" | "SENATE">("");
  const [showDropdown, setShowDropdown] = useState(false);

  // Modal state
  const [selectedMember, setSelectedMember] = useState<Row | null>(null);

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

    // Sort by chamber (Senate first), then name
    return result.sort((a, b) => {
      if (a.chamber !== b.chamber) {
        return a.chamber === "SENATE" ? -1 : 1;
      }
      return (a.full_name || "").localeCompare(b.full_name || "");
    });
  }, [rows, chamberFilter, searchTab, searchQuery, myLawmakers]);

  // Handle search
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

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

  const hasResults = searchTab === "name" ? searchQuery.trim().length > 0 : myLawmakers.length > 0;

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
      <div className="fixed top-0 left-0 right-0 bg-[#002b49] dark:bg-slate-900 py-2 px-0 md:px-4 border-b border-[#001a2e] dark:border-slate-900 z-50">
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
      <div className="relative bg-black pt-14 md:pt-16">
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
            Where do <span className="text-yellow-300">YOUR</span> lawmakers stand on going to war with Iran?
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
                  onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Enter lawmaker's name..."
                  className="w-full px-4 py-3.5 rounded-lg border-0 bg-white/95 backdrop-blur-sm text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white focus:bg-white shadow-lg text-base"
                />
                {/* Name Autocomplete Dropdown */}
                {showDropdown && searchQuery.trim().length >= 2 && (() => {
                  const query = searchQuery.toLowerCase();
                  const matches = rows
                    .filter(r => (r.full_name || "").toLowerCase().includes(query))
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
                            }}
                            className="w-full px-4 py-2.5 text-left hover:bg-slate-100 flex items-center gap-2 border-b border-slate-100 last:border-0"
                          >
                            <span className="text-slate-800 font-medium">{String(member.full_name || "")}</span>
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

      {/* Results Section */}
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Chamber Filter */}
        {hasResults && (
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setChamberFilter("")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                chamberFilter === ""
                  ? "bg-[#30558C] text-white"
                  : "bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setChamberFilter("SENATE")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                chamberFilter === "SENATE"
                  ? "bg-[#30558C] text-white"
                  : "bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20"
              }`}
            >
              Senate
            </button>
            <button
              onClick={() => setChamberFilter("HOUSE")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                chamberFilter === "HOUSE"
                  ? "bg-[#30558C] text-white"
                  : "bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20"
              }`}
            >
              House
            </button>
          </div>
        )}

        {/* Results Count */}
        {hasResults && (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
            {filtered.length} {filtered.length === 1 ? "lawmaker" : "lawmakers"} found
          </p>
        )}

        {/* Results Grid */}
        {hasResults && (
          <div className="space-y-3">
            {filtered.map((member) => {
              const position = getPosition(member);
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
                          className="w-14 h-14 rounded-full object-cover bg-slate-200 dark:bg-white/10"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (!target.dataset.fallback && member.photo_url) {
                              target.dataset.fallback = "1";
                              target.src = String(member.photo_url);
                            }
                          }}
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-slate-300 dark:bg-white/10" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-900 dark:text-white">
                          {member.full_name}
                        </h3>
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

                      {/* Position */}
                      <div className="mt-2 flex items-start gap-2">
                        <PositionIcon status={position.status} />
                        <p
                          className={`text-sm ${
                            position.status === "positive"
                              ? "text-emerald-700 dark:text-emerald-400"
                              : position.status === "alternative"
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-red-700 dark:text-red-400"
                          }`}
                        >
                          {position.text}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state - only show when no results and no search active */}
        {!hasResults && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              Search for Your Lawmakers
            </h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Enter a name or address above to see where your lawmakers stand on preventing unauthorized war with Iran.
            </p>
          </div>
        )}

        {/* Take Action Button */}
        <div className="pt-6 pb-4">
          <a
            href="https://niacouncil.org/campaign/demand-congress-oppose-war-with-iran/"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-4 px-6 bg-yellow-400 hover:bg-yellow-300 text-slate-900 text-center text-lg font-bold rounded-xl shadow-lg transition-colors"
          >
            ACT NOW: Urge Your Lawmakers to Support the War Powers Resolution!
          </a>
        </div>
      </div>

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
