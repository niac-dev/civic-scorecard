"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import type { Meta, Row } from "@/lib/types";
import { extractVoteInfo, inferChamber, stateCodeOf, partyBadgeStyle, partyLabel, getPhotoUrl } from "@/lib/utils";
import clsx from "clsx";
import { BillMiniMap } from "@/components/BillMiniMap";
import { VoteIcon, GradeChip } from "@/components/GradeChip";
import { isGradeIncomplete } from "@/lib/utils";

function formatPositionLegislation(meta: Meta | undefined): string {
  const position = (meta?.position_to_score || '').toUpperCase();
  const actionType = (meta as { action_types?: string })?.action_types || '';
  const isCosponsor = actionType.includes('cosponsor');
  const isVote = actionType.includes('vote');
  const isSupport = position === 'SUPPORT';

  if (isCosponsor) {
    return isSupport ? 'Support Cosponsorship' : 'Oppose Cosponsorship';
  } else if (isVote) {
    return isSupport ? 'Vote in Favor' : 'Vote Against';
  } else {
    return isSupport ? 'Support' : 'Oppose';
  }
}

// Convert "Last, First" to "First Last"
function formatNameFirstLast(name: string | unknown): string {
  const nameStr = String(name || '');
  if (nameStr.includes(', ')) {
    const [last, first] = nameStr.split(', ');
    return `${first} ${last}`;
  }
  return nameStr;
}

// Chamber color helper
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

// State code to full name mapping
const STATE_NAMES: Record<string, string> = {
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
  AS: "American Samoa", GU: "Guam", MP: "Northern Mariana Islands", PR: "Puerto Rico", VI: "Virgin Islands",
};

// Format state and district for display
function formatStateDistrict(member: Row): string {
  const stateCode = String(member.state || '');
  const stateName = STATE_NAMES[stateCode] || stateCode;

  if (member.chamber === "HOUSE") {
    if (member.district) {
      return `${stateName} - ${member.district}`;
    } else {
      return `${stateName} - At Large`;
    }
  }
  return stateName;
}

interface BillModalProps {
  meta: Meta;
  column: string;
  rows: Row[];
  manualScoringMeta?: Map<string, string>;
  onClose: () => void;
  onBack?: () => void;
  onMemberClick?: (member: Row, category?: string) => void;
  initialStateFilter?: string;
}

// Helper function to calculate partisan breakdown
function getPartisanBreakdown(members: Row[]): { rCount: number; dCount: number } {
  const rCount = members.filter(m => String(m.party || '').toLowerCase().startsWith('rep')).length;
  const dCount = members.filter(m => String(m.party || '').toLowerCase().startsWith('dem')).length;
  const iCount = members.filter(m => String(m.party || '').toLowerCase().startsWith('ind')).length;
  // Group independents with democrats
  return { rCount, dCount: dCount + iCount };
}

// Component to render partisan pills
function PartisanPills({ members }: { members: Row[] }) {
  const { rCount, dCount } = getPartisanBreakdown(members);

  return (
    <span className="inline-flex items-center gap-1.5 ml-2">
      <span className="text-slate-400 dark:text-slate-500">|</span>
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#C5312E] text-white">
        R: {rCount}
      </span>
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#315CA8] text-white">
        D: {dCount}
      </span>
    </span>
  );
}

export function BillModal({ meta, column, rows, manualScoringMeta, onClose, onBack, onMemberClick, initialStateFilter }: BillModalProps) {
  const position = (meta?.position_to_score || '').toUpperCase();
  const isSupport = position === 'SUPPORT';
  const [firstExpanded, setFirstExpanded] = useState(false);
  const [secondExpanded, setSecondExpanded] = useState(false);
  const [thirdExpanded, setThirdExpanded] = useState(false);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [partyFilter, setPartyFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>(initialStateFilter || "");
  const [chamberFilter, setChamberFilter] = useState<string>("");
  const accordionSectionRef = useRef<HTMLDivElement>(null);

  // When clicking on map with state filter, expand all accordion sections and scroll to them
  useEffect(() => {
    if (initialStateFilter) {
      setFilterExpanded(true);
      setFirstExpanded(true);
      setSecondExpanded(true);
      setThirdExpanded(true);

      // Scroll to accordion section after a brief delay to let accordions expand
      setTimeout(() => {
        if (accordionSectionRef.current) {
          accordionSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [initialStateFilter]);

  // Find sponsor member
  const sponsorMember = useMemo(() => {
    if (meta.sponsor_bioguide_id) {
      return rows.find((row) => row.bioguide_id === meta.sponsor_bioguide_id) || null;
    } else if (meta.sponsor_name) {
      return rows.find((row) =>
        String(row.full_name).toLowerCase().includes(String(meta.sponsor_name).toLowerCase()) ||
        String(meta.sponsor_name).toLowerCase().includes(String(row.full_name).toLowerCase())
      ) || null;
    } else if (meta.sponsor) {
      const sponsorStr = String(meta.sponsor).trim();
      const byId = rows.find((row) => row.bioguide_id === sponsorStr);
      if (byId) return byId;
      return rows.find((row) =>
        String(row.full_name).toLowerCase().includes(sponsorStr.toLowerCase()) ||
        sponsorStr.toLowerCase().includes(String(row.full_name).toLowerCase())
      ) || null;
    }
    return null;
  }, [meta, rows]);

  // Calculate member lists
  const { firstSection, secondSection, thirdSection, firstLabel, secondLabel, thirdLabel, firstIsGood, secondIsGood, thirdIsGood } = useMemo<{
    firstSection: Row[];
    secondSection: Row[];
    thirdSection: Row[];
    firstLabel: string;
    secondLabel: string;
    thirdLabel: string;
    firstIsGood: boolean;
    secondIsGood: boolean | 'partial';
    thirdIsGood: boolean;
  }>(() => {
    const actionType = (meta as { action_types?: string })?.action_types || '';
    const isCosponsor = actionType.includes('cosponsor');
    const isVote = actionType.includes('vote');
    const billChamber = inferChamber(meta, column);
    const fullPoints = Number(meta?.points ?? 0);

    // Check if this bill was voted on in both chambers
    const voteTallies = (meta?.vote_tallies || "").toLowerCase();
    const hasHouseVote = voteTallies.includes("house");
    const hasSenateVote = voteTallies.includes("senate");
    const votedInBothChambers = hasHouseVote && hasSenateVote;

    // Check if this is a manual scoring item with custom labels
    const billLabel = meta.display_name || meta.short_title || column;
    const hasManualScoring = manualScoringMeta && Array.from(manualScoringMeta.keys()).some(key => key.startsWith(billLabel + '|'));

    if (hasManualScoring && manualScoringMeta) {
      // Group members by their exact score values using manual scoring labels
      const scoreGroups = new Map<number, { rows: Row[]; label: string }>();

      rows.forEach((row) => {
        // Filter by chamber only if not voted in both chambers
        if (!votedInBothChambers && billChamber && row.chamber !== billChamber) return;
        const val = (row as Record<string, unknown>)[column];
        if (val === null || val === undefined || val === '') return;

        const score = Number(val);
        if (!scoreGroups.has(score)) {
          const key = `${billLabel}|${score}`;
          const label = manualScoringMeta.get(key) || `Score: ${score}`;
          scoreGroups.set(score, { rows: [], label });
        }
        scoreGroups.get(score)!.rows.push(row);
      });

      // Sort by score descending (highest score = best action)
      const sortedGroups = Array.from(scoreGroups.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([score, data]) => ({ score, ...data }));

      const first = sortedGroups[0] || { rows: [], label: 'Best action', score: fullPoints };
      const second = sortedGroups[1] || { rows: [], label: 'Middle action', score: 0 };
      const third = sortedGroups[2] || { rows: [], label: 'Worst action', score: 0 };

      return {
        firstSection: first.rows,
        secondSection: second.rows,
        thirdSection: third.rows,
        firstLabel: first.label,
        secondLabel: second.label,
        thirdLabel: third.label,
        firstIsGood: true,  // Highest score is good
        secondIsGood: sortedGroups.length === 3 && second.score > 0 ? 'partial' : false, // Middle is partial if 3 groups
        thirdIsGood: false, // Lowest score is bad
      };
    }

    const support: Row[] = [];
    const oppose: Row[] = [];
    const present: Row[] = [];

    // Find sponsor to include at the top of the cosponsors list
    const sponsorBioguideId = sponsorMember?.bioguide_id || null;

    rows.forEach((row) => {
      // Filter by chamber only if not voted in both chambers
      if (!votedInBothChambers && billChamber && row.chamber !== billChamber) {
        return;
      }

      // Skip sponsor for cosponsor bills (we'll add them at the top separately)
      if (isCosponsor && sponsorBioguideId && row.bioguide_id === sponsorBioguideId) {
        return;
      }

      // Check if member was eligible (has data for this column)
      const val = (row as Record<string, unknown>)[column];
      if (val === null || val === undefined || val === '') {
        return;
      }

      if (isCosponsor) {
        const cosponsorCol = `${column}_cosponsor`;
        const didCosponsor = Number((row as Record<string, unknown>)[cosponsorCol] ?? 0) === 1;
        if (didCosponsor) {
          support.push(row);
        } else {
          oppose.push(row);
        }
      } else if (isVote) {
        const points = Number(val);
        if (points === -1) {
          present.push(row);
        } else if (points > 0) {
          support.push(row);
        } else {
          oppose.push(row);
        }
      } else {
        const points = Number(val);
        if (points === fullPoints) {
          support.push(row);
        } else {
          oppose.push(row);
        }
      }
    });

    // For cosponsor bills, add sponsor at the top of the support list
    if (isCosponsor && sponsorMember) {
      support.unshift(sponsorMember);
    }

    let fLabel = 'Support';
    let sLabel = 'Oppose';
    let tLabel = '';
    let fIsGood = isSupport;
    let sIsGood = !isSupport;
    const tIsGood = false;

    if (isCosponsor) {
      fLabel = 'Cosponsors';
      sLabel = 'Has not cosponsored';
      fIsGood = isSupport;
      sIsGood = !isSupport;
    } else if (isVote) {
      tLabel = 'Voted Present';
      if (isSupport) {
        fLabel = 'Voted in favor';
        sLabel = 'Voted against';
        fIsGood = true;
        sIsGood = false;
      } else {
        fLabel = 'Voted against';
        sLabel = 'Voted in favor';
        fIsGood = true;
        sIsGood = false;
      }
    }

    // Sort members alphabetically by last name (or full name)
    const sortByName = (a: Row, b: Row) => {
      const nameA = String(a.full_name || '').toLowerCase();
      const nameB = String(b.full_name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    };

    return {
      firstSection: support.sort(sortByName),
      secondSection: oppose.sort(sortByName),
      thirdSection: present.sort(sortByName),
      firstLabel: fLabel,
      secondLabel: sLabel,
      thirdLabel: tLabel,
      firstIsGood: fIsGood,
      secondIsGood: sIsGood,
      thirdIsGood: tIsGood,
    };
  }, [meta, column, rows, isSupport, sponsorMember, manualScoringMeta]);

  // Get unique states from all sections for filter dropdown
  const uniqueStates = useMemo(() => {
    const statesSet = new Set<string>();
    [...firstSection, ...secondSection, ...thirdSection].forEach(member => {
      if (member.state) statesSet.add(stateCodeOf(member.state));
    });
    return Array.from(statesSet).sort();
  }, [firstSection, secondSection, thirdSection]);

  // Check if chamber filter should be shown (only for bicameral bills)
  const showChamberFilter = useMemo(() => {
    const allMembers = [...firstSection, ...secondSection, ...thirdSection];
    const chambers = new Set(allMembers.map(m => m.chamber).filter(Boolean));
    return chambers.size > 1;
  }, [firstSection, secondSection, thirdSection]);

  // Filter sections based on party, state, and chamber
  const filteredFirstSection = useMemo(() => {
    let filtered = firstSection;
    if (partyFilter) {
      filtered = filtered.filter(m => partyLabel(m.party) === partyFilter);
    }
    if (stateFilter) {
      filtered = filtered.filter(m => stateCodeOf(m.state) === stateFilter);
    }
    if (chamberFilter) {
      filtered = filtered.filter(m => m.chamber === chamberFilter);
    }
    return filtered;
  }, [firstSection, partyFilter, stateFilter, chamberFilter]);

  const filteredSecondSection = useMemo(() => {
    let filtered = secondSection;
    if (partyFilter) {
      filtered = filtered.filter(m => partyLabel(m.party) === partyFilter);
    }
    if (stateFilter) {
      filtered = filtered.filter(m => stateCodeOf(m.state) === stateFilter);
    }
    if (chamberFilter) {
      filtered = filtered.filter(m => m.chamber === chamberFilter);
    }
    return filtered;
  }, [secondSection, partyFilter, stateFilter, chamberFilter]);

  const filteredThirdSection = useMemo(() => {
    let filtered = thirdSection;
    if (partyFilter) {
      filtered = filtered.filter(m => partyLabel(m.party) === partyFilter);
    }
    if (stateFilter) {
      filtered = filtered.filter(m => stateCodeOf(m.state) === stateFilter);
    }
    if (chamberFilter) {
      filtered = filtered.filter(m => m.chamber === chamberFilter);
    }
    return filtered;
  }, [thirdSection, partyFilter, stateFilter, chamberFilter]);

  // Lock body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 dark:bg-black/70 z-[100]"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="fixed inset-2 md:inset-10 z-[110] flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-3xl rounded-2xl border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-slate-800 shadow-xl overflow-auto max-h-full">
          {/* Header - sticky (just bill name and navigation) */}
          <div className="p-4 border-b border-[#E7ECF2] dark:border-slate-900 sticky top-0 bg-white dark:bg-slate-800 z-10">
            {/* Navigation buttons row - mobile only */}
            <div className="flex items-end justify-end mb-2 md:hidden">
              <div className="flex gap-1 flex-shrink-0">
                {onBack && (
                  <button
                    className="p-1.5 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                    onClick={onBack}
                    title="Back"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                )}
                <button
                  className="p-1.5 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                  onClick={() => window.open(`/bill/${encodeURIComponent(column)}`, "_blank")}
                  title="Open full page"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
                <button
                  className="p-1.5 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                  onClick={onClose}
                  title="Close"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Title and navigation - desktop layout */}
            <div className="flex items-center justify-between">
              {/* Title */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <VoteIcon ok={isSupport} size="medium" />
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {meta.display_name || column}
                  </h1>
                </div>
              </div>

              {/* Navigation buttons - desktop only */}
              <div className="hidden md:flex gap-2 flex-shrink-0 ml-4">
                {onBack && (
                  <button
                    className="p-1.5 md:p-2 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                    onClick={onBack}
                    title="Back"
                  >
                    <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                )}
                <button
                  className="p-1.5 md:p-2 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                  onClick={() => window.open(`/bill/${encodeURIComponent(column)}`, "_blank")}
                  title="Open full page"
                >
                  <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
                <button
                  className="p-1.5 md:p-2 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                  onClick={onClose}
                  title="Close"
                >
                  <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Bill metadata */}
            <div className="space-y-2">
              {/* Sponsor */}
              {(sponsorMember || meta.sponsor_name || meta.sponsor) && (
                <div className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <span className="font-bold">Sponsor:</span>
                  {sponsorMember ? (
                    <button
                      className="text-left py-1 px-2 rounded bg-slate-50 dark:bg-slate-900/50 flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                      onClick={() => {
                        const firstCategory = meta.categories?.split(';')[0]?.trim();
                        onMemberClick?.(sponsorMember, firstCategory);
                      }}
                    >
                      {/* Photo */}
                      {sponsorMember.bioguide_id ? (
                        <img
                          src={getPhotoUrl(String(sponsorMember.bioguide_id), '225x275')}
                          alt=""
                          loading="lazy"
                          className="h-8 w-8 rounded-full object-cover bg-slate-200 dark:bg-white/10 flex-shrink-0"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (!target.dataset.fallback && sponsorMember.photo_url) {
                              target.dataset.fallback = '1';
                              target.src = String(sponsorMember.photo_url);
                            }
                          }}
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-slate-300 dark:bg-white/10 flex-shrink-0" />
                      )}
                      {/* Info */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                          {formatNameFirstLast(sponsorMember.full_name)}
                        </span>
                        <span
                          className="px-1 py-0.5 rounded-md text-[9px] font-semibold"
                          style={{
                            color: '#64748b',
                            backgroundColor: `${chamberColor(sponsorMember.chamber)}20`,
                          }}
                        >
                          {sponsorMember.chamber === "HOUSE" ? "House" : sponsorMember.chamber === "SENATE" ? "Senate" : (sponsorMember.chamber || "")}
                        </span>
                        <span
                          className="px-1 py-0.5 rounded-md text-[9px] font-medium border"
                          style={partyBadgeStyle(sponsorMember.party)}
                        >
                          {partyLabel(sponsorMember.party)}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          {formatStateDistrict(sponsorMember)}
                        </span>
                      </div>
                    </button>
                  ) : (
                    <span>{meta.sponsor_name || meta.sponsor}</span>
                  )}
                </div>
              )}
              {/* Date Introduced / Status */}
              {(() => {
                const voteInfo = extractVoteInfo(meta);
                return (
                  <>
                    {voteInfo.voteResult ? (
                      <div className="text-sm text-slate-600 dark:text-slate-300">
                        <span className="font-bold">Status:</span> {voteInfo.voteResult}
                      </div>
                    ) : voteInfo.dateIntroduced ? (
                      <div className="text-sm text-slate-600 dark:text-slate-300">
                        <span className="font-bold">Introduced:</span> {voteInfo.dateIntroduced}
                      </div>
                    ) : null}
                  </>
                );
              })()}
              {/* Category */}
              {meta.categories && (
                <div className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <span className="font-bold">Category:</span>
                  <div className="flex flex-wrap gap-1">
                    {meta.categories.split(";").map((c) => c.trim()).filter(Boolean).map((c) => (
                      <span key={c} className="chip-xs">{c}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* NIAC Action Position */}
              <div className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-bold">NIAC Action Position:</span> {formatPositionLegislation(meta)}
              </div>
            </div>

            {/* Description */}
            {meta.analysis && (
              <div>
                <h2 className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">
                  Description
                </h2>
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {meta.analysis}
                </p>
              </div>
            )}

            {/* Links */}
            {(meta.congress_url || meta.learn_more_link) && (
              <div>
                <h2 className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">
                  Links
                </h2>
                <div className="flex flex-col gap-2">
                  {meta.congress_url && (
                    <a
                      href={meta.congress_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#4B8CFB] hover:text-[#3a7de8] underline flex items-center gap-1"
                    >
                      Congress.gov
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                  {meta.learn_more_link && (
                    <a
                      href={meta.learn_more_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#4B8CFB] hover:text-[#3a7de8] underline flex items-center gap-1"
                    >
                      Learn more
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-[#E7ECF2] dark:border-slate-900"></div>

            {/* Member Lists - Accordion Sections */}
            {(firstSection.length > 0 || secondSection.length > 0) && (
              <div className="space-y-4">
                {/* Filters - Bookmark Style */}
                <div className="relative">
                  {/* Filter Bookmark Tab */}
                  <button
                    className="absolute -left-6 -top-4 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-1 rounded-r-md text-xs hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                    onClick={() => setFilterExpanded(!filterExpanded)}
                    title="Filter"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      className="h-3 w-3"
                      aria-hidden="true"
                      role="img"
                      fill="currentColor"
                    >
                      <path d="M3 3h14a1 1 0 011 1v1.5l-5.5 6v4l-3 1.5v-5.5l-5.5-6V4a1 1 0 011-1z" />
                    </svg>
                  </button>

                  {/* Filter Panel - Slides out */}
                  {filterExpanded && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg mb-4 border border-slate-200 dark:border-slate-700">
                      <div className="flex flex-wrap items-center gap-2">
                        {showChamberFilter && (
                          <select
                            className="select !text-xs !h-8 !px-2"
                            value={chamberFilter}
                            onChange={(e) => setChamberFilter(e.target.value)}
                          >
                            <option value="">All Chambers</option>
                            <option value="HOUSE">House</option>
                            <option value="SENATE">Senate</option>
                          </select>
                        )}
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
                        <select
                          className="select !text-xs !h-8 !px-2"
                          value={stateFilter}
                          onChange={(e) => setStateFilter(e.target.value)}
                        >
                          <option value="">All States</option>
                          {uniqueStates.map(state => (
                            <option key={state} value={state}>{state}</option>
                          ))}
                        </select>
                        {(partyFilter || stateFilter || chamberFilter) && (
                          <button
                            onClick={() => {
                              setPartyFilter("");
                              setStateFilter("");
                              setChamberFilter("");
                            }}
                            className="chip-outline text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 !text-xs !px-2 !h-8"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* First Section - Cosponsored / Voted in favor */}
                <div ref={accordionSectionRef}>
                  <h2
                    className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50 transition-colors"
                    onClick={() => setFirstExpanded(!firstExpanded)}
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden="true" role="img">
                      {firstIsGood ? (
                        <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                      ) : (
                        <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                      )}
                    </svg>
                    <span className="flex items-center flex-wrap flex-1 min-w-0">
                      <span className="whitespace-nowrap">{firstLabel}: {filteredFirstSection.length}{(partyFilter || stateFilter || chamberFilter) && ` of ${firstSection.length}`}</span>
                      <PartisanPills members={filteredFirstSection} />
                    </span>
                    <svg
                      viewBox="0 0 20 20"
                      className={clsx("h-4 w-4 transition-transform flex-shrink-0", firstExpanded && "rotate-180")}
                      aria-hidden="true"
                      role="img"
                    >
                      <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </h2>
                  {firstExpanded && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
                      {filteredFirstSection.map((member) => {
                        const isSponsor = sponsorMember && member.bioguide_id === sponsorMember.bioguide_id;
                        return (
                          <div
                            key={member.bioguide_id}
                            className={clsx(
                              "text-xs py-2 px-2 rounded bg-slate-50 dark:bg-slate-900/50 flex items-center gap-2",
                              onMemberClick && "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900"
                            )}
                            onClick={() => {
                              const firstCategory = meta.categories?.split(';')[0]?.trim();
                              onMemberClick?.(member, firstCategory);
                            }}
                          >
                            {/* Photo */}
                            {member.bioguide_id ? (
                              <img
                                src={getPhotoUrl(String(member.bioguide_id), '225x275')}
                                alt=""
                                loading="lazy"
                                className="h-10 w-10 rounded-full object-cover bg-slate-200 dark:bg-white/10 flex-shrink-0"
                                onError={(e) => {
                                  const target = e.currentTarget;
                                  if (!target.dataset.fallback && member.photo_url) {
                                    target.dataset.fallback = '1';
                                    target.src = String(member.photo_url);
                                  }
                                }}
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-slate-300 dark:bg-white/10 flex-shrink-0" />
                            )}
                            {/* Info */}
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate text-[13px]">
                                {formatNameFirstLast(member.full_name)}{isSponsor && '*'}
                              </span>
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                <span
                                  className="px-1 py-0.5 rounded-md text-[9px] font-semibold"
                                  style={{
                                    color: '#64748b',
                                    backgroundColor: `${chamberColor(member.chamber)}20`,
                                  }}
                                >
                                  {member.chamber === "HOUSE" ? "House" : member.chamber === "SENATE" ? "Senate" : (member.chamber || "")}
                                </span>
                                <span
                                  className="px-1 py-0.5 rounded-md text-[9px] font-medium border"
                                  style={partyBadgeStyle(member.party)}
                                >
                                  {partyLabel(member.party)}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {formatStateDistrict(member)}
                                </span>
                              </div>
                            </div>
                            {/* Grade chip */}
                            <GradeChip grade={isGradeIncomplete(member.bioguide_id) ? "Inc" : String(member.Grade || "N/A")} scale={0.6} />
                          </div>
                        );
                      })}
                      {filteredFirstSection.length === 0 && (
                        <div className="col-span-full text-center py-4 text-xs text-slate-500 dark:text-slate-400">
                          {(partyFilter || stateFilter || chamberFilter) ? "No matches for current filters" : "None found"}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Second Section - Has not cosponsored / Voted against */}
                <div>
                  <h2
                    className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50 transition-colors"
                    onClick={() => setSecondExpanded(!secondExpanded)}
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden="true" role="img">
                      {secondIsGood === 'partial' ? (
                        // Check with minus - partial good (yellow/orange)
                        <>
                          <path d="M7.5 13.0l-2.5-2.5 -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#F59E0B" />
                          <rect x="4" y="14" width="12" height="2" fill="#F59E0B" />
                        </>
                      ) : secondIsGood ? (
                        <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                      ) : (
                        <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                      )}
                    </svg>
                    <span className="flex items-center flex-wrap flex-1 min-w-0">
                      <span className="whitespace-nowrap">{secondLabel}: {filteredSecondSection.length}{(partyFilter || stateFilter || chamberFilter) && ` of ${secondSection.length}`}</span>
                      <PartisanPills members={filteredSecondSection} />
                    </span>
                    <svg
                      viewBox="0 0 20 20"
                      className={clsx("h-4 w-4 transition-transform flex-shrink-0", secondExpanded && "rotate-180")}
                      aria-hidden="true"
                      role="img"
                    >
                      <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </h2>
                  {secondExpanded && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
                      {filteredSecondSection.map((member) => (
                        <div
                          key={member.bioguide_id}
                          className={clsx(
                            "text-xs py-2 px-2 rounded bg-slate-50 dark:bg-slate-900/50 flex items-center gap-2",
                            onMemberClick && "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900"
                          )}
                          onClick={() => {
                            const firstCategory = meta.categories?.split(';')[0]?.trim();
                            onMemberClick?.(member, firstCategory);
                          }}
                        >
                          {/* Photo */}
                          {member.bioguide_id ? (
                            <img
                              src={getPhotoUrl(String(member.bioguide_id), '225x275')}
                              alt=""
                              loading="lazy"
                              className="h-10 w-10 rounded-full object-cover bg-slate-200 dark:bg-white/10 flex-shrink-0"
                              onError={(e) => {
                                const target = e.currentTarget;
                                if (!target.dataset.fallback && member.photo_url) {
                                  target.dataset.fallback = '1';
                                  target.src = String(member.photo_url);
                                }
                              }}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-slate-300 dark:bg-white/10 flex-shrink-0" />
                          )}
                          {/* Info */}
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="font-semibold text-slate-900 dark:text-slate-100 truncate text-[13px]">
                              {formatNameFirstLast(member.full_name)}
                            </span>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              <span
                                className="px-1 py-0.5 rounded-md text-[9px] font-semibold"
                                style={{
                                  color: '#64748b',
                                  backgroundColor: `${chamberColor(member.chamber)}20`,
                                }}
                              >
                                {member.chamber === "HOUSE" ? "House" : member.chamber === "SENATE" ? "Senate" : (member.chamber || "")}
                              </span>
                              <span
                                className="px-1 py-0.5 rounded-md text-[9px] font-medium border"
                                style={partyBadgeStyle(member.party)}
                              >
                                {partyLabel(member.party)}
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                {formatStateDistrict(member)}
                              </span>
                            </div>
                          </div>
                          {/* Grade chip */}
                          <GradeChip grade={isGradeIncomplete(member.bioguide_id) ? "Inc" : String(member.Grade || "N/A")} scale={0.6} />
                        </div>
                      ))}
                      {filteredSecondSection.length === 0 && (
                        <div className="col-span-full text-center py-4 text-xs text-slate-500 dark:text-slate-400">
                          {(partyFilter || stateFilter || chamberFilter) ? "No matches for current filters" : "None found"}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Third Section - for manual scoring or "Voted Present" */}
                {thirdLabel && thirdSection.length > 0 && (
                  <div>
                    <h2
                      className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50 transition-colors"
                      onClick={() => setThirdExpanded(!thirdExpanded)}
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden="true" role="img">
                        {thirdIsGood ? (
                          <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                        ) : (
                          <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                        )}
                      </svg>
                      <span className="flex items-center flex-wrap flex-1 min-w-0">
                        <span className="whitespace-nowrap">{thirdLabel}: {filteredThirdSection.length}{(partyFilter || stateFilter || chamberFilter) && ` of ${thirdSection.length}`}</span>
                        <PartisanPills members={filteredThirdSection} />
                      </span>
                      <svg
                        viewBox="0 0 20 20"
                        className={clsx("h-4 w-4 transition-transform flex-shrink-0", thirdExpanded && "rotate-180")}
                        aria-hidden="true"
                        role="img"
                      >
                        <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </h2>
                    {thirdExpanded && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
                        {filteredThirdSection.map((member) => (
                          <div
                            key={member.bioguide_id}
                            className={clsx(
                              "text-xs py-2 px-2 rounded bg-slate-50 dark:bg-slate-900/50 flex items-center gap-2",
                              onMemberClick && "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900"
                            )}
                            onClick={() => {
                              const firstCategory = meta.categories?.split(';')[0]?.trim();
                              onMemberClick?.(member, firstCategory);
                            }}
                          >
                            {/* Photo */}
                            {member.bioguide_id ? (
                              <img
                                src={getPhotoUrl(String(member.bioguide_id), '225x275')}
                                alt=""
                                loading="lazy"
                                className="h-10 w-10 rounded-full object-cover bg-slate-200 dark:bg-white/10 flex-shrink-0"
                                onError={(e) => {
                                  const target = e.currentTarget;
                                  if (!target.dataset.fallback && member.photo_url) {
                                    target.dataset.fallback = '1';
                                    target.src = String(member.photo_url);
                                  }
                                }}
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-slate-300 dark:bg-white/10 flex-shrink-0" />
                            )}
                            {/* Info */}
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate text-[13px]">
                                {formatNameFirstLast(member.full_name)}
                              </span>
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                <span
                                  className="px-1 py-0.5 rounded-md text-[9px] font-semibold"
                                  style={{
                                    color: '#64748b',
                                    backgroundColor: `${chamberColor(member.chamber)}20`,
                                  }}
                                >
                                  {member.chamber === "HOUSE" ? "House" : member.chamber === "SENATE" ? "Senate" : (member.chamber || "")}
                                </span>
                                <span
                                  className="px-1 py-0.5 rounded-md text-[9px] font-medium border"
                                  style={partyBadgeStyle(member.party)}
                                >
                                  {partyLabel(member.party)}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {formatStateDistrict(member)}
                                </span>
                              </div>
                            </div>
                            {/* Grade chip */}
                            <GradeChip grade={isGradeIncomplete(member.bioguide_id) ? "Inc" : String(member.Grade || "N/A")} scale={0.6} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Geographic Distribution Map */}
            {(firstSection.length > 0 || secondSection.length > 0) && (
              <BillMiniMap
                meta={meta}
                column={column}
                rows={rows}
                firstSection={firstSection}
                secondSection={secondSection}
                firstIsGood={firstIsGood}
                secondIsGood={secondIsGood}
                firstLabel={firstLabel}
                secondLabel={secondLabel}
                manualScoringMeta={manualScoringMeta}
              />
            )}

            {/* Notes */}
            {meta.notes && (
              <div>
                <h2 className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">
                  Notes
                </h2>
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {meta.notes}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
