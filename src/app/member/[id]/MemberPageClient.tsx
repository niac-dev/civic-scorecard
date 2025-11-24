"use client";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { loadData } from "@/lib/loadCsv";
import type { Row, Meta } from "@/lib/types";
import { loadPacData, isAipacEndorsed, isDmfiEndorsed, type PacData } from "@/lib/pacData";
import { GRADE_COLORS, partyBadgeStyle, partyLabel, isGradeIncomplete } from "@/lib/utils";
import { GradeChip, VoteIcon } from "@/components/GradeChip";
import { BillModal } from "@/components/BillModal";
import clsx from "clsx";

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

function formatPositionDetail(meta: Meta | undefined): string {
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



export default function MemberPage() {
  const params = useParams();
  const id = params.id as string;

  const [row, setRow] = useState<Row | null>(null);
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [billCols, setBillCols] = useState<string[]>([]);
  const [metaByCol, setMetaByCol] = useState<Map<string, Meta>>(new Map());
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBill, setSelectedBill] = useState<{ meta: Meta; column: string } | null>(null);
  const [districtOfficesExpanded, setDistrictOfficesExpanded] = useState<boolean>(false);
  const [committeesExpanded, setCommitteesExpanded] = useState<boolean>(false);
  const [gradesExpanded, setGradesExpanded] = useState<boolean>(true);
  const [votesActionsExpanded, setVotesActionsExpanded] = useState<boolean>(true);
  const [lobbySupportExpanded, setLobbySupportExpanded] = useState<boolean>(false);
  const [pacData, setPacData] = useState<PacData | undefined>(undefined);

  const votesActionsRef = useRef<HTMLDivElement>(null);
  const lobbySupportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const [data, pacDataMap] = await Promise.all([loadData(), loadPacData()]);
      const { rows, columns, metaByCol: meta, categories: cats } = data;

      // Find the member by bioguide_id
      const member = rows.find((r) => r.bioguide_id === id);
      if (!member) {
        console.error("Member not found:", id);
        return;
      }

      setRow(member);
      setAllRows(rows);
      setMetaByCol(meta);
      setCategories(cats);
      setPacData(pacDataMap.get(id));

      // Filter columns by chamber (don't filter by category for member page)
      // Include bills voted on in both chambers
      const filtered = columns.filter((c) => {
        const m = meta.get(c);
        const ch = inferChamber(m, c);

        // Check if voted in both chambers
        const voteTallies = (m?.vote_tallies || "").toLowerCase();
        const hasHouseVote = voteTallies.includes("house");
        const hasSenateVote = voteTallies.includes("senate");
        const votedInBothChambers = hasHouseVote && hasSenateVote;

        return !ch || ch === member.chamber || votedInBothChambers;
      });

      setBillCols(filtered);
    })();
  }, [id]);

  if (!row) {
    return <div className="p-8">Loading...</div>;
  }

  const chamberTag =
    row.chamber === "HOUSE" ? "House" : row.chamber === "SENATE" ? "Senate" : (row.chamber || "");

  const allItems = billCols
    .map((col) => {
      const meta = metaByCol.get(col);
      const inferred = inferChamber(meta, col);

      // Check if this bill was voted on in both chambers
      const voteTallies = (meta?.vote_tallies || "").toLowerCase();
      const hasHouseVote = voteTallies.includes("house");
      const hasSenateVote = voteTallies.includes("senate");
      const votedInBothChambers = hasHouseVote && hasSenateVote;

      // Only filter by chamber if not voted in both chambers
      let na = !votedInBothChambers && inferred && inferred !== row.chamber;
      const raw = (row as Record<string, unknown>)[col];
      const val = Number(raw ?? 0);

      // Check if member was not in office for this vote
      const notInOfficeCol = `${col}_not_in_office`;
      const wasNotInOffice = Number((row as Record<string, unknown>)[notInOfficeCol] ?? 0) === 1;

      // For manual actions (like committee votes or amendments), null/undefined/empty means not applicable
      if (meta?.type === 'MANUAL' && (raw === null || raw === undefined || raw === '')) {
        na = true;
      }

      let waiver = false;
      const isPreferred = meta ? isTrue((meta as Record<string, unknown>).preferred) : false;
      if (!na && meta?.pair_key && !isPreferred && !(val > 0)) {
        for (const other of billCols) {
          if (other === col) continue;
          const m2 = metaByCol.get(other);
          if (m2?.pair_key === meta.pair_key && isTrue((m2 as Record<string, unknown>).preferred)) {
            const v2 = Number((row as Record<string, unknown>)[other] ?? 0);
            if (v2 > 0) { waiver = true; break; }
          }
        }
      }

      return {
        col,
        meta,
        na,
        ok: !na && val > 0,
        waiver,
        wasNotInOffice,
        label: meta?.display_name || meta?.short_title || meta?.bill_number || col,
        stance: meta?.position_to_score || "",
        categories: (meta?.categories || "").split(";").map(c => c.trim()).filter(Boolean),
        val
      };
    })
    .filter((it) => !it.na && !it.wasNotInOffice)
    .sort((a, b) => {
      // Sort by first category alphabetically
      const catA = a.categories[0] || "";
      const catB = b.categories[0] || "";
      const catCompare = catA.localeCompare(catB);
      if (catCompare !== 0) return catCompare;

      // Then sort alphabetically by label
      return a.label.localeCompare(b.label);
    });

  const items = selectedCategory
    ? allItems.filter(it => it.categories.some(c => c === selectedCategory))
    : allItems;

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        body {
          background: #F7F8FA !important;
        }
        .card {
          background: white !important;
          color: #1e293b !important;
        }
        * {
          color-scheme: light !important;
        }
        @media print {
          body {
            background: white !important;
          }
        }
      `}} />
      <div className="min-h-screen bg-[#F7F8FA] p-4 md:p-6">
        <div className="max-w-6xl mx-auto min-w-[768px]">
          <div className="card bg-white overflow-visible flex flex-col">
            {/* Header */}
          <div className="p-6 border-b border-[#E7ECF2] bg-white">
            <div className="flex items-start gap-4 mb-4">
              {row.photo_url ? (
                <img
                  src={String(row.photo_url)}
                  alt=""
                  className="h-32 w-32 flex-shrink-0 rounded-full object-cover bg-slate-200"
                />
              ) : (
                <div className="h-32 w-32 flex-shrink-0 rounded-full bg-slate-300" />
              )}
              <div className="flex-1 min-w-0 mr-4">
                <div className="text-[30px] font-bold text-slate-900 leading-tight mb-2">
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
                <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2 mb-3">
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold"
                    style={{
                      color: "#64748b",
                      backgroundColor: `${chamberColor(row.chamber)}20`,
                    }}
                  >
                    {chamberTag}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[11px] font-medium border"
                    style={partyBadgeStyle(row.party)}
                  >
                    {partyLabel(row.party)}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span>{stateCodeOf(row.state)}{row.district ? `-${row.district}` : ""}</span>
                </div>

                {/* Birth year, age, and years in office */}
                {(row.birth_year || row.age || row.years_in_office !== undefined) && (
                  <div className="text-xs text-slate-600 mb-3">
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

                {/* Committee Assignments */}
                {(() => {
                  const filteredCommittees = row.committees
                    ? row.committees.split(";")
                        .map(c => c.trim())
                        .filter(c => c.startsWith("House") || c.startsWith("Senate") || c.startsWith("Joint"))
                    : [];

                  return filteredCommittees.length > 0 ? (
                    <div className="mb-3">
                      <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
                        Committee Assignments
                      </div>
                      <div className="text-xs text-slate-700 space-y-0.5">
                        {filteredCommittees.map((committee, idx) => (
                          <div key={idx}>{committee}</div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>

              <div className="flex flex-col items-center justify-center">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Grade</div>
                <GradeChip grade={isGradeIncomplete(row.bioguide_id) ? "Inc" : String(row.Grade || "N/A")} size="xl" />
              </div>

              <div className="flex items-center gap-2 print:hidden ml-12">
                <button
                  className="chip-outline text-slate-700 hover:bg-slate-100"
                  onClick={() => window.print()}
                >
                  Print
                </button>
                <button
                  className="chip-outline text-slate-700 hover:bg-slate-100"
                  onClick={() => {
                    window.close();
                    setTimeout(() => {
                      window.location.href = '/';
                    }, 100);
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Contact Information Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Washington Office */}
              {(row.office_phone || row.office_address) && (
                <div>
                  <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
                    Washington Office
                  </div>
                  <div className="text-xs text-slate-700 space-y-1">
                    {row.office_phone && <div>{row.office_phone}</div>}
                    {row.office_address && <div>{row.office_address}</div>}
                  </div>
                </div>
              )}

              {/* District Offices */}
              {(() => {
                const districtOfficesList = row.district_offices
                  ? row.district_offices.split(";").map(o => o.trim()).filter(Boolean)
                  : [];

                return districtOfficesList.length > 0 ? (
                  <div>
                    <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
                      District Offices
                    </div>
                    <div className="text-xs text-slate-700 space-y-1">
                      {districtOfficesList.map((office, idx) => (
                        <div key={idx}>{office}</div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="p-6">
            {/* Issue Grades - Collapsible */}
            <div className="mb-6">
              <div
                className="text-sm font-semibold mb-3 text-slate-700 flex items-center gap-2 cursor-pointer hover:text-slate-900 transition-colors"
                onClick={() => setGradesExpanded(!gradesExpanded)}
              >
                Issue Grades
                <svg
                  viewBox="0 0 20 20"
                  className={clsx("h-4 w-4 ml-auto transition-transform", gradesExpanded && "rotate-180")}
                  aria-hidden="true"
                  role="img"
                >
                  <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            <div className={clsx("grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-3", !gradesExpanded && "hidden print:grid")}>
              {/* Overall Grade card */}
              <button
                onClick={() => {
                  setSelectedCategory(null);
                  setVotesActionsExpanded(true);
                  setTimeout(() => {
                    votesActionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 100);
                }}
                className={clsx(
                  "rounded-lg border p-3 text-left transition cursor-pointer",
                  selectedCategory === null
                    ? "border-[#4B8CFB] bg-[#4B8CFB]/10"
                    : "border-[#E7ECF2] bg-slate-50 hover:bg-slate-100"
                )}
              >
                <div className="text-xs text-slate-600 mb-1">Overall Grade</div>
                <div className="flex items-center justify-between">
                  <div className="text-xs tabular text-slate-700">
                    {Number(row.Total || 0).toFixed(0)} / {Number(row.Max_Possible || 0).toFixed(0)}
                  </div>
                  <GradeChip grade={isGradeIncomplete(row.bioguide_id) ? "Inc" : String(row.Grade || "N/A")} size="sm" />
                </div>
              </button>

              {/* Dynamic category cards */}
              {categories.filter(cat => cat !== "AIPAC").map((category) => {
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
                        ? "border-[#4B8CFB] bg-[#4B8CFB]/10"
                        : "border-[#E7ECF2] bg-slate-50 hover:bg-slate-100"
                    )}
                  >
                    <div className="text-xs text-slate-600 mb-1">{category}</div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs tabular text-slate-700">
                        {Number(row[totalField] || 0).toFixed(0)} / {Number(row[maxField] || 0).toFixed(0)}
                      </div>
                      <GradeChip grade={isGradeIncomplete(row.bioguide_id) ? "Inc" : String(row[gradeField] || "N/A")} size="sm" />
                    </div>
                  </button>
                );
              })}

              {/* Lobby Support / AIPAC Endorsement - inside grid */}
              {(() => {
                // Check both reject commitment fields
                const hasRejectCommitment = !!(row.reject_commitment && String(row.reject_commitment).trim());
                const hasRejectAipacCommitment = !!(row.reject_aipac_commitment && String(row.reject_aipac_commitment).trim());
                const rejectCommitment = String(row.reject_commitment || "").trim();
                const rejectAipacCommitment = String(row.reject_aipac_commitment || "").trim();
                const rejectLink = row.reject_commitment_link || row.reject_aipac_link;
                const aipac = isAipacEndorsed(pacData, row.aipac_supported);
                const dmfi = isDmfiEndorsed(pacData, row.dmfi_supported);

                // If they have any reject commitment, they're "good"
                const isGood = hasRejectCommitment || hasRejectAipacCommitment || (!aipac && !dmfi);

                return (
                  <button
                    onClick={() => {
                      if (!isGood && (aipac || dmfi)) {
                        setLobbySupportExpanded(true);
                        setTimeout(() => {
                          lobbySupportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                      }
                    }}
                    className={clsx(
                      "rounded-lg border p-3 text-left transition",
                      (!isGood && (aipac || dmfi))
                        ? "border-[#E7ECF2] bg-slate-50 cursor-pointer hover:bg-slate-100"
                        : "border-[#E7ECF2] bg-slate-50 cursor-default"
                    )}
                  >
                    {hasRejectCommitment ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-700">
                          {rejectLink && String(rejectLink).startsWith('http') ? (
                            <a href={String(rejectLink)} target="_blank" rel="noopener noreferrer" className="hover:text-[#4B8CFB] underline">
                              {rejectCommitment}
                            </a>
                          ) : (
                            rejectCommitment
                          )}
                        </span>
                        <VoteIcon ok={true} />
                      </div>
                    ) : hasRejectAipacCommitment ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-700">
                          {rejectLink && String(rejectLink).startsWith('http') ? (
                            <a href={String(rejectLink)} target="_blank" rel="noopener noreferrer" className="hover:text-[#4B8CFB] underline">
                              {rejectAipacCommitment}
                            </a>
                          ) : (
                            rejectAipacCommitment
                          )}
                        </span>
                        <VoteIcon ok={true} />
                      </div>
                    ) : aipac || dmfi ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-700">
                          {aipac && dmfi ? "Supported by AIPAC and DMFI" : aipac ? "Supported by AIPAC" : "Supported by DMFI"}
                        </span>
                        <VoteIcon ok={false} />
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-700">Not supported by AIPAC or DMFI</span>
                        <VoteIcon ok={true} />
                      </div>
                    )}
                  </button>
                );
              })()}
            </div>
            </div>

            {/* Votes & Actions */}
            <div className="mb-6" ref={votesActionsRef}>
              <div
                className="text-sm font-semibold mb-3 text-slate-700 flex items-center gap-2 cursor-pointer hover:text-slate-900 transition-colors"
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
              <div className={clsx("space-y-4", !votesActionsExpanded && "hidden print:block")}>
                  {(() => {
                    // Group items by category
                    const itemsByCategory = new Map<string, typeof items>();
                    items.forEach((it) => {
                      it.categories.forEach((cat) => {
                        if (!itemsByCategory.has(cat)) {
                          itemsByCategory.set(cat, []);
                        }
                        itemsByCategory.get(cat)!.push(it);
                      });
                    });

                    const sortedCategories = Array.from(itemsByCategory.keys()).sort();

                    return sortedCategories.map((category) => {
                      const categoryItems = itemsByCategory.get(category) || [];
                      const fieldSuffix = category.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
                      const gradeField = `Grade_${fieldSuffix}` as keyof Row;
                      const grade = isGradeIncomplete(row.bioguide_id) ? "Inc" : String(row[gradeField] || "N/A");

                      return (
                        <div key={category} className="rounded-lg border border-[#E7ECF2] bg-slate-50 p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="text-xs font-semibold text-slate-700">{category}</div>
                            <GradeChip grade={grade} size="large" />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 gap-3">
                            {categoryItems.map(({ col, meta, ok, waiver, label, stance, val }) => {
                              // Check if member was absent on this vote
                              const absentCol = `${col}_absent`;
                              const wasAbsent = Boolean((row as Record<string, unknown>)[absentCol]);

                              return (
                                <div key={col} className="rounded-lg border border-[#E7ECF2] bg-white p-3 cursor-pointer hover:border-[#4B8CFB] transition" onClick={() => meta && setSelectedBill({ meta, column: col })}>
                                  <div className="text-[13px] font-medium leading-5 text-slate-700 hover:text-[#4B8CFB] mb-1.5">
                                    {label}
                                  </div>
                                  <div className="text-[11px] text-slate-600 mb-1">
                                    <span className="font-medium">NIAC Action Position:</span> {formatPositionDetail(meta)}
                                  </div>
                                  {meta?.points && (
                                    <div className="text-[11px] text-slate-600 mb-1">
                                      <span className="font-medium">Points:</span> {Number(val).toFixed(0)}/{Number(meta.points).toFixed(0)}
                                    </div>
                                  )}
                                  {meta && (meta as { action_types?: string }).action_types && (
                                    <div className="text-[11px] text-slate-600 flex items-center gap-1.5 mb-1">
                                      <div className="mt-0.5">
                                        {wasAbsent ? (
                                          <span className="text-lg leading-none text-slate-400" title="Did not vote/voted present">—</span>
                                        ) : waiver ? (
                                          <span className="text-lg leading-none text-slate-400">—</span>
                                        ) : (
                                          <VoteIcon ok={ok} />
                                        )}
                                      </div>
                                      <span className="font-medium">
                                        {(() => {
                                          const actionTypes = (meta as { action_types?: string }).action_types || "";
                                          const isVote = actionTypes.includes("vote");
                                          const isCosponsor = actionTypes.includes("cosponsor");
                                          const position = (stance || "").toUpperCase();
                                          const isSupport = position === "SUPPORT";
                                          const gotPoints = val > 0;

                                          if (wasAbsent && isVote) {
                                            return <span title="Did not vote/voted present">Did Not Vote/Voted Present</span>;
                                          }

                                          if (isCosponsor) {
                                            const didCosponsor = isSupport ? gotPoints : !gotPoints;
                                            return didCosponsor ? "Cosponsored" : "Has Not Cosponsored";
                                          } else if (isVote) {
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
                                  {meta?.notes && (
                                    <div className="text-[11px] mt-1 text-slate-700">{meta.notes}</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                  {!items.length && (
                    <div className="py-8 text-center text-sm text-slate-500">
                      No relevant bills/actions for current filters.
                    </div>
                  )}
                </div>
            </div>

            {/* Support from AIPAC and Affiliates */}
            {(() => {
              const aipac = isAipacEndorsed(pacData, row.aipac_supported);
              const dmfi = isDmfiEndorsed(pacData, row.dmfi_supported);

              if (!aipac && !dmfi) return null;

              return (
              <div className="mb-6" ref={lobbySupportRef}>
                <div
                  className="text-sm font-semibold mb-3 text-slate-700 flex items-center gap-2 cursor-pointer hover:text-slate-900 transition-colors"
                  onClick={() => setLobbySupportExpanded(!lobbySupportExpanded)}
                >
                  Support from AIPAC and Affiliates
                  <svg
                    viewBox="0 0 20 20"
                    className={clsx("h-4 w-4 ml-auto transition-transform", lobbySupportExpanded && "rotate-180")}
                    aria-hidden="true"
                    role="img"
                  >
                    <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                {lobbySupportExpanded && (
                  <div className="rounded-lg border border-[#E7ECF2] bg-slate-50 p-4">
                    {pacData ? (
                      <>
                        {(() => {
                          // Check if there's ANY financial data across all years
                          const hasAnyFinancialData =
                            pacData.aipac_total_2026 > 0 || pacData.aipac_direct_amount_2026 > 0 || pacData.aipac_earmark_amount_2026 > 0 ||
                            pacData.aipac_ie_total_2026 > 0 || pacData.aipac_ie_support_2026 > 0 || pacData.dmfi_total_2026 > 0 ||
                            pacData.dmfi_direct_2026 > 0 || pacData.aipac_total_2024 > 0 || pacData.aipac_direct_amount_2024 > 0 ||
                            pacData.aipac_earmark_amount_2024 > 0 || pacData.aipac_ie_total_2024 > 0 || pacData.aipac_ie_support_2024 > 0 ||
                            pacData.dmfi_total_2024 > 0 || pacData.dmfi_direct_2024 > 0 || pacData.dmfi_ie_total_2024 > 0 ||
                            pacData.dmfi_ie_support_2024 > 0 || pacData.aipac_total_2022 > 0 || pacData.aipac_direct_amount_2022 > 0 ||
                            pacData.aipac_earmark_amount_2022 > 0 || pacData.aipac_ie_total_2022 > 0 || pacData.aipac_ie_support_2022 > 0 ||
                            pacData.dmfi_total_2022 > 0 || pacData.dmfi_direct_2022 > 0;

                          if (!hasAnyFinancialData) {
                            // No financial data, show endorsement message
                            return (
                              <div className="text-xs text-slate-700 space-y-2">
                                {aipac && (
                                  <div>
                                    <span className="font-semibold">Endorsed by AIPAC</span> (American Israel Public Affairs Committee)
                                  </div>
                                )}
                                {dmfi && (
                                  <div>
                                    <span className="font-semibold">Endorsed by DMFI</span> (Democratic Majority For Israel)
                                  </div>
                                )}
                              </div>
                            );
                          }

                          // Has financial data, show the detailed breakdown
                          return null;
                        })()}
                      </>
                    ) : null}
                    {pacData && (() => {
                      // Check if there's ANY financial data to show detailed sections
                      const hasAnyFinancialData =
                        pacData.aipac_total_2026 > 0 || pacData.aipac_direct_amount_2026 > 0 || pacData.aipac_earmark_amount_2026 > 0 ||
                        pacData.aipac_ie_total_2026 > 0 || pacData.aipac_ie_support_2026 > 0 || pacData.dmfi_total_2026 > 0 ||
                        pacData.dmfi_direct_2026 > 0 || pacData.aipac_total_2024 > 0 || pacData.aipac_direct_amount_2024 > 0 ||
                        pacData.aipac_earmark_amount_2024 > 0 || pacData.aipac_ie_total_2024 > 0 || pacData.aipac_ie_support_2024 > 0 ||
                        pacData.dmfi_total_2024 > 0 || pacData.dmfi_direct_2024 > 0 || pacData.dmfi_ie_total_2024 > 0 ||
                        pacData.dmfi_ie_support_2024 > 0 || pacData.aipac_total_2022 > 0 || pacData.aipac_direct_amount_2022 > 0 ||
                        pacData.aipac_earmark_amount_2022 > 0 || pacData.aipac_ie_total_2022 > 0 || pacData.aipac_ie_support_2022 > 0 ||
                        pacData.dmfi_total_2022 > 0 || pacData.dmfi_direct_2022 > 0;

                      if (!hasAnyFinancialData) return null;

                      return (
                      <div className="space-y-6">
                        {/* 2026 Election Section */}
                        {(() => {
                          // Only show if there's actual financial data (not just endorsement)
                          const has2026Data = pacData.aipac_total_2026 > 0 || pacData.aipac_direct_amount_2026 > 0 || pacData.aipac_earmark_amount_2026 > 0 || pacData.aipac_ie_total_2026 > 0 || pacData.aipac_ie_support_2026 > 0 || pacData.dmfi_total_2026 > 0 || pacData.dmfi_direct_2026 > 0;

                          if (!has2026Data) return null;

                          return (
                            <div>
                              <div className="text-xs font-bold text-slate-800 mb-3 pb-2 border-b border-[#E7ECF2]">2026 Election</div>
                              <div className="space-y-4">
                                {/* AIPAC 2026 */}
                                {aipac && (pacData.aipac_total_2026 > 0 || pacData.aipac_direct_amount_2026 > 0 || pacData.aipac_earmark_amount_2026 > 0 || pacData.aipac_ie_total_2026 > 0 || pacData.aipac_ie_support_2026 > 0) && (
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700 mb-2">AIPAC (American Israel Public Affairs Committee)</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {pacData.aipac_total_2026 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Total:</span>
                                          <span className="font-medium text-slate-700">${pacData.aipac_total_2026.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.aipac_direct_amount_2026 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Direct:</span>
                                          <span className="font-medium text-slate-700">${pacData.aipac_direct_amount_2026.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.aipac_earmark_amount_2026 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Earmarked:</span>
                                          <span className="font-medium text-slate-700">${pacData.aipac_earmark_amount_2026.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {(pacData.aipac_ie_total_2026 > 0 || pacData.aipac_ie_support_2026 > 0) && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Independent Expenditures:</span>
                                          <span className="font-medium text-slate-700">${(pacData.aipac_ie_total_2026 || pacData.aipac_ie_support_2026).toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* DMFI 2026 */}
                                {(pacData.dmfi_total_2026 > 0 || pacData.dmfi_direct_2026 > 0) && (
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700 mb-2">DMFI (Democratic Majority For Israel)</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {pacData.dmfi_total_2026 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Total:</span>
                                          <span className="font-medium text-slate-700">${pacData.dmfi_total_2026.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.dmfi_direct_2026 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Direct:</span>
                                          <span className="font-medium text-slate-700">${pacData.dmfi_direct_2026.toLocaleString()}</span>
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
                              <div className="text-xs font-bold text-slate-800 mb-3 pb-2 border-b border-[#E7ECF2]">2024 Election</div>
                              <div className="space-y-4">
                                {/* AIPAC 2024 */}
                                {aipac && (pacData.aipac_total_2024 > 0 || pacData.aipac_direct_amount_2024 > 0 || pacData.aipac_earmark_amount_2024 > 0 || pacData.aipac_ie_total_2024 > 0 || pacData.aipac_ie_support_2024 > 0) && (
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700 mb-2">AIPAC (American Israel Public Affairs Committee)</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {pacData.aipac_total_2024 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Total:</span>
                                          <span className="font-medium text-slate-700">${pacData.aipac_total_2024.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.aipac_direct_amount_2024 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Direct:</span>
                                          <span className="font-medium text-slate-700">${pacData.aipac_direct_amount_2024.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.aipac_earmark_amount_2024 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Earmarked:</span>
                                          <span className="font-medium text-slate-700">${pacData.aipac_earmark_amount_2024.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {(pacData.aipac_ie_total_2024 > 0 || pacData.aipac_ie_support_2024 > 0) && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Independent Expenditures:</span>
                                          <span className="font-medium text-slate-700">${(pacData.aipac_ie_total_2024 || pacData.aipac_ie_support_2024).toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* DMFI 2024 */}
                                {(pacData.dmfi_total_2024 > 0 || pacData.dmfi_direct_2024 > 0 || pacData.dmfi_ie_total_2024 > 0 || pacData.dmfi_ie_support_2024 > 0) && (
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700 mb-2">DMFI (Democratic Majority For Israel)</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {pacData.dmfi_total_2024 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Total:</span>
                                          <span className="font-medium text-slate-700">${pacData.dmfi_total_2024.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.dmfi_direct_2024 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Direct:</span>
                                          <span className="font-medium text-slate-700">${pacData.dmfi_direct_2024.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {(pacData.dmfi_ie_total_2024 > 0 || pacData.dmfi_ie_support_2024 > 0) && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Independent Expenditures:</span>
                                          <span className="font-medium text-slate-700">${(pacData.dmfi_ie_total_2024 || pacData.dmfi_ie_support_2024).toLocaleString()}</span>
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
                              <div className="text-xs font-bold text-slate-800 mb-3 pb-2 border-b border-[#E7ECF2]">2022 Election</div>
                              <div className="space-y-4">
                                {/* AIPAC 2022 */}
                                {aipac && (pacData.aipac_total_2022 > 0 || pacData.aipac_direct_amount_2022 > 0 || pacData.aipac_earmark_amount_2022 > 0 || pacData.aipac_ie_total_2022 > 0 || pacData.aipac_ie_support_2022 > 0) && (
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700 mb-2">AIPAC (American Israel Public Affairs Committee)</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {pacData.aipac_total_2022 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Total:</span>
                                          <span className="font-medium text-slate-700">${pacData.aipac_total_2022.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.aipac_direct_amount_2022 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Direct:</span>
                                          <span className="font-medium text-slate-700">${pacData.aipac_direct_amount_2022.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.aipac_earmark_amount_2022 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Earmarked:</span>
                                          <span className="font-medium text-slate-700">${pacData.aipac_earmark_amount_2022.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {(pacData.aipac_ie_total_2022 > 0 || pacData.aipac_ie_support_2022 > 0) && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Independent Expenditures:</span>
                                          <span className="font-medium text-slate-700">${(pacData.aipac_ie_total_2022 || pacData.aipac_ie_support_2022).toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* DMFI 2022 */}
                                {(pacData.dmfi_total_2022 > 0 || pacData.dmfi_direct_2022 > 0) && (
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700 mb-2">DMFI (Democratic Majority For Israel)</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {pacData.dmfi_total_2022 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Total:</span>
                                          <span className="font-medium text-slate-700">${pacData.dmfi_total_2022.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {pacData.dmfi_direct_2022 > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-600">Direct:</span>
                                          <span className="font-medium text-slate-700">${pacData.dmfi_direct_2022.toLocaleString()}</span>
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
                      );
                    })()}
                  </div>
                )}
              </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>

    {/* Bill Modal */}
    {selectedBill && (
      <BillModal
        meta={selectedBill.meta}
        column={selectedBill.column}
        rows={allRows}
        onClose={() => setSelectedBill(null)}
      />
    )}
    </>
  );
}
