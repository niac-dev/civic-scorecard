"use client";
import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { loadData } from "@/lib/loadCsv";
import type { Row, Meta } from "@/lib/types";
import clsx from "clsx";

function stateCodeOf(s: string | undefined): string {
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
  ];

  const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
    STATES.flatMap(({ code, name }) => [
      [name.toLowerCase(), code],
      [code.toLowerCase(), code],
    ])
  );

  const raw = (s ?? "").trim();
  if (!raw) return "";
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return NAME_TO_CODE[raw.toLowerCase()] ?? raw.toUpperCase();
}

function partyLabel(p?: string) {
  const raw = (p ?? "").trim();
  if (!raw) return "";
  const s = raw.toLowerCase();
  if (s.startsWith("democ")) return "Democrat";
  return raw
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function partyBadgeStyle(p?: string) {
  const label = partyLabel(p).toLowerCase();
  const base =
    label.startsWith("rep") ? "#EF4444" :
    label.startsWith("dem") ? "#3B82F6" :
    label.startsWith("ind") ? "#10B981" :
    "#94A3B8";
  return {
    color: base,
    backgroundColor: `${base}1A`,
    borderColor: `${base}66`,
  };
}

function chamberColor(ch?: string): string {
  switch (ch) {
    case "HOUSE":
      return "#b2c74a";
    case "SENATE":
      return "#857eab";
    default:
      return "#94A3B8";
  }
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

function inferChamber(meta: Meta | undefined, col: string): "HOUSE" | "SENATE" | "" {
  const bn = (meta?.bill_number || col || "").toString().trim();
  const explicit = (meta?.chamber || "").toString().toUpperCase().trim();
  // If chamber is explicitly set (even to empty), respect that
  if (explicit === "HOUSE" || explicit === "SENATE") return explicit as "HOUSE" | "SENATE";
  // If chamber is explicitly empty in metadata, don't infer from bill number
  if (meta && meta.chamber !== undefined && explicit === "") return "";
  // Otherwise infer from bill number prefix
  if (bn.startsWith("H")) return "HOUSE";
  if (bn.startsWith("S")) return "SENATE";
  return "";
}

function formatPositionLegislation(meta: Meta | undefined): string {
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

function GradeChip({ grade, isOverall }: { grade: string; isOverall?: boolean }) {
  const color = grade.startsWith("A") ? "#050a30" // dark navy blue
    : grade.startsWith("B") ? "#93c5fd" // light blue
    : grade.startsWith("C") ? "#b6dfcc" // mint green
    : grade.startsWith("D") ? "#D4B870" // tan/gold
    : "#C38B32"; // bronze/gold for F
  const opacity = isOverall ? "FF" : "E6"; // fully opaque for overall, 90% opaque (10% transparent) for others
  const textColor = grade.startsWith("A") ? "#ffffff" // white for A grades
    : grade.startsWith("B") ? "#4b5563" // dark grey for B grades
    : grade.startsWith("C") ? "#4b5563" // dark grey for C grades
    : "#4b5563"; // dark grey for D and F grades
  const border = isOverall ? "1px solid #000000" : "none"; // thin black border for overall grades
  return (
    <span
      className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold min-w-[2.75rem]"
      style={{ background: `${color}${opacity}`, color: textColor, border }}
    >
      {grade}
    </span>
  );
}

function VoteIcon({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true" role="img">
        <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true" role="img">
      <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
    </svg>
  );
}

export default function BillPage() {
  const params = useParams();
  const column = decodeURIComponent(params.column as string);

  const [meta, setMeta] = useState<Meta | null>(null);
  const [supporters, setSupporters] = useState<Row[]>([]);
  const [middleGroup, setMiddleGroup] = useState<Row[]>([]);
  const [opposers, setOpposers] = useState<Row[]>([]);
  const [selectedMember, setSelectedMember] = useState<Row | null>(null);
  const [sponsorMember, setSponsorMember] = useState<Row | null>(null);
  const [allColumns, setAllColumns] = useState<string[]>([]);
  const [metaByCol, setMetaByCol] = useState<Map<string, Meta>>(new Map());
  const [categories, setCategories] = useState<string[]>([]);
  const [firstExpanded, setFirstExpanded] = useState<boolean>(false);
  const [secondExpanded, setSecondExpanded] = useState<boolean>(false);
  const [thirdExpanded, setThirdExpanded] = useState<boolean>(false);
  const [partyFilter, setPartyFilter] = useState<string>("");
  const [chamberFilter, setChamberFilter] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { rows, columns, metaByCol, categories } = await loadData();
      setAllColumns(columns);
      setMetaByCol(metaByCol);
      setCategories(categories);
      const billMeta = metaByCol.get(column);

      if (!billMeta) {
        console.error("Bill metadata not found:", column);
        return;
      }

      setMeta(billMeta);

      // Find sponsor member from metadata
      let sponsorRow: Row | null = null;
      if (billMeta.sponsor_bioguide_id) {
        // Use bioguide_id for exact match
        sponsorRow = rows.find((row) => row.bioguide_id === billMeta.sponsor_bioguide_id) || null;
      } else if (billMeta.sponsor_name) {
        // Fallback to name matching
        sponsorRow = rows.find((row) =>
          String(row.full_name).toLowerCase().includes(String(billMeta.sponsor_name).toLowerCase()) ||
          String(billMeta.sponsor_name).toLowerCase().includes(String(row.full_name).toLowerCase())
        ) || null;
      } else if (billMeta.sponsor) {
        // Legacy support for old sponsor field
        const sponsorStr = String(billMeta.sponsor).trim();
        sponsorRow = rows.find((row) => row.bioguide_id === sponsorStr) || null;
        if (!sponsorRow) {
          sponsorRow = rows.find((row) =>
            String(row.full_name).toLowerCase().includes(sponsorStr.toLowerCase()) ||
            sponsorStr.toLowerCase().includes(String(row.full_name).toLowerCase())
          ) || null;
        }
      }
      setSponsorMember(sponsorRow);

      // Determine the chamber for this bill
      const billChamber = inferChamber(billMeta, column);

      // Split members into supporters (positive score) and opposers (0 or negative)
      // Only include members from the appropriate chamber
      // Exclude the sponsor from cosponsors list
      // Also exclude members who were not eligible to vote (null/undefined in CSV)
      const support: Row[] = [];
      const oppose: Row[] = [];

      rows.forEach((row) => {
        // Skip members from the wrong chamber
        if (billChamber && row.chamber !== billChamber) {
          return;
        }

        // Skip the sponsor (don't include in cosponsors)
        if (sponsorRow && row.bioguide_id === sponsorRow.bioguide_id) {
          return;
        }

        const rawVal = (row as Record<string, unknown>)[column];

        // Skip members who weren't eligible (null/undefined means not applicable)
        // This happens for manual actions like committee votes where only committee members are eligible
        if (rawVal === null || rawVal === undefined || rawVal === '') {
          return;
        }

        const val = Number(rawVal);

        // Also check if they were absent - if so, skip them from the lists
        const absentCol = `${column}_absent`;
        const wasAbsent = Number((row as Record<string, unknown>)[absentCol] ?? 0) === 1;
        if (wasAbsent) {
          return;
        }

        if (val > 0) {
          support.push(row);
        } else if (val === 0) {
          oppose.push(row);
        }
      });

      // Check if this is a manual action with a pair_key (for three-group display)
      const hasPairedGroups = billMeta.type === "MANUAL" && billMeta.pair_key && isTrue((billMeta as Record<string, unknown>).preferred);

      if (hasPairedGroups) {
        // Split members based on their actual score for this manual action
        const bestGroup: Row[] = []; // 4 points
        const middleGrp: Row[] = []; // 2 points
        const worstGroup: Row[] = []; // 0 points

        rows.forEach((row) => {
          // Skip members from the wrong chamber
          if (billChamber && row.chamber !== billChamber) {
            return;
          }

          // Skip the sponsor
          if (sponsorRow && row.bioguide_id === sponsorRow.bioguide_id) {
            return;
          }

          const rawVal = (row as Record<string, unknown>)[column];

          // Skip members who weren't eligible
          if (rawVal === null || rawVal === undefined || rawVal === '') {
            return;
          }

          const val = Number(rawVal);

          // Skip absent members
          const absentCol = `${column}_absent`;
          const wasAbsent = Number((row as Record<string, unknown>)[absentCol] ?? 0) === 1;
          if (wasAbsent) {
            return;
          }

          // Group by score
          if (val === 4) {
            bestGroup.push(row);
          } else if (val === 2) {
            middleGrp.push(row);
          } else if (val === 0) {
            worstGroup.push(row);
          }
        });

        setSupporters(bestGroup.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))));
        setMiddleGroup(middleGrp.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))));
        setOpposers(worstGroup.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))));
      } else {
        setSupporters(support.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))));
        setMiddleGroup([]);
        setOpposers(oppose.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))));
      }
    })();
  }, [column]);

  // Filter supporters, middle group, and opposers based on party and chamber filters (must be before early return)
  const filteredSupporters = useMemo(() => {
    let filtered = supporters;
    if (partyFilter) {
      filtered = filtered.filter(m => partyLabel(m.party) === partyFilter);
    }
    if (chamberFilter) {
      filtered = filtered.filter(m => m.chamber === chamberFilter);
    }
    return filtered;
  }, [supporters, partyFilter, chamberFilter]);

  const filteredMiddleGroup = useMemo(() => {
    let filtered = middleGroup;
    if (partyFilter) {
      filtered = filtered.filter(m => partyLabel(m.party) === partyFilter);
    }
    if (chamberFilter) {
      filtered = filtered.filter(m => m.chamber === chamberFilter);
    }
    return filtered;
  }, [middleGroup, partyFilter, chamberFilter]);

  const filteredOpposers = useMemo(() => {
    let filtered = opposers;
    if (partyFilter) {
      filtered = filtered.filter(m => partyLabel(m.party) === partyFilter);
    }
    if (chamberFilter) {
      filtered = filtered.filter(m => m.chamber === chamberFilter);
    }
    return filtered;
  }, [opposers, partyFilter, chamberFilter]);

  if (!meta) {
    return <div className="p-8">Loading...</div>;
  }

  // Determine section labels based on action type and position
  const actionType = (meta as { action_types?: string }).action_types || '';
  const isVote = actionType.includes('vote');
  const isCosponsor = actionType.includes('cosponsor');
  const position = (meta.position_to_score || '').toUpperCase();
  const isSupport = position === 'SUPPORT';

  // Check if this is a paired manual action
  const hasPairedGroups = meta.type === "MANUAL" && meta.pair_key && isTrue((meta as Record<string, unknown>).preferred);
  const pairedBillName = hasPairedGroups
    ? ((meta.pair_key || "").split("|").map(s => s.trim()).find(c => c !== column) || "")
    : "";
  const pairedBillMeta = pairedBillName ? metaByCol.get(pairedBillName) : undefined;

  // For paired manual actions, sections are already correctly grouped by score
  // For regular bills, swap arrays if we oppose the bill (since val>0 means they did the opposite)
  const firstSection = hasPairedGroups ? filteredSupporters : (isSupport ? filteredSupporters : filteredOpposers);
  const secondSection = hasPairedGroups ? filteredMiddleGroup : (isSupport ? filteredOpposers : filteredSupporters);
  const thirdSection = hasPairedGroups ? filteredOpposers : [];

  let firstLabel = '';
  let secondLabel = '';
  let thirdLabel = '';
  let firstIsGood = false; // Whether first section took the "good" action
  let secondIsGood = false;
  let thirdIsGood = false;

  if (hasPairedGroups) {
    // Three-group display for paired manual actions
    // Labels based on score and position
    if (isSupport) {
      // Position is SUPPORT
      // 4 points = Supported, 2 points = Somewhat supported, 0 points = Opposed
      firstLabel = 'Supported (4 points)';
      secondLabel = 'Somewhat Supported (2 points)';
      thirdLabel = 'Opposed (0 points)';
      firstIsGood = true;
      secondIsGood = true;
      thirdIsGood = false;
    } else {
      // Position is OPPOSE
      // 4 points = Opposed, 2 points = Somewhat opposed, 0 points = Supported
      firstLabel = 'Opposed (4 points)';
      secondLabel = 'Somewhat Opposed (2 points)';
      thirdLabel = 'Supported (0 points)';
      firstIsGood = true;
      secondIsGood = true;
      thirdIsGood = false;
    }
  } else if (isCosponsor) {
    firstLabel = 'Cosponsors';
    secondLabel = 'Has Not Cosponsored';
    firstIsGood = isSupport;  // Good if we support, bad if we oppose
    secondIsGood = !isSupport; // Good if we oppose, bad if we support
  } else if (isVote) {
    firstLabel = 'Voted in Favor';
    secondLabel = 'Voted Against';
    firstIsGood = isSupport;
    secondIsGood = !isSupport;
  } else {
    firstLabel = 'Supporters';
    secondLabel = 'Did Not Support';
    firstIsGood = isSupport;
    secondIsGood = !isSupport;
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        body {
          background: #F7F8FA !important;
        }
        :root.dark body {
          background: #0B1220 !important;
        }
      `}} />
      <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#0B1220] p-4">
        <div className="max-w-5xl mx-auto">
          <div className="card p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6 border-b border-[#E7ECF2] dark:border-white/10 pb-4">
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2 flex items-start gap-2">
                  {isSupport ? (
                    <svg viewBox="0 0 20 20" className="h-6 w-6 flex-shrink-0 mt-1" aria-hidden="true" role="img">
                      <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 20 20" className="h-6 w-6 flex-shrink-0 mt-1" aria-hidden="true" role="img">
                      <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                    </svg>
                  )}
                  <span>
                    {meta.display_name || meta.short_title || `${meta.bill_number || column}`}
                  </span>
                </h1>
                <div className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                  <span className="font-medium">NIAC Action Position:</span> {formatPositionLegislation(meta)}
                </div>
                {meta.points && (
                  <div className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                    <span className="font-medium">Points:</span> {Number(meta.points).toFixed(0)}
                  </div>
                )}
              </div>
              <button
                className="chip-outline text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                onClick={() => {
                  // Try to close the window (works if opened via window.open)
                  // If that fails, navigate back to home
                  window.close();
                  setTimeout(() => {
                    window.location.href = '/';
                  }, 100);
                }}
              >
                Close
              </button>
            </div>

          {/* Description */}
          {meta.description && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">
                Description
              </h2>
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {meta.description}
              </p>
            </div>
          )}

          {/* Analysis */}
          {meta.analysis && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">
                Analysis
              </h2>
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {meta.analysis}
              </p>
            </div>
          )}

          {/* Categories */}
          {meta.categories && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">
                Categories
              </h2>
              <div className="flex flex-wrap gap-2">
                {meta.categories.split(";").map((c) => c.trim()).filter(Boolean).map((c) => (
                  <span key={c} className="chip-xs">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Sponsor */}
          {sponsorMember && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">
                Sponsor
              </h2>
              <div
                className="flex items-center gap-3 p-3 rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition"
                onClick={() => setSelectedMember(sponsorMember)}
              >
                {sponsorMember.photo_url ? (
                  <img
                    src={String(sponsorMember.photo_url)}
                    alt=""
                    className="h-16 w-16 rounded-full object-cover bg-slate-200 dark:bg-white/10"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-slate-300 dark:bg-white/10" />
                )}
                <div className="flex-1">
                  <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {sponsorMember.full_name}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2 mt-1">
                    <span
                      className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold"
                      style={{
                        color: "#64748b",
                        backgroundColor: `${chamberColor(sponsorMember.chamber)}20`,
                      }}
                    >
                      {sponsorMember.chamber === "HOUSE"
                        ? "House"
                        : sponsorMember.chamber === "SENATE"
                        ? "Senate"
                        : sponsorMember.chamber || ""}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded-md text-[11px] font-medium border"
                      style={partyBadgeStyle(sponsorMember.party)}
                    >
                      {partyLabel(sponsorMember.party)}
                    </span>
                    <span>{stateCodeOf(sponsorMember.state)}{sponsorMember.district ? `-${sponsorMember.district}` : ""}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          {!sponsorMember && (meta.sponsor_name || meta.sponsor) && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">
                Sponsor
              </h2>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                {meta.sponsor_name || meta.sponsor}
              </div>
            </div>
          )}

          {/* Filters */}
          {(() => {
            const billChamber = inferChamber(meta, column);
            const isMultiChamber = billChamber === "";
            const hasFilters = isMultiChamber || supporters.length > 0 || opposers.length > 0;

            if (!hasFilters) return null;

            return (
              <div className="mb-6 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Filter:</span>
                <select
                  className="select !text-xs !h-8 !px-2"
                  value={partyFilter}
                  onChange={(e) => setPartyFilter(e.target.value)}
                >
                  <option value="">All Parties</option>
                  <option value="Democrat">Democrat</option>
                  <option value="Republican">Republican</option>
                  <option value="Independent">Independent</option>
                </select>
                {isMultiChamber && (
                  <select
                    className="select !text-xs !h-8 !px-2"
                    value={chamberFilter}
                    onChange={(e) => setChamberFilter(e.target.value)}
                  >
                    <option value="">Both Chambers</option>
                    <option value="HOUSE">House</option>
                    <option value="SENATE">Senate</option>
                  </select>
                )}
                {(partyFilter || chamberFilter) && (
                  <button
                    onClick={() => {
                      setPartyFilter("");
                      setChamberFilter("");
                    }}
                    className="chip-outline text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 !text-xs !px-2 !h-8"
                  >
                    Clear
                  </button>
                )}
              </div>
            );
          })()}

          {/* First Section - Affirmative Action */}
          <div className="mb-6">
            <h2
              className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50 transition-colors"
              onClick={() => setFirstExpanded(!firstExpanded)}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden="true" role="img">
                {firstIsGood ? (
                  <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                ) : (
                  <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                )}
              </svg>
              {firstLabel} ({firstSection.length})
              <svg
                viewBox="0 0 20 20"
                className={clsx("h-4 w-4 ml-auto transition-transform", firstExpanded && "rotate-180")}
                aria-hidden="true"
                role="img"
              >
                <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </h2>
            {firstExpanded && (
              <>
                {(() => {
                  // Determine the chamber for this bill
                  const billChamber = inferChamber(meta, column);
                  const isMultiChamber = billChamber === "";

                  if (isMultiChamber) {
                    // Group by chamber for multi-chamber bills
                    const housemembers = firstSection.filter(m => m.chamber === "HOUSE");
                    const senatemembers = firstSection.filter(m => m.chamber === "SENATE");

                    return (
                      <div className="space-y-4">
                        {housemembers.length > 0 && (
                          <div>
                            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 px-2">
                              House ({housemembers.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {housemembers.map((member) => (
                                <MemberCard key={member.bioguide_id} member={member} onClick={() => setSelectedMember(member)} />
                              ))}
                            </div>
                          </div>
                        )}
                        {senatemembers.length > 0 && (
                          <div>
                            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 px-2">
                              Senate ({senatemembers.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {senatemembers.map((member) => (
                                <MemberCard key={member.bioguide_id} member={member} onClick={() => setSelectedMember(member)} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Single chamber bill - show all members in one grid
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {firstSection.map((member) => (
                        <MemberCard key={member.bioguide_id} member={member} onClick={() => setSelectedMember(member)} />
                      ))}
                      {firstSection.length === 0 && (
                        <div className="col-span-full text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                          None found
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* Second Section - No Affirmative Action */}
          <div className="mb-6">
            <h2
              className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50 transition-colors"
              onClick={() => setSecondExpanded(!secondExpanded)}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden="true" role="img">
                {secondIsGood ? (
                  <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                ) : (
                  <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                )}
              </svg>
              {secondLabel} ({secondSection.length})
              <svg
                viewBox="0 0 20 20"
                className={clsx("h-4 w-4 ml-auto transition-transform", secondExpanded && "rotate-180")}
                aria-hidden="true"
                role="img"
              >
                <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </h2>
            {secondExpanded && (
              <>
                {(() => {
                  // Determine the chamber for this bill
                  const billChamber = inferChamber(meta, column);
                  const isMultiChamber = billChamber === "";

                  if (isMultiChamber) {
                    // Group by chamber for multi-chamber bills
                    const housemembers = secondSection.filter(m => m.chamber === "HOUSE");
                    const senatemembers = secondSection.filter(m => m.chamber === "SENATE");

                    return (
                      <div className="space-y-4">
                        {housemembers.length > 0 && (
                          <div>
                            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 px-2">
                              House ({housemembers.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {housemembers.map((member) => (
                                <MemberCard key={member.bioguide_id} member={member} onClick={() => setSelectedMember(member)} />
                              ))}
                            </div>
                          </div>
                        )}
                        {senatemembers.length > 0 && (
                          <div>
                            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 px-2">
                              Senate ({senatemembers.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {senatemembers.map((member) => (
                                <MemberCard key={member.bioguide_id} member={member} onClick={() => setSelectedMember(member)} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Single chamber bill - show all members in one grid
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {secondSection.map((member) => (
                        <MemberCard key={member.bioguide_id} member={member} onClick={() => setSelectedMember(member)} />
                      ))}
                      {secondSection.length === 0 && (
                        <div className="col-span-full text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                          None found
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* Third Section - Only shown for paired manual actions */}
          {hasPairedGroups && (
            <div>
              <h2
                className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50 transition-colors"
                onClick={() => setThirdExpanded(!thirdExpanded)}
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden="true" role="img">
                  {thirdIsGood ? (
                    <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                  ) : (
                    <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                  )}
                </svg>
                {thirdLabel} ({thirdSection.length})
                <svg
                  viewBox="0 0 20 20"
                  className={clsx("h-4 w-4 ml-auto transition-transform", thirdExpanded && "rotate-180")}
                  aria-hidden="true"
                  role="img"
                >
                  <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </h2>
              {thirdExpanded && (
                <>
                  {(() => {
                    // Determine the chamber for this bill
                    const billChamber = inferChamber(meta, column);
                    const isMultiChamber = billChamber === "";

                    if (isMultiChamber) {
                      // Group by chamber for multi-chamber bills
                      const housemembers = thirdSection.filter(m => m.chamber === "HOUSE");
                      const senatemembers = thirdSection.filter(m => m.chamber === "SENATE");

                      return (
                        <div className="space-y-4">
                          {housemembers.length > 0 && (
                            <div>
                              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 px-2">
                                House ({housemembers.length})
                              </h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {housemembers.map((member) => (
                                  <MemberCard key={member.bioguide_id} member={member} onClick={() => setSelectedMember(member)} />
                                ))}
                              </div>
                            </div>
                          )}
                          {senatemembers.length > 0 && (
                            <div>
                              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 px-2">
                                Senate ({senatemembers.length})
                              </h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {senatemembers.map((member) => (
                                  <MemberCard key={member.bioguide_id} member={member} onClick={() => setSelectedMember(member)} />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Single chamber bill - show all members in one grid
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {thirdSection.map((member) => (
                          <MemberCard key={member.bioguide_id} member={member} onClick={() => setSelectedMember(member)} />
                        ))}
                        {thirdSection.length === 0 && (
                          <div className="col-span-full text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                            None found
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Member Popup Modal */}
      {selectedMember && (
        <MemberModal
          row={selectedMember}
          billCols={allColumns}
          metaByCol={metaByCol}
          categories={categories}
          onClose={() => setSelectedMember(null)}
        />
      )}
      </div>
    </>
  );
}

// Reusable Member Card Component
function MemberCard({ member, onClick }: { member: Row; onClick: () => void }) {
  return (
    <div
      className="flex items-center gap-2 p-2 rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition"
      onClick={onClick}
    >
      {member.photo_url ? (
        <img
          src={String(member.photo_url)}
          alt=""
          className="h-8 w-8 rounded-full object-cover bg-slate-200 dark:bg-white/10"
        />
      ) : (
        <div className="h-8 w-8 rounded-full bg-slate-300 dark:bg-white/10" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
          {member.full_name}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          <span
            className="px-1 py-0.5 rounded text-[10px] font-medium"
            style={partyBadgeStyle(member.party)}
          >
            {partyLabel(member.party)}
          </span>
          {" "}{stateCodeOf(member.state)}
        </div>
      </div>
    </div>
  );
}

// Full-featured Member Modal Component
function MemberModal({
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
  const [districtOfficesExpanded, setDistrictOfficesExpanded] = useState<boolean>(false);
  const [committeesExpanded, setCommitteesExpanded] = useState<boolean>(false);
  const [votesActionsExpanded, setVotesActionsExpanded] = useState<boolean>(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    // Save original overflow style
    const originalOverflow = document.body.style.overflow;
    // Prevent scrolling on mount
    document.body.style.overflow = 'hidden';
    // Re-enable scrolling on unmount
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Build list of items: each bill or manual action gets an entry
  const allItems = useMemo(() => {
    return billCols
      .map((c) => {
        const meta = metaByCol.get(c);
        const inferredChamber = inferChamber(meta, c);
        const notApplicable = inferredChamber && inferredChamber !== row.chamber;
        const val = Number((row as Record<string, unknown>)[c] ?? 0);

        // Check if member was absent for this vote
        const absentCol = `${c}_absent`;
        const wasAbsent = Number((row as Record<string, unknown>)[absentCol] ?? 0) === 1;

        const categories = (meta?.categories || "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean);

        // Check for preferred pair waiver
        const isPreferred = meta ? isTrue((meta as Record<string, unknown>).preferred) : false;
        let waiver = false;
        if (!notApplicable && meta?.pair_key && !isPreferred && !(val > 0)) {
          for (const other of billCols) {
            if (other === c) continue;
            const m2 = metaByCol.get(other);
            if (m2?.pair_key === meta.pair_key && isTrue((m2 as Record<string, unknown>).preferred)) {
              const v2 = Number((row as Record<string, unknown>)[other] ?? 0);
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
      .filter((it) => it.meta && !it.notApplicable);
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
      <div className="fixed inset-4 md:inset-10 z-[110] flex items-center justify-center">
        <div className="w-full max-w-5xl rounded-2xl border border-[#E7ECF2] dark:border-white/10 bg-white dark:bg-[#0B1220] shadow-xl overflow-hidden flex flex-col max-h-full">
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
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{row.full_name}</div>
                <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 mt-1">
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
          </div>

          {/* Issue Grades - Sticky */}
          <div className="p-6 pb-3 border-b border-[#E7ECF2] dark:border-white/10 sticky top-[180px] bg-white dark:bg-[#0B1220] z-10">
            <div className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200">Issue Grades</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Overall Grade card */}
                <div className="rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Overall Grade</div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs tabular text-slate-700 dark:text-slate-300">
                      {Number(row.Total || 0).toFixed(0)} / {Number(row.Max_Possible || 0).toFixed(0)}
                    </div>
                    <GradeChip grade={String(row.Grade || "N/A")} isOverall={true} />
                  </div>
                </div>

                {categories.map((category) => {
                  const fieldSuffix = category.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
                  const totalField = `Total_${fieldSuffix}` as keyof Row;
                  const maxField = `Max_Possible_${fieldSuffix}` as keyof Row;
                  const gradeField = `Grade_${fieldSuffix}` as keyof Row;

                  return (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
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

            {/* Votes & Actions */}
            <div className="mb-6">
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
                <div className="divide-y divide-[#E7ECF2] dark:divide-white/10">
                  {items.length === 0 && (
                    <div className="py-4 text-sm text-slate-500 dark:text-slate-400">
                      {selectedCategory ? `No votes/actions for ${selectedCategory}` : "No votes/actions found"}
                    </div>
                  )}
                  {items.map((it) => (
                    <div
                      key={it.col}
                      className="py-2 flex items-start gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 -mx-2 px-2 rounded transition"
                      onClick={() => window.open(`/bill/${encodeURIComponent(it.col)}`, '_blank')}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-medium leading-5 text-slate-700 dark:text-slate-200">
                          {it.meta?.display_name || it.meta?.short_title || it.meta?.bill_number || it.col}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 font-light">
                          <span className="font-medium">NIAC Action Position:</span> {formatPositionLegislation(it.meta)}
                        </div>
                        {it.meta?.points && (
                          <div className="text-xs text-slate-600 dark:text-slate-300 font-light">
                            <span className="font-medium">Points:</span> {Number(it.val).toFixed(0)}/{Number(it.meta.points).toFixed(0)}
                          </div>
                        )}
                        {it.meta && (it.meta as { action_types?: string }).action_types && (
                          <div className="text-xs text-slate-600 dark:text-slate-300 font-light flex items-center gap-1.5">
                            <div className="mt-0.5">
                              {it.wasAbsent ? (
                                <span className="text-lg leading-none text-slate-400 dark:text-slate-500">—</span>
                              ) : it.waiver ? (
                                <span className="text-lg leading-none text-slate-400 dark:text-slate-500">—</span>
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
                                  // If we support: points means they cosponsored
                                  // If we oppose: points means they did NOT cosponsor
                                  const didCosponsor = isSupport ? gotPoints : !gotPoints;
                                  return didCosponsor ? "Cosponsored" : "Has Not Cosponsored";
                                } else if (isVote) {
                                  // If we support: points means they voted in favor
                                  // If we oppose: points means they voted against
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
                          <div className="text-xs mt-1 text-slate-700 dark:text-slate-200">{it.meta.notes}</div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {it.categories.map((c) => (
                            <span key={c} className="chip-xs">{c}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
