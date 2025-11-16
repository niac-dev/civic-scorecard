"use client";
import { useEffect, useState, useMemo } from "react";
import type { Meta, Row } from "@/lib/types";
import { extractVoteInfo, inferChamber } from "@/lib/utils";
import clsx from "clsx";

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

interface BillModalProps {
  meta: Meta;
  column: string;
  rows: Row[];
  manualScoringMeta?: Map<string, string>;
  onClose: () => void;
  onBack?: () => void;
  onMemberClick?: (member: Row) => void;
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
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700">
        R: {rCount}
      </span>
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
        D: {dCount}
      </span>
    </span>
  );
}

export function BillModal({ meta, column, rows, manualScoringMeta, onClose, onBack, onMemberClick }: BillModalProps) {
  const position = (meta?.position_to_score || '').toUpperCase();
  const isSupport = position === 'SUPPORT';
  const [firstExpanded, setFirstExpanded] = useState(false);
  const [secondExpanded, setSecondExpanded] = useState(false);
  const [thirdExpanded, setThirdExpanded] = useState(false);

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

    // Check if this is a manual scoring item with custom labels
    const billLabel = meta.display_name || meta.short_title || column;
    const hasManualScoring = manualScoringMeta && Array.from(manualScoringMeta.keys()).some(key => key.startsWith(billLabel + '|'));

    if (hasManualScoring && manualScoringMeta) {
      // Group members by their exact score values using manual scoring labels
      const scoreGroups = new Map<number, { rows: Row[]; label: string }>();

      rows.forEach((row) => {
        if (billChamber && row.chamber !== billChamber) return;
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
      // Filter by chamber if applicable
      if (billChamber && row.chamber !== billChamber) {
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
    let tIsGood = false;

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
          <div className="flex items-center justify-between p-4 border-b border-[#E7ECF2] dark:border-slate-900 sticky top-0 bg-white dark:bg-slate-800 z-10">
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-1 min-w-0">
              {isSupport ? (
                <svg viewBox="0 0 20 20" className="h-5 w-5 flex-shrink-0" aria-hidden="true" role="img">
                  <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" className="h-5 w-5 flex-shrink-0" aria-hidden="true" role="img">
                  <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                </svg>
              )}
              <span className="truncate">
                {meta.display_name || meta.short_title || `${meta.bill_number || column}`}
              </span>
            </h1>
            <div className="flex gap-2 flex-shrink-0 ml-4">
              {onBack && (
                <button
                  className="p-2 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                  onClick={onBack}
                  title="Back"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
              )}
              <button
                className="p-2 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                onClick={() => window.open(`/bill/${encodeURIComponent(column)}`, "_blank")}
                title="Open full page"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
              <button
                className="p-2 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                onClick={onClose}
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Description at top */}
            {meta.description && (
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {meta.description}
              </p>
            )}

            {/* Bill metadata */}
            <div className="space-y-2">
              {/* Sponsor */}
              {(sponsorMember || meta.sponsor_name || meta.sponsor) && (
                <div className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <span className="font-medium">Sponsor:</span>
                  {sponsorMember ? (
                    <button
                      className="flex items-center gap-2 text-[#4B8CFB] hover:text-[#3a7de8] hover:underline"
                      onClick={() => onMemberClick?.(sponsorMember)}
                    >
                      {sponsorMember.photo_url ? (
                        <img
                          src={String(sponsorMember.photo_url)}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover bg-slate-200 dark:bg-white/10 flex-shrink-0"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-slate-300 dark:bg-white/10 flex-shrink-0" />
                      )}
                      {sponsorMember.chamber === 'SENATE' ? 'Sen.' : 'Rep.'} {sponsorMember.full_name} ({sponsorMember.party?.[0] || '?'}-{sponsorMember.state})
                    </button>
                  ) : (
                    meta.sponsor_name || meta.sponsor
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
                        <span className="font-medium">Status:</span> {voteInfo.voteResult}
                      </div>
                    ) : voteInfo.dateIntroduced ? (
                      <div className="text-sm text-slate-600 dark:text-slate-300">
                        <span className="font-medium">Date Introduced:</span> {voteInfo.dateIntroduced}
                      </div>
                    ) : null}
                  </>
                );
              })()}
              {/* Category */}
              {meta.categories && (
                <div className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <span className="font-medium">Category:</span>
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
              {/* Vote tallies (not cosponsors - those are shown in accordion) */}
              {(() => {
                const actionType = (meta as { action_types?: string })?.action_types || '';
                const isVote = actionType.includes('vote');

                if (isVote && meta.vote_tallies) {
                  return (
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      <span className="font-medium">Vote Tallies:</span> {meta.vote_tallies}
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            {/* Analysis */}
            {meta.analysis && (
              <div>
                <h2 className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">
                  Analysis
                </h2>
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {meta.analysis}
                </p>
              </div>
            )}

            {/* Member Lists - Accordion Sections */}
            {(firstSection.length > 0 || secondSection.length > 0) && (
              <div className="space-y-4">
                {/* First Section - Cosponsored / Voted in favor */}
                <div>
                  <h2
                    className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50 transition-colors flex-wrap"
                    onClick={() => setFirstExpanded(!firstExpanded)}
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden="true" role="img">
                      {firstIsGood ? (
                        <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                      ) : (
                        <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                      )}
                    </svg>
                    <span className="flex items-center flex-wrap">
                      {firstLabel}: {firstSection.length}
                      <PartisanPills members={firstSection} />
                    </span>
                    <svg
                      viewBox="0 0 20 20"
                      className={clsx("h-4 w-4 ml-auto transition-transform flex-shrink-0", firstExpanded && "rotate-180")}
                      aria-hidden="true"
                      role="img"
                    >
                      <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </h2>
                  {firstExpanded && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {firstSection.map((member) => (
                        <div
                          key={member.bioguide_id}
                          className={clsx(
                            "text-xs py-1.5 px-2 rounded bg-slate-50 dark:bg-slate-900/50 flex items-center gap-2",
                            onMemberClick && "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900"
                          )}
                          onClick={() => onMemberClick?.(member)}
                        >
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{member.full_name}</span>
                          <span className="text-slate-500 dark:text-slate-400">({member.party?.[0] || '?'}-{member.state})</span>
                        </div>
                      ))}
                      {firstSection.length === 0 && (
                        <div className="col-span-full text-center py-4 text-xs text-slate-500 dark:text-slate-400">
                          None found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Second Section - Has not cosponsored / Voted against */}
                <div>
                  <h2
                    className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50 transition-colors flex-wrap"
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
                    <span className="flex items-center flex-wrap">
                      {secondLabel}: {secondSection.length}
                      <PartisanPills members={secondSection} />
                    </span>
                    <svg
                      viewBox="0 0 20 20"
                      className={clsx("h-4 w-4 ml-auto transition-transform flex-shrink-0", secondExpanded && "rotate-180")}
                      aria-hidden="true"
                      role="img"
                    >
                      <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </h2>
                  {secondExpanded && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {secondSection.map((member) => (
                        <div
                          key={member.bioguide_id}
                          className={clsx(
                            "text-xs py-1.5 px-2 rounded bg-slate-50 dark:bg-slate-900/50 flex items-center gap-2",
                            onMemberClick && "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900"
                          )}
                          onClick={() => onMemberClick?.(member)}
                        >
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{member.full_name}</span>
                          <span className="text-slate-500 dark:text-slate-400">({member.party?.[0] || '?'}-{member.state})</span>
                        </div>
                      ))}
                      {secondSection.length === 0 && (
                        <div className="col-span-full text-center py-4 text-xs text-slate-500 dark:text-slate-400">
                          None found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Third Section - for manual scoring or "Voted Present" */}
                {thirdLabel && thirdSection.length > 0 && (
                  <div>
                    <h2
                      className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50 transition-colors flex-wrap"
                      onClick={() => setThirdExpanded(!thirdExpanded)}
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden="true" role="img">
                        {thirdIsGood ? (
                          <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                        ) : (
                          <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                        )}
                      </svg>
                      <span className="flex items-center flex-wrap">
                        {thirdLabel}: {thirdSection.length}
                        <PartisanPills members={thirdSection} />
                      </span>
                      <svg
                        viewBox="0 0 20 20"
                        className={clsx("h-4 w-4 ml-auto transition-transform flex-shrink-0", thirdExpanded && "rotate-180")}
                        aria-hidden="true"
                        role="img"
                      >
                        <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </h2>
                    {thirdExpanded && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                        {thirdSection.map((member) => (
                          <div
                            key={member.bioguide_id}
                            className={clsx(
                              "text-xs py-1.5 px-2 rounded bg-slate-50 dark:bg-slate-900/50 flex items-center gap-2",
                              onMemberClick && "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900"
                            )}
                            onClick={() => onMemberClick?.(member)}
                          >
                            <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{member.full_name}</span>
                            <span className="text-slate-500 dark:text-slate-400">({member.party?.[0] || '?'}-{member.state})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
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
          </div>
        </div>
      </div>
    </>
  );
}
