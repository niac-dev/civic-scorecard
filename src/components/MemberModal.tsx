"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import clsx from "clsx";
import type { Row, Meta } from "@/lib/types";
import {
  partyBadgeStyle,
  partyLabel,
  stateCodeOf,
  chamberColor,
  inferChamber,
  isTrue
} from "@/lib/utils";
import {
  PacData,
  loadPacData,
  isAipacEndorsed,
  isDmfiEndorsed
} from "@/lib/pacData";
import { GradeChip, VoteIcon } from "@/components/GradeChip";
import { MiniDistrictMap } from "@/components/MiniDistrictMap";

function formatPositionLegislation(
  meta: Meta | undefined,
  score?: number,
  manualScoringMeta?: Map<string, string>
): string {
  const position = (meta?.position_to_score || '').toUpperCase();
  const actionType = (meta as { action_types?: string })?.action_types || '';
  const isCosponsor = actionType.includes('cosponsor');
  const isVote = actionType.includes('vote');
  const isSupport = position === 'SUPPORT';
  const isManual = meta?.type === 'MANUAL';

  // For NIAC position, we always show NIAC's position, not the member's action
  // So we don't use custom descriptions here
  if (isCosponsor) {
    return isSupport ? 'Support Cosponsorship' : 'Oppose Cosponsorship';
  } else if (isVote) {
    return isSupport ? 'Vote in Favor' : 'Vote Against';
  } else {
    return isSupport ? 'Support' : 'Oppose';
  }
}

interface MemberModalProps {
  row: Row;
  billCols?: string[];
  metaByCol?: Map<string, Meta>;
  categories?: string[];
  manualScoringMeta?: Map<string, string>;
  onClose: () => void;
  onBack?: () => void;
  onBillClick?: (meta: Meta, column: string) => void;
  initialCategory?: string | null;
}

export function MemberModal({
  row,
  billCols = [],
  metaByCol = new Map(),
  categories = [],
  manualScoringMeta = new Map(),
  onClose,
  onBack,
  onBillClick,
  initialCategory = null,
}: MemberModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategory);
  const [showAipacSection, setShowAipacSection] = useState(initialCategory === "AIPAC");
  const [pacData, setPacData] = useState<PacData | undefined>(undefined);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Scroll to actions section on mobile when category is clicked
  const scrollToActions = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768 && actionsRef.current) {
      // Small delay to ensure layout has settled
      setTimeout(() => {
        actionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  // When opening from AIPAC map, activate AIPAC section
  useEffect(() => {
    if (initialCategory === "AIPAC") {
      setShowAipacSection(true);
    }
  }, [initialCategory]);

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
    if (!billCols || billCols.length === 0) return [];

    return billCols
      .map((c) => {
        const meta = metaByCol.get(c);
        const inferredChamber = inferChamber(meta, c);

        // Check if this bill was voted on in both chambers
        const voteTallies = (meta?.vote_tallies || "").toLowerCase();
        const hasHouseVote = voteTallies.includes("house");
        const hasSenateVote = voteTallies.includes("senate");
        const votedInBothChambers = hasHouseVote && hasSenateVote;

        // If voted in both chambers, it applies to all members regardless of chamber
        let notApplicable = !votedInBothChambers && inferredChamber && inferredChamber !== row.chamber;

        // Check raw value before converting to number
        const rawVal = (row as Record<string, unknown>)[c];
        const val = Number(rawVal ?? 0);

        // For manual actions like committee votes, null/undefined/empty means not applicable (not on committee)
        if (meta?.type === 'MANUAL' && (rawVal === null || rawVal === undefined || rawVal === '')) {
          notApplicable = true;
        }

        // Check if member was absent for this vote
        const absentCol = `${c}_absent`;
        const wasAbsent = Number((row as Record<string, unknown>)[absentCol] ?? 0) === 1;

        // Check if member cosponsored (for cosponsor bills)
        const cosponsorCol = `${c}_cosponsor`;
        const didCosponsor = Number((row as Record<string, unknown>)[cosponsorCol] ?? 0) === 1;

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

        // Determine if member took the "good" action
        // For most bills: val > 0 means they did the right thing
        // For no_cosponsor_benefit bills: need to check actual cosponsor status
        const noCosponsorBenefit = meta?.no_cosponsor_benefit === true ||
                                   meta?.no_cosponsor_benefit === 1 ||
                                   meta?.no_cosponsor_benefit === '1';
        const actionType = (meta as { action_types?: string })?.action_types || '';
        const isCosponsor = actionType.includes('cosponsor');
        const position = (meta?.position_to_score || '').toUpperCase();
        const isSupport = position === 'SUPPORT';

        let ok = !notApplicable && val > 0;

        // Special handling for no_cosponsor_benefit bills
        if (!notApplicable && isCosponsor && noCosponsorBenefit && !isSupport) {
          // For bills we oppose with no_cosponsor_benefit:
          // "ok" means they did NOT cosponsor
          ok = !didCosponsor;
        }

        return {
          col: c,
          meta,
          val,
          categories,
          notApplicable,
          waiver,
          wasAbsent,
          didCosponsor,
          ok,
        };
      })
      .filter((it) => {
        // Keep items with metadata
        if (!it.meta) return false;
        // Always show Iran committee vote even if not applicable (to show "not on committee" message)
        if (it.col === 'Banning_Travel_to_Iran_Committee_Vote') return true;
        // Filter out other not applicable items
        return !it.notApplicable;
      });
  }, [billCols, metaByCol, row]);

  // Filter items based on selected category
  const items = selectedCategory
    ? allItems.filter((it) => it.categories.some((c) => c === selectedCategory))
    : allItems;

  // Debug: Log when AIPAC category is selected
  if (selectedCategory === "AIPAC") {
    console.log('AIPAC category selected!', {
      selectedCategory,
      pacDataExists: !!pacData,
      itemsCount: items.length
    });
  }

  // Check if we should render the Votes & Actions section
  const hasVotesActions = billCols && billCols.length > 0 && metaByCol && categories;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 dark:bg-black/70 z-[100]"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="fixed inset-2 md:inset-10 z-[110] flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-5xl rounded-2xl border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-slate-800 shadow-xl overflow-auto max-h-full">
          {/* Header */}
          <div className="flex flex-col p-6 border-b border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-slate-800 relative">
            {/* Close button and external link - upper right corner on desktop, own row on mobile */}
            <div className="flex justify-between mb-3 md:mb-0 md:absolute md:top-4 md:right-4 gap-2 z-10">
              {/* Back button - only shown if there's history */}
              <div className="md:hidden">
                {onBack && (
                  <button
                    className="p-2 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 bg-white dark:bg-slate-800"
                    onClick={onBack}
                    title="Back"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {onBack && (
                  <button
                    className="hidden md:block p-2 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 bg-white dark:bg-slate-800"
                    onClick={onBack}
                    title="Back"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                )}
                <button
                  className="p-2 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 bg-white dark:bg-slate-800"
                  onClick={() => window.open(`/member/${row.bioguide_id}`, "_blank")}
                  title="Open in new tab"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
                <button
                  className="p-2 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 bg-white dark:bg-slate-800"
                  onClick={onClose}
                  title="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {/* Three column layout on wide screens */}
            <div className={clsx("flex flex-col md:flex-row gap-4", onBack ? "md:pr-32" : "md:pr-24")}>
              {/* Column 1: Photo */}
              <div className="flex flex-col gap-3 items-center md:items-start">
                {row.photo_url ? (
                  <img
                    src={String(row.photo_url)}
                    alt=""
                    className="h-32 w-32 flex-shrink-0 rounded-full object-cover bg-slate-200 dark:bg-white/10"
                  />
                ) : (
                  <div className="h-32 w-32 flex-shrink-0 rounded-full bg-slate-300 dark:bg-white/10" />
                )}
              </div>

              {/* Column 2: Member info */}
              <div className="flex-1 flex flex-col items-center md:items-start">
                {/* Title (Representative/Senator/Delegate) */}
                <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium mb-1">
                  {(() => {
                    if (row.chamber === "SENATE") return "Senator";
                    if (row.chamber === "HOUSE") {
                      const delegateStates = ["AS", "DC", "GU", "MP", "PR", "VI"];
                      const state = String(row.state || "").toUpperCase();
                      return delegateStates.includes(state) ? "Delegate" : "Representative";
                    }
                    return "";
                  })()}
                </div>
                {/* Name and grade - aligned to top of photo */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
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
                  <GradeChip grade={String(row.Grade || "N/A")} isOverall={true} />
                </div>

                {/* Bio info */}
                <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 mb-3">
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
                  <span>
                    {row.chamber === "SENATE"
                      ? stateCodeOf(row.state)
                      : row.district
                        ? `${stateCodeOf(row.state)}-${row.district}`
                        : `${stateCodeOf(row.state)}-At Large`
                    }
                  </span>
                </div>

                {/* Washington office phone */}
                {row.office_phone && (
                  <div className="text-xs text-slate-600 dark:text-slate-400 text-center md:text-left">
                    <div className="font-medium mb-0.5">Washington Office Phone</div>
                    <div className="text-slate-700 dark:text-slate-200">{row.office_phone}</div>
                  </div>
                )}
              </div>

              {/* Column 3: Map (only on wide screens) */}
              <div className="hidden md:block">
                {row.state && <MiniDistrictMap member={row} />}
              </div>
            </div>
          </div>

          {/* Map on mobile - show below, centered - outside padded container */}
          <div className="md:hidden mt-4 px-6 pb-6 flex justify-center border-b border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-slate-800">
            {row.state && <MiniDistrictMap member={row} />}
          </div>

          {/* Content - 2 Column Layout */}
          <div className="p-6">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              {/* Left Column: Issue Grade Filters (1/3 width on desktop, full width on mobile) */}
              <div className="w-full md:w-1/3 md:flex-shrink-0 space-y-3">
                {/* Overall Grade card */}
                <button
                  onClick={() => {
                    if (hasVotesActions) {
                      setSelectedCategory(null);
                      setShowAipacSection(false);
                      scrollToActions();
                    }
                  }}
                  className={clsx(
                    "rounded-lg border p-3 text-left transition w-full",
                    hasVotesActions ? "cursor-pointer" : "cursor-default",
                    selectedCategory === null && !showAipacSection && hasVotesActions
                      ? "border-[#4B8CFB] bg-[#4B8CFB]/10 dark:bg-[#4B8CFB]/20"
                      : "border-[#E7ECF2] dark:border-slate-900 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200">All Issues</div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        {Number(row.Total || 0).toFixed(0)}/{Number(row.Max_Possible || 0).toFixed(0)}
                      </div>
                      <GradeChip grade={String(row.Grade || "N/A")} isOverall={true} />
                    </div>
                  </div>
                </button>

                {categories.filter(cat => cat !== "AIPAC").map((category) => {
                  const fieldSuffix = category.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
                  const totalField = `Total_${fieldSuffix}` as keyof Row;
                  const maxField = `Max_Possible_${fieldSuffix}` as keyof Row;
                  const gradeField = `Grade_${fieldSuffix}` as keyof Row;
                  const total = Number(row[totalField] || 0).toFixed(0);
                  const maxPossible = Number(row[maxField] || 0).toFixed(0);

                  return (
                    <button
                      key={category}
                      onClick={() => {
                        if (hasVotesActions) {
                          setSelectedCategory(selectedCategory === category ? null : category);
                          setShowAipacSection(false);
                          scrollToActions();
                        }
                      }}
                      className={clsx(
                        "rounded-lg border p-3 text-left transition w-full",
                        hasVotesActions ? "cursor-pointer" : "cursor-default",
                        selectedCategory === category && hasVotesActions
                          ? "border-[#4B8CFB] bg-[#4B8CFB]/10 dark:bg-[#4B8CFB]/20"
                          : "border-[#E7ECF2] dark:border-slate-900 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{category}</div>
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            {total}/{maxPossible}
                          </div>
                          <GradeChip grade={String(row[gradeField] || "N/A")} />
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* AIPAC/DMFI Endorsement card */}
                {(() => {
                  const hasRejectCommitment = !!(row.reject_commitment && String(row.reject_commitment).trim());
                  const rejectCommitment = String(row.reject_commitment || "").trim();
                  const rejectLink = row.reject_commitment_link;
                  const aipac = isAipacEndorsed(pacData);
                  const dmfi = isDmfiEndorsed(pacData);

                  return (
                    <button
                      onClick={() => {
                        setShowAipacSection(true);
                        setSelectedCategory(null);
                        scrollToActions();
                      }}
                      className={clsx(
                        "rounded-lg border p-3 text-left transition w-full",
                        showAipacSection
                          ? "border-[#4B8CFB] bg-[#4B8CFB]/10 dark:bg-[#4B8CFB]/20 cursor-pointer"
                          : "border-[#E7ECF2] dark:border-slate-900 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">AIPAC/DMFI</div>
                        {hasRejectCommitment ? (
                          <svg viewBox="0 0 20 20" className="h-5 w-5 flex-shrink-0 text-green-600" aria-hidden="true" role="img">
                            <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="currentColor" />
                          </svg>
                        ) : aipac || dmfi ? (
                          <svg viewBox="0 0 20 20" className="h-5 w-5 flex-shrink-0 text-red-500" aria-hidden="true" role="img">
                            <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="currentColor" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 20 20" className="h-5 w-5 flex-shrink-0 text-green-600" aria-hidden="true" role="img">
                            <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="currentColor" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })()}
              </div>

              {/* Right Column: Votes & Actions + AIPAC Support (2/3 width on desktop, full width on mobile) */}
              <div ref={actionsRef} className="w-full md:flex-1 space-y-6">
                {/* Show AIPAC Support when AIPAC/DMFI button is clicked */}
                {showAipacSection ? (
                  <div>
                    {/* AIPAC/DMFI Header */}
                    <div className="mb-4 pb-3 border-b border-[#E7ECF2] dark:border-slate-900">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">AIPAC/DMFI Support</h3>
                    </div>

                    {/* AIPAC/DMFI Content */}
                    {(() => {
                      const aipac = isAipacEndorsed(pacData);
                      const dmfi = isDmfiEndorsed(pacData);
                      const hasSupport = aipac || dmfi;

                      // Check if there's ANY financial data across all years
                      const hasAnyFinancialData = pacData && (
                        pacData.aipac_total_2022 > 0 || pacData.aipac_direct_amount_2022 > 0 || pacData.aipac_earmark_amount_2022 > 0 ||
                        pacData.aipac_ie_total_2022 > 0 || pacData.aipac_ie_support_2022 > 0 || pacData.dmfi_total_2022 > 0 ||
                        pacData.dmfi_direct_2022 > 0 || pacData.aipac_total_2024 > 0 || pacData.aipac_direct_amount_2024 > 0 ||
                        pacData.aipac_earmark_amount_2024 > 0 || pacData.aipac_ie_total_2024 > 0 || pacData.aipac_ie_support_2024 > 0 ||
                        pacData.dmfi_total_2024 > 0 || pacData.dmfi_direct_2024 > 0 || pacData.dmfi_ie_total_2024 > 0 ||
                        pacData.dmfi_ie_support_2024 > 0 || pacData.aipac_total_2026 > 0 || pacData.aipac_direct_amount_2026 > 0 ||
                        pacData.aipac_earmark_amount_2026 > 0 || pacData.aipac_ie_total_2026 > 0 || pacData.aipac_ie_support_2026 > 0 ||
                        pacData.dmfi_total_2026 > 0 || pacData.dmfi_direct_2026 > 0
                      );

                      return (
                        <>
                          {/* Always show status message at the top */}
                          <div className="py-3 flex items-start gap-3 bg-slate-50 dark:bg-white/5 -mx-2 px-2 rounded mb-4">
                            <div className="mt-0.5">
                              <VoteIcon ok={!hasSupport} />
                            </div>
                            <div className="flex-1">
                              {row.reject_aipac_commitment ? (
                                // Custom message takes priority
                                <>
                                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                    {row.reject_aipac_commitment}
                                  </div>
                                  {row.reject_aipac_link && (
                                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                      <a
                                        href={String(row.reject_aipac_link)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[#4B8CFB] hover:text-[#3a7de8] underline"
                                      >
                                        Learn more
                                      </a>
                                    </div>
                                  )}
                                </>
                              ) : (
                                // Default message based on support status
                                <>
                                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                    {!hasSupport ? "Not supported by AIPAC or DMFI" :
                                     aipac && dmfi ? "Supported by AIPAC and DMFI" :
                                     aipac ? "Supported by AIPAC" :
                                     "Supported by DMFI"}
                                  </div>
                                  {!hasSupport && row.reject_aipac_link && (
                                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                      <a
                                        href={String(row.reject_aipac_link)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[#4B8CFB] hover:text-[#3a7de8] underline"
                                      >
                                        View commitment to reject AIPAC
                                      </a>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {/* Financial data breakdown if available */}
                          {hasAnyFinancialData && (
                            <div className="rounded-lg border border-[#E7ECF2] dark:border-slate-900 bg-slate-50 dark:bg-white/5 p-4">
                              <div className="space-y-6">
                              {/* 2026 Election Section */}
                              {(() => {
                                // Only show if there's actual financial data (not just endorsement)
                                const has2026Data = pacData.aipac_total_2026 > 0 || pacData.aipac_direct_amount_2026 > 0 || pacData.aipac_earmark_amount_2026 > 0 || pacData.aipac_ie_total_2026 > 0 || pacData.aipac_ie_support_2026 > 0 || pacData.dmfi_total_2026 > 0 || pacData.dmfi_direct_2026 > 0;

                                if (!has2026Data) return null;

                                return (
                                  <div>
                                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-3 pb-2 border-b border-[#E7ECF2] dark:border-white/20">2026 Election</div>
                                    <div className="space-y-4">
                                      {/* AIPAC 2026 */}
                                      {aipac && (pacData.aipac_total_2026 > 0 || pacData.aipac_direct_amount_2026 > 0 || pacData.aipac_earmark_amount_2026 > 0 || pacData.aipac_ie_total_2026 > 0 || pacData.aipac_ie_support_2026 > 0) && (
                                        <div>
                                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">AIPAC (American Israel Public Affairs Committee)</div>
                                          <div className="grid grid-cols-2 gap-2 text-xs">
                                            {pacData.aipac_total_2026 > 0 && (
                                              <div className="flex justify-between">
                                                <span className="text-slate-600 dark:text-slate-400">Total:</span>
                                                <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.aipac_total_2026.toLocaleString()}</span>
                                              </div>
                                            )}
                                            {pacData.aipac_direct_amount_2026 > 0 && (
                                              <div className="flex justify-between">
                                                <span className="text-slate-600 dark:text-slate-400">Direct:</span>
                                                <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.aipac_direct_amount_2026.toLocaleString()}</span>
                                              </div>
                                            )}
                                            {pacData.aipac_earmark_amount_2026 > 0 && (
                                              <div className="flex justify-between">
                                                <span className="text-slate-600 dark:text-slate-400">Earmarked:</span>
                                                <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.aipac_earmark_amount_2026.toLocaleString()}</span>
                                              </div>
                                            )}
                                            {(pacData.aipac_ie_total_2026 > 0 || pacData.aipac_ie_support_2026 > 0) && (
                                              <div className="flex justify-between">
                                                <span className="text-slate-600 dark:text-slate-400">Independent Expenditures:</span>
                                                <span className="font-medium text-slate-700 dark:text-slate-200">${(pacData.aipac_ie_total_2026 || pacData.aipac_ie_support_2026).toLocaleString()}</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      {/* DMFI 2026 */}
                                      {(pacData.dmfi_total_2026 > 0 || pacData.dmfi_direct_2026 > 0) && (
                                        <div>
                                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">DMFI (Democratic Majority For Israel)</div>
                                          <div className="grid grid-cols-2 gap-2 text-xs">
                                            {pacData.dmfi_total_2026 > 0 && (
                                              <div className="flex justify-between">
                                                <span className="text-slate-600 dark:text-slate-400">Total:</span>
                                                <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.dmfi_total_2026.toLocaleString()}</span>
                                              </div>
                                            )}
                                            {pacData.dmfi_direct_2026 > 0 && (
                                              <div className="flex justify-between">
                                                <span className="text-slate-600 dark:text-slate-400">Direct:</span>
                                                <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.dmfi_direct_2026.toLocaleString()}</span>
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
                                const has2024Data = pacData.aipac_total_2024 > 0 || pacData.aipac_direct_amount_2024 > 0 || pacData.aipac_earmark_amount_2024 > 0 || pacData.aipac_ie_total_2024 > 0 || pacData.aipac_ie_support_2024 > 0 || pacData.dmfi_total_2024 > 0 || pacData.dmfi_direct_2024 > 0 || pacData.dmfi_ie_total_2024 > 0 || pacData.dmfi_ie_support_2024 > 0;

                                if (!has2024Data) return null;

                                return (
                                  <div>
                                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-3 pb-2 border-b border-[#E7ECF2] dark:border-white/20">2024 Election</div>
                                    <div className="space-y-4">
                                      {/* AIPAC 2024 */}
                                      {aipac && (pacData.aipac_total_2024 > 0 || pacData.aipac_direct_amount_2024 > 0 || pacData.aipac_earmark_amount_2024 > 0 || pacData.aipac_ie_total_2024 > 0 || pacData.aipac_ie_support_2024 > 0) && (
                                        <div>
                                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">AIPAC (American Israel Public Affairs Committee)</div>
                                          <div className="grid grid-cols-2 gap-2 text-xs">
                                            {pacData.aipac_total_2024 > 0 && (
                                              <div className="flex justify-between">
                                                <span className="text-slate-600 dark:text-slate-400">Total:</span>
                                                <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.aipac_total_2024.toLocaleString()}</span>
                                              </div>
                                            )}
                                            {pacData.aipac_direct_amount_2024 > 0 && (
                                              <div className="flex justify-between">
                                                <span className="text-slate-600 dark:text-slate-400">Direct:</span>
                                                <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.aipac_direct_amount_2024.toLocaleString()}</span>
                                              </div>
                                            )}
                                            {pacData.aipac_earmark_amount_2024 > 0 && (
                                              <div className="flex justify-between">
                                                <span className="text-slate-600 dark:text-slate-400">Earmarked:</span>
                                                <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.aipac_earmark_amount_2024.toLocaleString()}</span>
                                              </div>
                                            )}
                                            {(pacData.aipac_ie_total_2024 > 0 || pacData.aipac_ie_support_2024 > 0) && (
                                              <div className="flex justify-between">
                                                <span className="text-slate-600 dark:text-slate-400">Independent Expenditures:</span>
                                                <span className="font-medium text-slate-700 dark:text-slate-200">${(pacData.aipac_ie_total_2024 || pacData.aipac_ie_support_2024).toLocaleString()}</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      {/* DMFI 2024 */}
                                      {(pacData.dmfi_total_2024 > 0 || pacData.dmfi_direct_2024 > 0 || pacData.dmfi_ie_total_2024 > 0 || pacData.dmfi_ie_support_2024 > 0) && (
                                        <div>
                                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">DMFI (Democratic Majority For Israel)</div>
                                          <div className="grid grid-cols-2 gap-2 text-xs">
                                            {pacData.dmfi_total_2024 > 0 && (
                                              <div className="flex justify-between">
                                                <span className="text-slate-600 dark:text-slate-400">Total:</span>
                                                <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.dmfi_total_2024.toLocaleString()}</span>
                                              </div>
                                            )}
                                            {pacData.dmfi_direct_2024 > 0 && (
                                              <div className="flex justify-between">
                                                <span className="text-slate-600 dark:text-slate-400">Direct:</span>
                                                <span className="font-medium text-slate-700 dark:text-slate-200">${pacData.dmfi_direct_2024.toLocaleString()}</span>
                                              </div>
                                            )}
                                            {(pacData.dmfi_ie_total_2024 > 0 || pacData.dmfi_ie_support_2024 > 0) && (
                                              <div className="flex justify-between">
                                                <span className="text-slate-600 dark:text-slate-400">Independent Expenditures:</span>
                                                <span className="font-medium text-slate-700 dark:text-slate-200">${(pacData.dmfi_ie_total_2024 || pacData.dmfi_ie_support_2024).toLocaleString()}</span>
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
                                      {aipac && (pacData.aipac_total_2022 > 0 || pacData.aipac_direct_amount_2022 > 0 || pacData.aipac_earmark_amount_2022 > 0 || pacData.aipac_ie_total_2022 > 0 || pacData.aipac_ie_support_2022 > 0) && (
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
                            </div>
                          )}
                          {!pacData && (
                            <div className="text-xs text-slate-500 dark:text-slate-500 mt-4">Loading PAC data...</div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : hasVotesActions ? (
                  <div>
                    {/* Header showing selected category info */}
                    {(() => {
                      const category = selectedCategory || "All Issues";
                      let title = category;
                      let total: string | number | undefined = row.Total;
                      let maxPossible: string | number | undefined = row.Max_Possible;
                      let grade: string | number | undefined = row.Grade;

                      if (selectedCategory) {
                        const fieldSuffix = selectedCategory.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
                        const totalField = `Total_${fieldSuffix}` as keyof Row;
                        const maxField = `Max_Possible_${fieldSuffix}` as keyof Row;
                        const gradeField = `Grade_${fieldSuffix}` as keyof Row;
                        title = selectedCategory;
                        total = row[totalField] as string | number | undefined;
                        maxPossible = row[maxField] as string | number | undefined;
                        grade = row[gradeField] as string | number | undefined;
                      }

                      return (
                        <div className="mb-4 pb-3 border-b border-[#E7ECF2] dark:border-slate-900">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
                            <div className="flex items-center gap-3">
                              <div className="text-sm text-slate-600 dark:text-slate-400">
                                {Number(total || 0).toFixed(0)} / {Number(maxPossible || 0).toFixed(0)} pts
                              </div>
                              <GradeChip grade={String(grade || "N/A")} isOverall={!selectedCategory} />
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="divide-y divide-[#E7ECF2] dark:divide-white/10">
                    {/* Show AIPAC/DMFI status when AIPAC category is selected */}
                    {selectedCategory === "AIPAC" && pacData && (() => {
                      const hasAipacSupport = isAipacEndorsed(pacData);
                      const hasDmfiSupport = isDmfiEndorsed(pacData);
                      const hasAnySupport = hasAipacSupport || hasDmfiSupport;

                      console.log('AIPAC status section:', {
                        selectedCategory,
                        pacDataExists: !!pacData,
                        hasAipacSupport,
                        hasDmfiSupport,
                        hasAnySupport
                      });

                      return (
                        <div className="py-3 flex items-start gap-3 bg-slate-50 dark:bg-white/5 -mx-2 px-2 rounded mb-2">
                          <div className="mt-0.5">
                            <VoteIcon ok={!hasAnySupport} />
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                              {!hasAnySupport ? "Not supported by AIPAC or DMFI" :
                               hasAipacSupport && hasDmfiSupport ? "Supported by AIPAC and DMFI" :
                               hasAipacSupport ? "Supported by AIPAC" :
                               "Supported by DMFI"}
                            </div>
                            {row.reject_aipac_link && (
                              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                <a
                                  href={String(row.reject_aipac_link)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#4B8CFB] hover:text-[#3a7de8] underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {row.reject_aipac_commitment || "View commitment"}
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    {items.length === 0 && (
                      <div className="py-4 text-sm text-slate-500 dark:text-slate-400">
                        {selectedCategory ? `No votes/actions for ${selectedCategory}` : "No votes/actions found"}
                      </div>
                    )}
                    {items.map((it) => (
                      <div
                        key={it.col}
                        className="py-2 flex items-start gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 -mx-2 px-2 rounded transition"
                        onClick={() => {
                          if (onBillClick && it.meta) {
                            onBillClick(it.meta, it.col);
                          } else {
                            window.open(`/bill/${encodeURIComponent(it.col)}`, '_blank');
                          }
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-medium leading-5 text-slate-700 dark:text-slate-200">
                            {it.meta?.display_name || it.meta?.short_title || it.meta?.bill_number || it.col}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-300 font-light">
                            <span className="font-medium">NIAC Action Position:</span> {formatPositionLegislation(it.meta, it.val, manualScoringMeta)}
                          </div>
                          {it.meta && (it.meta as { action_types?: string }).action_types && (
                            <div className="text-xs text-slate-600 dark:text-slate-300 font-light flex items-center gap-1.5">
                              <div className="mt-0.5">
                                {it.notApplicable ? (
                                  <span className="text-lg leading-none text-slate-400 dark:text-slate-500">—</span>
                                ) : it.wasAbsent ? (
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

                                  const actionType = (it.meta as { action_types?: string })?.action_types || '';
                                  const isCosponsor = actionType.includes('cosponsor');
                                  const isVote = actionType.includes('vote');
                                  const isManual = it.meta?.type === 'MANUAL';
                                  const position = (it.meta?.position_to_score || '').toUpperCase();
                                  const isSupport = position === 'SUPPORT';
                                  const maxPoints = Number(it.meta?.points || 0);
                                  const noCosponsorBenefit = it.meta?.no_cosponsor_benefit === true ||
                                                             it.meta?.no_cosponsor_benefit === 1 ||
                                                             it.meta?.no_cosponsor_benefit === '1';

                                  // Format points display with +/- notation
                                  let pointsDisplay = '';

                                  // Special handling for preferred pairs
                                  if (isCosponsor && it.meta?.pair_key) {
                                    const pairKey = it.meta.pair_key;
                                    const isPreferred = isTrue((it.meta as Record<string, unknown>).preferred);

                                    // Find both bills in the pair
                                    let preferredCol = '';
                                    let nonPreferredCol = '';
                                    let preferredPoints = 0;
                                    let nonPreferredPoints = 0;

                                    for (const col of billCols) {
                                      const pairMeta = metaByCol.get(col);
                                      if (pairMeta?.pair_key === pairKey) {
                                        if (isTrue((pairMeta as Record<string, unknown>).preferred)) {
                                          preferredCol = col;
                                          preferredPoints = Number(pairMeta.points || 0);
                                        } else {
                                          nonPreferredCol = col;
                                          nonPreferredPoints = Number(pairMeta.points || 0);
                                        }
                                      }
                                    }

                                    // Check if they cosponsored each bill
                                    const cosponsoredPreferred = preferredCol ? (Number((row as Record<string, unknown>)[`${preferredCol}_cosponsor`] ?? 0) === 1) : false;
                                    const cosponsoredNonPreferred = nonPreferredCol ? (Number((row as Record<string, unknown>)[`${nonPreferredCol}_cosponsor`] ?? 0) === 1) : false;

                                    if (isPreferred) {
                                      // This is the preferred bill (H.Con.Res.38)
                                      if (cosponsoredPreferred) {
                                        pointsDisplay = ` (+${preferredPoints} pts)`;
                                      } else {
                                        // Didn't cosponsor preferred - show penalty
                                        pointsDisplay = ` (-${preferredPoints} pts)`;
                                      }
                                    } else {
                                      // This is the non-preferred bill (H.Con.Res.40)
                                      if (cosponsoredPreferred) {
                                        // They cosponsored the preferred bill, so they get credit here too
                                        if (cosponsoredNonPreferred) {
                                          pointsDisplay = ` (+${nonPreferredPoints} pts)`;
                                        } else {
                                          pointsDisplay = ` (+${nonPreferredPoints} pts)`; // Same points either way
                                        }
                                      } else if (cosponsoredNonPreferred) {
                                        // Only cosponsored this bill, not the preferred one
                                        pointsDisplay = ` (+${nonPreferredPoints} pts)`;
                                      } else {
                                        // Cosponsored neither
                                        pointsDisplay = ` (-${nonPreferredPoints} pts)`;
                                      }
                                    }
                                  } else if (it.val !== undefined) {
                                    if (it.val > 0) {
                                      pointsDisplay = ` (+${it.val.toFixed(0)} pts)`;
                                    } else if (it.val < 0) {
                                      pointsDisplay = ` (${it.val.toFixed(0)} pts)`;
                                    } else {
                                      // When they get 0 points, check if this is a no_cosponsor_benefit scenario
                                      // For bills we oppose with no_cosponsor_benefit, not cosponsoring gives 0 points (neutral, not a penalty)
                                      if (isCosponsor && noCosponsorBenefit && !isSupport && !it.didCosponsor) {
                                        pointsDisplay = ''; // Don't show (0 pts)
                                      } else {
                                        // Otherwise, 0 points means they missed getting points (show negative impact)
                                        pointsDisplay = maxPoints > 0 ? ` (-${maxPoints} pts)` : '';
                                      }
                                    }
                                  }

                                  // Action-specific description
                                  let actionDescription = '';

                                  // Try to get custom scoring description for manual actions with 3 tiers
                                  let customDescription = '';
                                  if (isManual && maxPoints >= 4 && !isCosponsor && !isVote && !it.notApplicable) {
                                    const displayLabel = it.meta?.display_name || it.meta?.short_title || it.col;
                                    const scoreKey = `${displayLabel}|${it.val}`;
                                    customDescription = manualScoringMeta.get(scoreKey) || '';
                                  }

                                  // Special handling for Banning Travel to Iran Committee Vote (3-tier manual action)
                                  if (it.col === 'Banning_Travel_to_Iran_Committee_Vote' && isManual) {
                                    // Check if member was on the committee (notApplicable means they weren't)
                                    if (it.notApplicable) {
                                      actionDescription = 'Not applicable, not on the committee';
                                      pointsDisplay = '';
                                    } else if (customDescription) {
                                      // Use custom description if available
                                      actionDescription = customDescription;
                                      // Points already set above
                                    } else if (it.val >= 4) {
                                      actionDescription = 'Voted against banning travel to Iran';
                                      pointsDisplay = ' (+4 pts)';
                                    } else if (it.val >= 2) {
                                      actionDescription = 'Tried to remove Iran ban but ultimately voted yes';
                                      pointsDisplay = ' (+2 pts)';
                                    } else {
                                      actionDescription = 'Voted to ban travel to Iran';
                                      pointsDisplay = ' (-4 pts)';
                                    }
                                  }
                                  // General 3-tier manual action handling (for all manual actions)
                                  else if (isManual && maxPoints >= 4 && !isCosponsor && !isVote) {
                                    if (customDescription) {
                                      // Use custom description if available
                                      actionDescription = customDescription;
                                      // Points already set above
                                    } else {
                                      // Fall back to generic descriptions
                                      if (it.val >= maxPoints) {
                                        actionDescription = 'Took strongest action';
                                      } else if (it.val >= maxPoints / 2 && it.val < maxPoints) {
                                        actionDescription = 'Took partial action';
                                      } else {
                                        actionDescription = 'Did not take action';
                                      }
                                    }
                                  }
                                  else if (isCosponsor) {
                                    // Check if this is part of a preferred pair
                                    if (it.meta?.pair_key) {
                                      const pairKey = it.meta.pair_key;
                                      const isPreferred = isTrue((it.meta as Record<string, unknown>).preferred);

                                      if (!isPreferred) {
                                        // This is the non-preferred bill
                                        // Check if they cosponsored the preferred bill
                                        let cosponsoredPreferred = false;
                                        for (const col of billCols) {
                                          const pairMeta = metaByCol.get(col);
                                          if (pairMeta?.pair_key === pairKey && isTrue((pairMeta as Record<string, unknown>).preferred)) {
                                            cosponsoredPreferred = Number((row as Record<string, unknown>)[`${col}_cosponsor`] ?? 0) === 1;
                                            break;
                                          }
                                        }

                                        if (cosponsoredPreferred && !it.didCosponsor) {
                                          actionDescription = 'Cosponsored preferred bill';
                                        } else {
                                          actionDescription = it.didCosponsor ? 'Cosponsored' : 'Has not cosponsored';
                                        }
                                      } else {
                                        // Preferred bill - standard description
                                        actionDescription = it.didCosponsor ? 'Cosponsored' : 'Has not cosponsored';
                                      }
                                    } else {
                                      // Not a paired bill - standard description
                                      actionDescription = it.didCosponsor ? 'Cosponsored' : 'Has not cosponsored';
                                    }
                                  } else if (isVote) {
                                    // For votes, determine what they actually voted based on NIAC position and whether they got points
                                    if (isSupport) {
                                      // NIAC supports: getting points = voted YES, no points = voted NO
                                      actionDescription = it.ok ? 'Voted in favor' : 'Voted against';
                                    } else {
                                      // NIAC opposes: getting points = voted NO, no points = voted YES
                                      actionDescription = it.ok ? 'Voted against' : 'Voted in favor';
                                    }
                                  } else {
                                    actionDescription = it.ok ? 'Support' : 'Oppose';
                                  }

                                  return `${actionDescription}${pointsDisplay}`;
                                })()}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>
                ) : null}
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
