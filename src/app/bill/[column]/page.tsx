"use client";
import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { loadData, loadManualScoringMeta } from "@/lib/loadCsv";
import type { Row, Meta } from "@/lib/types";
import clsx from "clsx";
import { MemberCard } from "@/components/MemberCard";
import { MemberModal } from "@/components/MemberModal";
import { partyBadgeStyle, partyLabel, stateCodeOf, chamberColor, inferChamber, isTrue, GRADE_COLORS, extractVoteInfo } from "@/lib/utils";

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

export default function BillPage() {
  const params = useParams();
  const router = useRouter();
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
  const [manualScoringMeta, setManualScoringMeta] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    (async () => {
      const [{ rows, columns, metaByCol, categories }, manualMeta] = await Promise.all([
        loadData(),
        loadManualScoringMeta()
      ]);
      setAllColumns(columns);
      setMetaByCol(metaByCol);
      setCategories(categories);
      setManualScoringMeta(manualMeta);
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
      // Exclude the sponsor from cosponsors list (but include them for votes)
      // Also exclude members who were not eligible to vote (null/undefined in CSV)
      const support: Row[] = [];
      const oppose: Row[] = [];
      const present: Row[] = []; // For votes where member voted "present"

      // Check if this is a cosponsor action or vote
      const actionType = (billMeta as { action_types?: string })?.action_types || '';
      const isCosponsorAction = actionType.includes('cosponsor');
      const isVoteAction = actionType.includes('vote');
      const fullPoints = Number(billMeta?.points ?? 0);

      rows.forEach((row) => {
        // Skip members from the wrong chamber
        if (billChamber && row.chamber !== billChamber) {
          return;
        }

        // Skip the sponsor only for cosponsor actions (not for votes)
        if (isCosponsorAction && sponsorRow && row.bioguide_id === sponsorRow.bioguide_id) {
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

        // For cosponsor bills, use the _cosponsor column to determine grouping
        if (isCosponsorAction) {
          const cosponsorCol = `${column}_cosponsor`;
          const didCosponsor = Number((row as Record<string, unknown>)[cosponsorCol] ?? 0) === 1;

          if (didCosponsor) {
            support.push(row); // Cosponsored
          } else {
            oppose.push(row); // Did not cosponsor
          }
        } else {
          // For votes, use points-based grouping
          // Check for "present" vote (partial points - not 0, not full)
          if (isVoteAction && val > 0 && val < fullPoints) {
            present.push(row);
          } else if (val > 0) {
            support.push(row);
          } else if (val === 0) {
            oppose.push(row);
          }
        }
      });

      // Check if this is a manual action with a pair_key (for three-group display)
      // Also special case for Banning Travel to Iran Committee Vote
      // For manual actions with 3 tiers (max 4 points), we have paired groups
      const isThreeTierManualData = billMeta.type === "MANUAL" && Number(billMeta.points) === 4;
      const hasPairedGroups = isThreeTierManualData ||
                              (billMeta.type === "MANUAL" && billMeta.pair_key && isTrue((billMeta as Record<string, unknown>).preferred)) ||
                              column === 'Banning_Travel_to_Iran_Committee_Vote';

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

          // Skip the sponsor only for cosponsor actions (not for votes)
          if (isCosponsorAction && sponsorRow && row.bioguide_id === sponsorRow.bioguide_id) {
            return;
          }

          const rawVal = (row as Record<string, unknown>)[column];

          // Skip members who weren't eligible
          if (rawVal === null || rawVal === undefined || rawVal === '') {
            return;
          }

          const val = Number(rawVal);

          // Debug logging for first few members
          if (bestGroup.length + middleGrp.length + worstGroup.length < 5) {
            console.log('Processing member:', {
              name: row.full_name,
              rawVal,
              val,
              type: typeof rawVal,
              valGte4: val >= 4,
              valGte2: val >= 2
            });
          }

          // Skip absent members
          const absentCol = `${column}_absent`;
          const wasAbsent = Number((row as Record<string, unknown>)[absentCol] ?? 0) === 1;
          if (wasAbsent) {
            return;
          }

          // Group by score
          if (val >= 4) {
            bestGroup.push(row);
          } else if (val >= 2) {
            middleGrp.push(row);
          } else {
            // 0 or negative points (e.g., -4)
            worstGroup.push(row);
          }
        });

        console.log('Grouping results:', {
          column,
          bestGroupSize: bestGroup.length,
          middleGrpSize: middleGrp.length,
          worstGroupSize: worstGroup.length,
          middleGroupSample: middleGrp.slice(0, 3).map(r => ({ name: r.full_name, val: r[column] }))
        });

        setSupporters(bestGroup.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))));
        setMiddleGroup(middleGrp.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))));
        setOpposers(worstGroup.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))));
      } else {
        setSupporters(support.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))));
        // For votes, set middleGroup to present voters; otherwise empty
        setMiddleGroup(isVoteAction ? present.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))) : []);
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

  // Check if this is a paired manual action or the special Iran vote case
  // For manual actions with 3 tiers (max 4 points), we have paired groups
  const isThreeTierManual = meta.type === "MANUAL" && Number(meta.points) === 4;
  const hasPairedGroups = isThreeTierManual ||
                          (meta.type === "MANUAL" && meta.pair_key && isTrue((meta as Record<string, unknown>).preferred)) ||
                          column === 'Banning_Travel_to_Iran_Committee_Vote';
  const pairedBillName = hasPairedGroups
    ? ((meta.pair_key || "").split("|").map(s => s.trim()).find(c => c !== column) || "")
    : "";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const pairedBillMeta = pairedBillName ? metaByCol.get(pairedBillName) : undefined;

  // For paired manual actions, sections are already correctly grouped by score
  // For cosponsor and vote bills, keep sections consistent (don't swap based on position)
  // filteredSupporters always = people who got points, filteredOpposers always = people who got 0 points
  const firstSection = hasPairedGroups ? filteredSupporters : filteredSupporters;
  const secondSection = hasPairedGroups ? filteredMiddleGroup : filteredOpposers;
  const thirdSection = hasPairedGroups ? filteredOpposers : filteredMiddleGroup;

  let firstLabel = '';
  let secondLabel = '';
  let thirdLabel = '';
  let firstIsGood = false; // Whether first section took the "good" action
  let secondIsGood = false;
  let thirdIsGood = false;

  // Special handling for Banning Travel to Iran Committee Vote
  if (column === 'Banning_Travel_to_Iran_Committee_Vote') {
    firstLabel = 'Voted against banning travel to Iran (+4 pts)';
    secondLabel = 'Tried to remove Iran ban but ultimately voted yes (+2 pts)';
    thirdLabel = 'Voted to ban travel to Iran (-4 pts)';
    firstIsGood = true;
    secondIsGood = true;
    thirdIsGood = false;
  } else if (hasPairedGroups) {
    // Three-group display for paired manual actions
    // Check if we have custom scoring descriptions for this action
    const displayLabel = meta.display_name || meta.short_title || column;
    const firstKey = `${displayLabel}|4`;
    const secondKey = `${displayLabel}|2`;
    const thirdKey = `${displayLabel}|0`;

    const hasCustomDescriptions = manualScoringMeta.has(firstKey) &&
                                   manualScoringMeta.has(secondKey) &&
                                   manualScoringMeta.has(thirdKey);

    if (hasCustomDescriptions) {
      // Use custom descriptions from manual_scoring_meta.csv
      firstLabel = `${manualScoringMeta.get(firstKey)} (+4 pts)`;
      secondLabel = `${manualScoringMeta.get(secondKey)} (+2 pts)`;
      thirdLabel = `${manualScoringMeta.get(thirdKey)} (-4 pts)`;
      firstIsGood = true;
      secondIsGood = true;
      thirdIsGood = false;
    } else {
      // Fall back to generic labels based on score and position
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
    }
  } else if (isCosponsor) {
    // For cosponsor bills, val in CSV is the raw action (1 = cosponsored, 0 = didn't)
    // firstSection (val > 0) = cosponsors, secondSection (val = 0) = non-cosponsors
    // Labels always describe the action, only good/bad indicator changes with NIAC position
    firstLabel = 'Cosponsored';
    secondLabel = 'Has not cosponsored';
    if (isSupport) {
      // We support cosponsorship
      firstIsGood = true;   // cosponsoring is good
      secondIsGood = false; // not cosponsoring is bad
    } else {
      // We oppose cosponsorship
      firstIsGood = false;  // cosponsoring is bad
      secondIsGood = true;  // not cosponsoring is good
    }
  } else if (isVote) {
    // For vote bills, val = calculated points (not raw vote)
    // firstSection = people who got points, secondSection = people who got 0 points
    // What they actually voted depends on our position
    thirdLabel = 'Voted Present';
    if (isSupport) {
      // We support the bill, so yes votes get points
      firstLabel = 'Voted in favor';  // firstSection = yes votes (got points)
      secondLabel = 'Voted against';  // secondSection = no votes (0 points)
      firstIsGood = true;
      secondIsGood = false;
      thirdIsGood = false;
    } else {
      // We oppose the bill, so no votes get points
      firstLabel = 'Voted against';  // firstSection = no votes (got points)
      secondLabel = 'Voted in favor';  // secondSection = yes votes (0 points)
      firstIsGood = true;
      secondIsGood = false;
      thirdIsGood = false;
    }
  } else {
    firstLabel = 'Support';
    secondLabel = 'Oppose';
    firstIsGood = isSupport;
    secondIsGood = !isSupport;
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        body {
          background: #F7F8FA !important;
        }
        @media (prefers-color-scheme: dark) {
          body {
            background: #0B1220 !important;
          }
        }
      `}} />
      <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#0B1220] p-4">
        <div className="max-w-5xl mx-auto">
          <div className="card p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6 border-b border-[#E7ECF2] dark:border-slate-800 pb-4">
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
                {(() => {
                  const voteInfo = extractVoteInfo(meta);
                  return (
                    <>
                      {voteInfo.voteResult && voteInfo.voteDate ? (
                        <div className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                          <span className="font-medium">Date of Vote:</span> {voteInfo.voteResult} on {voteInfo.voteDate}
                        </div>
                      ) : voteInfo.dateIntroduced ? (
                        <div className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                          <span className="font-medium">Date Introduced:</span> {voteInfo.dateIntroduced}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                          <span className="font-medium">Date:</span> N/A
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <button
                className="chip-outline text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                onClick={() => {
                  router.push('/');
                }}
              >
                Close
              </button>
            </div>

          {/* Sponsor */}
          {sponsorMember && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">
                Sponsor
              </h2>
              <div
                className="flex items-center gap-3 p-3 rounded-lg border border-[#E7ECF2] dark:border-slate-800 bg-slate-50 dark:bg-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition"
                onClick={() => setSelectedMember(sponsorMember)}
              >
                {sponsorMember.photo_url ? (
                  <img
                    src={String(sponsorMember.photo_url)}
                    alt=""
                    className="h-16 w-16 flex-shrink-0 rounded-full object-cover bg-slate-200 dark:bg-white/10"
                  />
                ) : (
                  <div className="h-16 w-16 flex-shrink-0 rounded-full bg-slate-300 dark:bg-white/10" />
                )}
                <div className="flex-1">
                  <div className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span>{sponsorMember.full_name}</span>
                    {sponsorMember.Grade && (
                      <span className="flex-shrink-0 inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold min-w-[2.75rem]" style={{
                        backgroundColor: String(sponsorMember.Grade).startsWith("A") ? GRADE_COLORS.A
                          : String(sponsorMember.Grade).startsWith("B") ? GRADE_COLORS.B
                          : String(sponsorMember.Grade).startsWith("C") ? GRADE_COLORS.C
                          : String(sponsorMember.Grade).startsWith("D") ? GRADE_COLORS.D
                          : String(sponsorMember.Grade).startsWith("F") ? GRADE_COLORS.F
                          : GRADE_COLORS.default,
                        color: String(sponsorMember.Grade).startsWith("A") ? "#ffffff"
                          : String(sponsorMember.Grade).startsWith("B") ? "#4b5563"
                          : String(sponsorMember.Grade).startsWith("C") ? "#4b5563"
                          : "#4b5563"
                      }}>
                        {sponsorMember.Grade}
                      </span>
                    )}
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

          {/* Links */}
          {(meta.congress_url || meta.learn_more_link) && (
            <div className="mb-6">
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
                        {housemembers.length > 0 && senatemembers.length > 0 && (
                          <div className="border-t border-[#E7ECF2] dark:border-slate-800 my-4"></div>
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
                        {housemembers.length > 0 && senatemembers.length > 0 && (
                          <div className="border-t border-[#E7ECF2] dark:border-slate-800 my-4"></div>
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
          manualScoringMeta={manualScoringMeta}
          onClose={() => setSelectedMember(null)}
        />
      )}
      </div>
    </>
  );
}
