"use client";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import clsx from "clsx";
import type { Row, Meta } from "@/lib/types";
import {
  partyBadgeStyle,
  partyLabel,
  stateCodeOf,
  chamberColor,
  inferChamber,
  isTrue,
  isGradeIncomplete,
  getPhotoUrl,
  gradeColor
} from "@/lib/utils";
import {
  PacData,
  loadPacData,
  isAipacEndorsed,
  isDmfiEndorsed
} from "@/lib/pacData";
import { GradeChip, VoteIcon } from "@/components/GradeChip";
import { MiniDistrictMap } from "@/components/MiniDistrictMap";
import { loadSentenceRules, generateSentencesSync, Sentence } from "@/lib/generateSentences";

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
  const [pacDataLoaded, setPacDataLoaded] = useState(false);
  const [sentenceRules, setSentenceRules] = useState<Awaited<ReturnType<typeof loadSentenceRules>>>([]);
  const [showExpandedMap, setShowExpandedMap] = useState(false);
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Load sentence rules from CSV
  useEffect(() => {
    loadSentenceRules().then(setSentenceRules);
  }, []);

  // Build OG image URL with member data as params
  const getOgImageUrl = useCallback(() => {
    const fullName = String(row.full_name || '');
    const commaIdx = fullName.indexOf(',');
    const displayName = commaIdx > -1
      ? `${fullName.slice(commaIdx + 1).trim()} ${fullName.slice(0, commaIdx).trim()}`
      : fullName;

    const chamber = row.chamber === 'SENATE' ? 'Senator' : 'Representative';
    const party = row.party === 'Democratic' ? 'D' : row.party === 'Republican' ? 'R' : 'I';
    const location = row.chamber === 'SENATE' ? row.state : row.district ? `${row.state}-${row.district}` : row.state;

    // Calculate PAC money for sentence generation
    // For House: use 2024 (last election)
    // For Senate: use 2024/2022 (last election) and 2026 (next election) separately
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

    // Generate sentences based on voting record using CSV rules
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

    return `/api/og/member/${row.bioguide_id}?${params.toString()}`;
  }, [row, pacData, pacDataLoaded, sentenceRules]);

  const handleDownloadImage = useCallback(() => {
    // Wait for PAC data to load before generating graphic
    if (!pacDataLoaded) {
      return;
    }

    // Navigate to share page with the same params
    const fullName = String(row.full_name || '');
    const commaIdx = fullName.indexOf(',');
    const displayName = commaIdx > -1
      ? `${fullName.slice(commaIdx + 1).trim()} ${fullName.slice(0, commaIdx).trim()}`
      : fullName;

    const chamber = row.chamber === 'SENATE' ? 'Senator' : 'Representative';
    const party = row.party === 'Democratic' ? 'D' : row.party === 'Republican' ? 'R' : 'I';
    const location = row.chamber === 'SENATE' ? row.state : row.district ? `${row.state}-${row.district}` : row.state;

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
  }, [row, pacData, pacDataLoaded, sentenceRules]);

  // Scroll to actions section on mobile when category is clicked
  const scrollToActions = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 900 && actionsRef.current && modalRef.current) {
      // Small delay to ensure layout has settled
      setTimeout(() => {
        const element = actionsRef.current;
        const modal = modalRef.current;
        if (!element || !modal) return;

        // Get element position relative to modal
        const elementRect = element.getBoundingClientRect();
        const modalRect = modal.getBoundingClientRect();
        const relativeTop = elementRect.top - modalRect.top;

        // Account for sticky headers: navigation (60px) + category header (~70px) + padding (20px)
        const offset = 150;

        // Scroll modal to show element below sticky headers
        modal.scrollTo({
          top: modal.scrollTop + relativeTop - offset,
          behavior: 'smooth'
        });
      }, 100);
    }
  };

  // When opening from AIPAC map, activate AIPAC section
  useEffect(() => {
    if (initialCategory === "AIPAC") {
      setShowAipacSection(true);
    }
  }, [initialCategory]);

  // Scroll to actions section when initialCategory is provided
  useEffect(() => {
    if (initialCategory && actionsRef.current) {
      // Small delay to ensure layout has settled
      setTimeout(() => {
        actionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
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
      setPacDataLoaded(true);
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

  // Track scroll position to show/hide sticky header on mobile
  useEffect(() => {
    const modalEl = modalRef.current;
    if (!modalEl) return;

    const handleScroll = () => {
      // Only show sticky header on mobile (below 900px) and when scrolled past 200px
      if (window.innerWidth < 900) {
        setShowStickyHeader(modalEl.scrollTop > 200);
      } else {
        setShowStickyHeader(false);
      }
    };

    modalEl.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);

    return () => {
      modalEl.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
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

        // Check if member was not in office for this vote
        const notInOfficeCol = `${c}_not_in_office`;
        const wasNotInOffice = Number((row as Record<string, unknown>)[notInOfficeCol] ?? 0) === 1;

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
          wasNotInOffice,
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
      <div className="fixed inset-2 min-[900px]:inset-10 z-[110] flex items-start justify-center overflow-hidden">
        <div ref={modalRef} className="relative w-full max-w-5xl rounded-2xl border border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-slate-800 shadow-xl overflow-auto max-h-full min-[900px]:flex min-[900px]:flex-col min-[900px]:h-[90vh] min-[900px]:overflow-hidden">
          {/* Floating navigation buttons - sticky at top */}
          <div className="sticky top-0 z-50 flex justify-between items-center p-2 pointer-events-none bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm">
            {/* Left side - Back button or mobile header */}
            <div className="pointer-events-auto flex items-center gap-2">
              {onBack && (
                <button
                  className="p-2 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 bg-white dark:bg-slate-800 shadow-sm"
                  onClick={onBack}
                  title="Back"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
              )}
              {/* Mobile sticky header content - only shows when scrolled */}
              {showStickyHeader && (
                <div className="min-[900px]:hidden ml-2">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight">
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
                  <div className="text-[10px] text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mt-0.5">
                    <span
                      className="px-1 py-0.5 rounded text-[9px] font-semibold"
                      style={{
                        color: '#64748b',
                        backgroundColor: `${chamberColor(row.chamber)}20`,
                      }}
                    >
                      {row.chamber === "HOUSE" ? "House" : row.chamber === "SENATE" ? "Senate" : (row.chamber || "")}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500">•</span>
                    <span
                      className="px-1 py-0.5 rounded text-[9px] font-medium border"
                      style={partyBadgeStyle(row.party)}
                    >
                      {partyLabel(row.party)}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500">•</span>
                    <span className="text-[10px]">
                      {row.chamber === "SENATE"
                        ? stateCodeOf(row.state)
                        : row.district
                          ? `${stateCodeOf(row.state)}-${row.district}`
                          : `${stateCodeOf(row.state)}-At Large`
                      }
                    </span>
                  </div>
                </div>
              )}
            </div>
            {/* Right side - Other buttons */}
            <div className="flex gap-2 pointer-events-auto">
              {/* Generate Image button - hidden for incomplete members */}
              {!isGradeIncomplete(row.bioguide_id) && (
                <button
                  className="p-2 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 bg-white dark:bg-slate-800 shadow-sm"
                  onClick={handleDownloadImage}
                  title="Generate Shareable Image"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
              )}
              <button
                className="p-2 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 bg-white dark:bg-slate-800 shadow-sm"
                onClick={() => window.open(`/member/${row.bioguide_id}`, "_blank")}
                title="Open in new tab"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
              <button
                className="p-2 rounded-lg border border-[#E7ECF2] dark:border-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 bg-white dark:bg-slate-800 shadow-sm"
                onClick={onClose}
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Header */}
          <div className="flex flex-col p-6 pt-10 min-[900px]:pt-6 border-b border-[#E7ECF2] dark:border-slate-900 bg-white dark:bg-slate-800 relative -mt-12 min-[900px]:flex-shrink-0">
            {/* Three column layout on wide screens */}
            <div className={clsx("flex flex-col min-[900px]:flex-row min-[900px]:gap-4", onBack ? "min-[900px]:pr-44" : "min-[900px]:pr-36")}>
              {/* Column 1: Photo */}
              <div className="flex flex-col gap-3 items-center min-[900px]:items-start mb-2 min-[900px]:mb-0 mt-2 min-[900px]:mt-6">
                {row.bioguide_id ? (
                  <div className="relative group/photo">
                    <img
                      src={getPhotoUrl(String(row.bioguide_id), '450x550') || String(row.photo_url || '')}
                      alt=""
                      loading="lazy"
                      className="h-32 w-32 flex-shrink-0 rounded-full object-cover bg-slate-200 dark:bg-white/10 border-[7px] border-solid"
                      style={row.Grade ? { borderColor: gradeColor(String(row.Grade)) } : undefined}
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.dataset.fallback && row.photo_url) {
                          target.dataset.fallback = '1';
                          target.src = String(row.photo_url);
                        }
                      }}
                    />
                    {/* Hover overlay with Generate Image button */}
                    {!isGradeIncomplete(row.bioguide_id) && (
                      <button
                        onClick={handleDownloadImage}
                        className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover/photo:opacity-100 transition-opacity cursor-pointer"
                        title="Generate shareable image"
                      >
                        <div className="flex flex-col items-center gap-1 text-white">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-xs font-medium">Generate</span>
                        </div>
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    className="h-32 w-32 flex-shrink-0 rounded-full bg-slate-300 dark:bg-white/10 border-[7px] border-solid"
                    style={row.Grade ? { borderColor: gradeColor(String(row.Grade)) } : undefined}
                  />
                )}
              </div>

              {/* Column 2: Member info */}
              <div className="flex-1 flex flex-col items-center min-[900px]:items-start min-w-0 mb-2 min-[900px]:mb-0 min-[900px]:mr-4 mt-0 min-[900px]:mt-6">
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
                {/* Name */}
                <div className="text-[27px] font-semibold text-slate-900 dark:text-slate-100 leading-tight mb-2">
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

                {/* Bio info */}
                <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-2 mb-3">
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
                  <span className="text-slate-400 dark:text-slate-500">•</span>
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[11px] font-medium border"
                    style={partyBadgeStyle(row.party)}
                  >
                    {partyLabel(row.party)}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">•</span>
                  {/* District - clickable to open expanded map */}
                  <button
                    onClick={() => setShowExpandedMap(true)}
                    className="text-[#4B8CFB] hover:underline cursor-pointer"
                  >
                    {row.chamber === "SENATE"
                      ? stateCodeOf(row.state)
                      : row.district
                        ? `${stateCodeOf(row.state)}-${row.district}`
                        : `${stateCodeOf(row.state)}-At Large`
                    }
                  </button>
                </div>

                {/* Birth year, age, and years in office */}
                {(row.birth_year || row.age || row.years_in_office !== undefined) && (
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                    {(row.birth_year || row.age) && (
                      <>
                        <span className="font-medium">Born:</span>{" "}
                        {row.birth_year && <span>{row.birth_year}</span>}
                        {row.age && <span> ({row.age})</span>}
                      </>
                    )}
                    {row.years_in_office !== undefined && (
                      <>
                        {(row.birth_year || row.age) && <span> • </span>}
                        <span className="font-medium">Years in office:</span> {Number(row.years_in_office) === 0 ? 'Freshman' : row.years_in_office}
                      </>
                    )}
                  </div>
                )}

                {/* Washington office phone */}
                {row.office_phone && (
                  <a
                    href={`tel:${row.office_phone}`}
                    className="text-xs text-slate-700 dark:text-slate-200 text-center min-[900px]:text-left flex items-center justify-center min-[900px]:justify-start gap-1.5 hover:text-[#4B8CFB] transition-colors"
                  >
                    <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>{row.office_phone}</span>
                  </a>
                )}

              </div>

              {/* Column 3: Map (only on wide screens) */}
              <div className="hidden min-[1075px]:block min-[1075px]:ml-12 min-[1075px]:mt-8">
                {row.state && <MiniDistrictMap member={row} />}
              </div>
            </div>
          </div>

          {/* Content - 2 Column Layout */}
          <div className="p-4 min-[900px]:p-6 min-[900px]:flex-1 min-[900px]:overflow-hidden">
            <div className="flex flex-col min-[900px]:flex-row gap-6 items-start min-[900px]:h-full min-[900px]:overflow-hidden">
              {/* Left Column: Issue Grade Filters (1/3 width on desktop, full width on mobile) */}
              <div className="w-full min-[900px]:w-1/3 min-[900px]:flex-shrink-0 flex flex-col gap-2 min-[900px]:overflow-y-auto min-[900px]:h-full" style={{ gap: 'clamp(0.25rem, 1vh, 0.375rem)' }}>
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
                    "rounded-lg border p-3 text-left transition w-full min-[900px]:flex-shrink flex items-center",
                    hasVotesActions ? "cursor-pointer" : "cursor-default",
                    selectedCategory === null && !showAipacSection && hasVotesActions
                      ? "border-[#4B8CFB] bg-[#4B8CFB]/10 dark:bg-[#4B8CFB]/20"
                      : "border-[#E7ECF2] dark:border-slate-900 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10"
                  )}
                  style={{ padding: 'clamp(0.5rem, 1.5vh, 0.75rem)', minHeight: '5rem' }}
                >
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200">All Issues</div>
                    <GradeChip grade={isGradeIncomplete(row.bioguide_id) ? "Inc" : String(row.Grade || "N/A")} isOverall={true} />
                  </div>
                </button>

                {categories.filter(cat => cat !== "AIPAC").map((category) => {
                  const fieldSuffix = category.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
                  const gradeField = `Grade_${fieldSuffix}` as keyof Row;

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
                        "rounded-lg border p-3 text-left transition w-full min-[900px]:flex-shrink flex items-center",
                        hasVotesActions ? "cursor-pointer" : "cursor-default",
                        selectedCategory === category && hasVotesActions
                          ? "border-[#4B8CFB] bg-[#4B8CFB]/10 dark:bg-[#4B8CFB]/20"
                          : "border-[#E7ECF2] dark:border-slate-900 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10"
                      )}
                      style={{ padding: 'clamp(0.5rem, 1.5vh, 0.75rem)', minHeight: '5rem' }}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{category}</div>
                        <GradeChip grade={isGradeIncomplete(row.bioguide_id) ? "Inc" : String(row[gradeField] || "N/A")} />
                      </div>
                    </button>
                  );
                })}

                {/* AIPAC/DMFI Endorsement card */}
                {(() => {
                  // Check both reject fields for custom commitment
                  const hasRejectCommitment = !!(
                    (row.reject_commitment && String(row.reject_commitment).trim()) ||
                    (row.reject_aipac_commitment && String(row.reject_aipac_commitment).trim())
                  );
                  const aipac = isAipacEndorsed(pacData);
                  const dmfi = isDmfiEndorsed(pacData);

                  // If they have a reject commitment, they're "not supported" (good)
                  const isGood = hasRejectCommitment || (!aipac && !dmfi);

                  return (
                    <button
                      onClick={() => {
                        setShowAipacSection(true);
                        setSelectedCategory(null);
                        scrollToActions();
                      }}
                      className={clsx(
                        "rounded-lg border p-3 text-left transition w-full min-[900px]:flex-shrink flex items-center",
                        showAipacSection
                          ? "border-[#4B8CFB] bg-[#4B8CFB]/10 dark:bg-[#4B8CFB]/20 cursor-pointer"
                          : "border-[#E7ECF2] dark:border-slate-900 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                      )}
                      style={{ padding: 'clamp(0.5rem, 1.5vh, 0.75rem)', minHeight: '5rem' }}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {isGood ? "Not supported by AIPAC or DMFI" :
                           aipac && dmfi ? "Supported by AIPAC & DMFI" :
                           aipac ? "Supported by AIPAC" :
                           "Supported by DMFI"}
                        </div>
                        <VoteIcon ok={isGood} size="chip" />
                      </div>
                    </button>
                  );
                })()}
              </div>

              {/* Right Column: Votes & Actions + AIPAC Support (2/3 width on desktop, full width on mobile) */}
              <div ref={actionsRef} className="w-full min-[900px]:flex-1 space-y-6 min-[900px]:overflow-y-auto min-[900px]:pr-2 min-[900px]:h-full">
                {/* Show AIPAC Support when AIPAC/DMFI button is clicked */}
                {showAipacSection ? (
                  <div>
                    {/* AIPAC/DMFI Header */}
                    <div className="sticky top-[60px] min-[900px]:static z-30 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm mb-4 pb-3 pt-2 border-b border-[#E7ECF2] dark:border-slate-900 -mx-2 px-2 min-[900px]:mx-0 min-[900px]:px-0">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">AIPAC/DMFI Support</h3>
                    </div>

                    {/* AIPAC/DMFI Content */}
                    {(() => {
                      const aipac = isAipacEndorsed(pacData);
                      const dmfi = isDmfiEndorsed(pacData);
                      const hasSupport = aipac || dmfi;
                      // Custom reject commitment means they're "good" even if they have support data
                      const hasRejectCommitment = !!(row.reject_aipac_commitment && String(row.reject_aipac_commitment).trim());
                      const isGood = hasRejectCommitment || !hasSupport;

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
                              <VoteIcon ok={isGood} small />
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
                      let grade: string | number | undefined = row.Grade;
                      let total = Number(row.Total || 0).toFixed(0);
                      let maxPossible = Number(row.Max_Possible || 0).toFixed(0);

                      if (selectedCategory) {
                        const fieldSuffix = selectedCategory.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
                        const gradeField = `Grade_${fieldSuffix}` as keyof Row;
                        const totalField = `Total_${fieldSuffix}` as keyof Row;
                        const maxField = `Max_Possible_${fieldSuffix}` as keyof Row;
                        title = selectedCategory;
                        grade = row[gradeField] as string | number | undefined;
                        total = Number(row[totalField] || 0).toFixed(0);
                        maxPossible = Number(row[maxField] || 0).toFixed(0);
                      }

                      return (
                        <div className="sticky top-[60px] min-[900px]:static z-30 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm mb-4 pb-3 pt-2 border-b border-[#E7ECF2] dark:border-slate-900 -mx-2 px-2 min-[900px]:mx-0 min-[900px]:px-0">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-slate-600 dark:text-slate-400">{total}/{maxPossible}</span>
                              <GradeChip grade={isGradeIncomplete(row.bioguide_id) ? "Inc" : String(grade || "N/A")} scale={2} />
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
                            <VoteIcon ok={!hasAnySupport} small />
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
                          <div className="text-base font-medium leading-5 text-slate-700 dark:text-slate-200">
                            {it.meta?.display_name || it.col}
                          </div>
                          {it.meta?.description && (
                            <div className="text-xs text-slate-600 dark:text-slate-300 font-light mt-1">
                              {it.meta.description}
                            </div>
                          )}
                          {it.meta && (it.meta as { action_types?: string }).action_types && (
                            <div className="text-xs text-slate-600 dark:text-slate-300 font-light flex items-center gap-1.5 mt-2">
                              <div className="mt-0.5">
                                {it.notApplicable ? (
                                  <span className="text-lg leading-none text-slate-400 dark:text-slate-500">—</span>
                                ) : it.wasAbsent ? (
                                  <span className="text-lg leading-none text-slate-400 dark:text-slate-500">—</span>
                                ) : it.wasNotInOffice ? (
                                  <span className="text-lg leading-none text-slate-400 dark:text-slate-500">—</span>
                                ) : it.waiver ? (
                                  <span className="text-lg leading-none text-slate-400 dark:text-slate-500">—</span>
                                ) : (
                                  <VoteIcon ok={it.ok} small />
                                )}
                              </div>
                              <span className="font-medium">
                                {(() => {
                                  if (it.wasNotInOffice) {
                                    return "Not in office";
                                  }
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

                                    // Check if they cosponsored (or sponsored) each bill
                                    // Sponsors have positive points on main column but _cosponsor = 0
                                    const preferredMainPoints = preferredCol ? Number((row as Record<string, unknown>)[preferredCol] ?? 0) : 0;
                                    const cosponsoredPreferred = preferredCol ? (
                                      (Number((row as Record<string, unknown>)[`${preferredCol}_cosponsor`] ?? 0) === 1) ||
                                      preferredMainPoints > 0  // Sponsors have positive points
                                    ) : false;
                                    const nonPreferredMainPoints = nonPreferredCol ? Number((row as Record<string, unknown>)[nonPreferredCol] ?? 0) : 0;
                                    const cosponsoredNonPreferred = nonPreferredCol ? (
                                      (Number((row as Record<string, unknown>)[`${nonPreferredCol}_cosponsor`] ?? 0) === 1) ||
                                      nonPreferredMainPoints > 0  // Sponsors have positive points
                                    ) : false;

                                    if (isPreferred) {
                                      // This is the preferred bill (H.Con.Res.38)
                                      if (cosponsoredPreferred) {
                                        // Use actual earned points (may include sponsor bonus)
                                        const earnedPoints = it.val > 0 ? it.val : preferredPoints;
                                        pointsDisplay = ` (+${earnedPoints} pts)`;
                                      } else {
                                        // Didn't cosponsor preferred - show penalty
                                        pointsDisplay = ` (-${preferredPoints} pts)`;
                                      }
                                    } else {
                                      // This is the non-preferred bill (H.Con.Res.40)
                                      if (cosponsoredPreferred) {
                                        // They cosponsored the preferred bill, so they get credit here too
                                        // Use actual earned points (may include sponsor bonus)
                                        const earnedPoints = it.val > 0 ? it.val : nonPreferredPoints;
                                        pointsDisplay = ` (+${earnedPoints} pts)`;
                                      } else if (cosponsoredNonPreferred) {
                                        // Only cosponsored this bill, not the preferred one
                                        // Use actual earned points (may include sponsor bonus)
                                        const earnedPoints = it.val > 0 ? it.val : nonPreferredPoints;
                                        pointsDisplay = ` (+${earnedPoints} pts)`;
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
                                        // Check if they cosponsored (or sponsored) the preferred bill
                                        let supportedPreferred = false;
                                        for (const col of billCols) {
                                          const pairMeta = metaByCol.get(col);
                                          if (pairMeta?.pair_key === pairKey && isTrue((pairMeta as Record<string, unknown>).preferred)) {
                                            // Check both cosponsor status AND main column points (for sponsors)
                                            const didCosponsorPreferred = Number((row as Record<string, unknown>)[`${col}_cosponsor`] ?? 0) === 1;
                                            const hasPreferredPoints = Number((row as Record<string, unknown>)[col] ?? 0) > 0;
                                            supportedPreferred = didCosponsorPreferred || hasPreferredPoints;
                                            break;
                                          }
                                        }

                                        // Check if member is the sponsor of this bill
                                        const isSponsor = it.meta?.sponsor_bioguide_id === row.bioguide_id;

                                        if (supportedPreferred && !it.didCosponsor && !isSponsor) {
                                          actionDescription = 'Supported preferred bill';
                                        } else if (it.didCosponsor) {
                                          actionDescription = 'Cosponsored';
                                        } else if (isSponsor) {
                                          actionDescription = 'Sponsored';
                                        } else {
                                          actionDescription = 'Has not cosponsored';
                                        }
                                      } else {
                                        // Preferred bill - check for sponsor
                                        const isSponsor = it.meta?.sponsor_bioguide_id === row.bioguide_id;
                                        if (it.didCosponsor) {
                                          actionDescription = 'Cosponsored';
                                        } else if (isSponsor) {
                                          actionDescription = 'Sponsored';
                                        } else {
                                          actionDescription = 'Has not cosponsored';
                                        }
                                      }
                                    } else {
                                      // Not a paired bill - check for sponsor
                                      const isSponsor = it.meta?.sponsor_bioguide_id === row.bioguide_id;
                                      if (it.didCosponsor) {
                                        actionDescription = 'Cosponsored';
                                      } else if (isSponsor) {
                                        actionDescription = 'Sponsored';
                                      } else {
                                        actionDescription = 'Has not cosponsored';
                                      }
                                    }
                                  } else if (isVote) {
                                    // Check if member is the sponsor of this bill
                                    const isSponsor = it.meta?.sponsor_bioguide_id === row.bioguide_id;
                                    if (isSponsor) {
                                      actionDescription = 'Sponsor';
                                    } else {
                                      // Check for "Voted Present" (partial points, between 0 and full points)
                                      const votedPresent = it.val > 0 && it.val < maxPoints;
                                      if (votedPresent) {
                                        actionDescription = 'Voted Present';
                                      } else if (isSupport) {
                                        // NIAC supports: getting points = voted YES, no points = voted NO
                                        actionDescription = it.ok ? 'Voted in favor' : 'Voted against';
                                      } else {
                                        // NIAC opposes: getting points = voted NO, no points = voted YES
                                        actionDescription = it.ok ? 'Voted against' : 'Voted in favor';
                                      }
                                    }
                                  } else {
                                    actionDescription = it.ok ? 'Support' : 'Oppose';
                                  }

                                  return `${actionDescription}${pointsDisplay}`;
                                })()}
                              </span>
                              {/* Category chip - hide on mobile when category is selected */}
                              {it.meta?.categories && (
                                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hidden min-[900px]:inline">
                                  {it.meta.categories.split(';')[0]?.trim()}
                                </span>
                              )}
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

      {/* Expanded map modal - triggered by clicking district */}
      {showExpandedMap && row.state && (
        <div className="contents">
          <MiniDistrictMap
            member={row}
            initialExpanded={true}
            onClose={() => setShowExpandedMap(false)}
          />
        </div>
      )}
    </>
  );
}
