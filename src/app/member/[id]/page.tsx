"use client";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { loadData } from "@/lib/loadCsv";
import type { Row, Meta } from "@/lib/types";
import clsx from "clsx";
import Papa from "papaparse";

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

interface PacData {
  bioguide_id: string;
  full_name: string;
  // 2024 data
  aipac_featured: number;
  aipac_direct_amount: number;
  aipac_earmark_amount: number;
  aipac_ie_support: number;
  aipac_ie_total: number;
  aipac_total: number;
  dmfi_website: number;
  dmfi_direct: number;
  dmfi_ie_support: number;
  dmfi_ie_total: number;
  dmfi_total: number;
  // 2025 cycle
  aipac_direct_amount_2025: number;
  aipac_earmark_amount_2025: number;
  aipac_ie_support_2025: number;
  aipac_total_2025: number;
  dmfi_direct_2025: number;
  dmfi_ie_support_2025: number;
  dmfi_total_2025: number;
  // 2022 cycle
  aipac_direct_amount_2022: number;
  aipac_earmark_amount_2022: number;
  aipac_ie_support_2022: number;
  aipac_total_2022: number;
  dmfi_direct_2022: number;
  dmfi_ie_support_2022: number;
  dmfi_total_2022: number;
}

async function loadPacData(): Promise<Map<string, PacData>> {
  const [response2024, response2025, response2022] = await Promise.all([
    fetch('/data/pac_data.csv'),
    fetch('/data/pac_data_2025.csv'),
    fetch('/data/pac_data_2022.csv')
  ]);
  const [text2024, text2025, text2022] = await Promise.all([
    response2024.text(),
    response2025.text(),
    response2022.text()
  ]);

  return new Promise((resolve) => {
    // First parse 2024 data
    Papa.parse<Record<string, string>>(text2024, {
      header: true,
      skipEmptyLines: true,
      complete: (results2024) => {
        const map = new Map<string, PacData>();

        // Load 2024 data
        results2024.data.forEach((row) => {
          const bioguide_id = row.bioguide_id;
          if (!bioguide_id) return;

          map.set(bioguide_id, {
            bioguide_id,
            full_name: row.full_name || '',
            aipac_featured: parseFloat(row.aipac_featured) || 0,
            aipac_direct_amount: parseFloat(row.aipac_direct_amount) || 0,
            aipac_earmark_amount: parseFloat(row.aipac_earmark_amount) || 0,
            aipac_ie_support: parseFloat(row.aipac_ie_support) || 0,
            aipac_ie_total: parseFloat(row.aipac_ie_total) || 0,
            aipac_total: parseFloat(row.aipac_total) || 0,
            dmfi_website: parseFloat(row.dmfi_website) || 0,
            dmfi_direct: parseFloat(row.dmfi_direct) || 0,
            dmfi_ie_support: parseFloat(row.dmfi_ie_support) || 0,
            dmfi_ie_total: parseFloat(row.dmfi_ie_total) || 0,
            dmfi_total: parseFloat(row.dmfi_total) || 0,
            // Initialize 2025 data as 0
            aipac_direct_amount_2025: 0,
            aipac_earmark_amount_2025: 0,
            aipac_ie_support_2025: 0,
            aipac_total_2025: 0,
            dmfi_direct_2025: 0,
            dmfi_ie_support_2025: 0,
            dmfi_total_2025: 0,
            // Initialize 2022 data as 0
            aipac_direct_amount_2022: 0,
            aipac_earmark_amount_2022: 0,
            aipac_ie_support_2022: 0,
            aipac_total_2022: 0,
            dmfi_direct_2022: 0,
            dmfi_ie_support_2022: 0,
            dmfi_total_2022: 0,
          });
        });

        // Then parse 2025 data and merge
        Papa.parse<Record<string, string>>(text2025, {
          header: true,
          skipEmptyLines: true,
          complete: (results2025) => {
            results2025.data.forEach((row) => {
              const bioguide_id = row.bioguide_id;
              if (!bioguide_id) return;

              const existing = map.get(bioguide_id);
              if (existing) {
                existing.aipac_direct_amount_2025 = parseFloat(row.aipac_direct_amount) || 0;
                existing.aipac_earmark_amount_2025 = parseFloat(row.aipac_earmark_amount) || 0;
                existing.aipac_ie_support_2025 = parseFloat(row.aipac_ie_support) || 0;
                existing.aipac_total_2025 = parseFloat(row.aipac_total) || 0;
                existing.dmfi_direct_2025 = parseFloat(row.dmfi_direct) || 0;
                existing.dmfi_ie_support_2025 = parseFloat(row.dmfi_ie_support) || 0;
                existing.dmfi_total_2025 = parseFloat(row.dmfi_total) || 0;
              }
            });

            // Finally parse 2022 data and merge
            Papa.parse<Record<string, string>>(text2022, {
              header: true,
              skipEmptyLines: true,
              complete: (results2022) => {
                results2022.data.forEach((row) => {
                  const bioguide_id = row.bioguide_id;
                  if (!bioguide_id) return;

                  const existing = map.get(bioguide_id);
                  if (existing) {
                    existing.aipac_direct_amount_2022 = parseFloat(row.aipac_direct_amount) || 0;
                    existing.aipac_earmark_amount_2022 = parseFloat(row.aipac_earmark_amount) || 0;
                    existing.aipac_ie_support_2022 = parseFloat(row.aipac_ie_support) || 0;
                    existing.aipac_total_2022 = parseFloat(row.aipac_total) || 0;
                    existing.dmfi_direct_2022 = parseFloat(row.dmfi_direct) || 0;
                    existing.dmfi_ie_support_2022 = parseFloat(row.dmfi_ie_support) || 0;
                    existing.dmfi_total_2022 = parseFloat(row.dmfi_total) || 0;
                  }
                });

                resolve(map);
              },
            });
          },
        });
      },
    });
  });
}

// Check if member is endorsed by AIPAC based on PAC data
function isAipacEndorsed(pacData: PacData | undefined): boolean {
  if (!pacData) return false;
  return (
    pacData.aipac_featured === 1 ||
    // 2024 cycle
    pacData.aipac_direct_amount > 0 ||
    pacData.aipac_earmark_amount > 0 ||
    pacData.aipac_ie_support > 0 ||
    // 2025 cycle
    pacData.aipac_direct_amount_2025 > 0 ||
    pacData.aipac_earmark_amount_2025 > 0 ||
    pacData.aipac_ie_support_2025 > 0 ||
    // 2022 cycle
    pacData.aipac_direct_amount_2022 > 0 ||
    pacData.aipac_earmark_amount_2022 > 0 ||
    pacData.aipac_ie_support_2022 > 0
  );
}

// Check if member is endorsed by DMFI based on PAC data
function isDmfiEndorsed(pacData: PacData | undefined): boolean {
  if (!pacData) return false;

  // If DMFI has actual financial support in any cycle, return true
  if (
    pacData.dmfi_direct > 0 ||
    pacData.dmfi_ie_support > 0 ||
    pacData.dmfi_direct_2025 > 0 ||
    pacData.dmfi_ie_support_2025 > 0 ||
    pacData.dmfi_direct_2022 > 0 ||
    pacData.dmfi_ie_support_2022 > 0
  ) {
    return true;
  }

  // If DMFI website === 1 but no DMFI financial support, check if there's ANY financial support from AIPAC
  if (pacData.dmfi_website === 1) {
    // Check if they're getting AIPAC money (which would mean isAipacEndorsed returns true)
    const hasAipacFinancialSupport =
      pacData.aipac_featured === 1 ||
      // 2024 cycle
      pacData.aipac_direct_amount > 0 ||
      pacData.aipac_earmark_amount > 0 ||
      pacData.aipac_ie_support > 0 ||
      // 2025 cycle
      pacData.aipac_direct_amount_2025 > 0 ||
      pacData.aipac_earmark_amount_2025 > 0 ||
      pacData.aipac_ie_support_2025 > 0 ||
      // 2022 cycle
      pacData.aipac_direct_amount_2022 > 0 ||
      pacData.aipac_earmark_amount_2022 > 0 ||
      pacData.aipac_ie_support_2022 > 0;
    return hasAipacFinancialSupport;
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

function GradeChip({ grade, isOverall }: { grade: string; isOverall?: boolean }) {
  const color = grade.startsWith("A") ? "#050a30" // dark navy blue
    : grade.startsWith("B") ? "#30558d" // medium blue
    : grade.startsWith("C") ? "#93c5fd" // light blue
    : grade.startsWith("D") ? "#d1d5db" // medium grey
    : "#f3f4f6"; // very light grey
  const opacity = isOverall ? "FF" : "E6"; // fully opaque for overall, 90% opaque (10% transparent) for others
  const textColor = grade.startsWith("A") ? "#ffffff" // white for A grades
    : grade.startsWith("B") ? "#f3f4f6" // light grey (F pill color) for B grades
    : "#4b5563"; // dark grey for all other grades
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

export default function MemberPage() {
  const params = useParams();
  const id = params.id as string;

  const [row, setRow] = useState<Row | null>(null);
  const [billCols, setBillCols] = useState<string[]>([]);
  const [metaByCol, setMetaByCol] = useState<Map<string, Meta>>(new Map());
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [districtOfficesExpanded, setDistrictOfficesExpanded] = useState<boolean>(false);
  const [committeesExpanded, setCommitteesExpanded] = useState<boolean>(false);
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
      setMetaByCol(meta);
      setCategories(cats);
      setPacData(pacDataMap.get(id));

      // Filter columns by chamber (don't filter by category for member page)
      const filtered = columns.filter((c) => {
        const m = meta.get(c);
        const ch = inferChamber(m, c);
        return !ch || ch === member.chamber;
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
      const na = inferred && inferred !== row.chamber;
      const raw = (row as Record<string, unknown>)[col];
      const val = Number(raw ?? 0);

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
        label: meta?.display_name || meta?.short_title || meta?.bill_number || col,
        stance: meta?.position_to_score || "",
        categories: (meta?.categories || "").split(";").map(c => c.trim()).filter(Boolean),
        val
      };
    })
    .filter((it) => !it.na)
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
          <div className="card bg-white">
            {/* Header */}
          <div className="p-6 border-b border-[#E7ECF2]">
            <div className="flex items-start gap-4 mb-4">
              {row.photo_url ? (
                <img
                  src={String(row.photo_url)}
                  alt=""
                  className="h-32 w-32 rounded-full object-cover bg-slate-200"
                />
              ) : (
                <div className="h-32 w-32 rounded-full bg-slate-300" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xl font-bold text-slate-900 mb-2">{row.full_name}</div>
                <div className="text-xs text-slate-600 flex items-center gap-2 mb-3">
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold"
                    style={{
                      color: "#64748b",
                      backgroundColor: `${chamberColor(row.chamber)}20`,
                    }}
                  >
                    {chamberTag}
                  </span>
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[11px] font-medium border"
                    style={partyBadgeStyle(row.party)}
                  >
                    {partyLabel(row.party)}
                  </span>
                  <span>{stateCodeOf(row.state)}{row.district ? `-${row.district}` : ""}</span>
                </div>

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

              <div className="flex items-center gap-2 print:hidden">
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

          {/* Content */}
          <div className="p-6">
            {/* Issue Grades */}
            <div className="mb-6">
              <div className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200">Issue Grades</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <GradeChip grade={String(row.Grade || "N/A")} isOverall={true} />
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
                      <GradeChip grade={String(row[gradeField] || "N/A")} />
                    </div>
                  </button>
                );
              })}

              {/* Endorsements card */}
              {(() => {
                // Check if member has reject AIPAC commitment text (takes priority)
                const rejectCommitment = row.reject_aipac_commitment;
                const rejectLink = row.reject_aipac_link;
                const hasRejectCommitment = rejectCommitment && String(rejectCommitment).length > 10;

                const aipac = isAipacEndorsed(pacData);
                const dmfi = isDmfiEndorsed(pacData);

                return (
                  <button
                    onClick={() => {
                      if (!hasRejectCommitment && (aipac || dmfi)) {
                        setLobbySupportExpanded(true);
                        setTimeout(() => {
                          lobbySupportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                      }
                    }}
                    className={clsx(
                      "rounded-lg border p-3 text-left w-full transition",
                      (!hasRejectCommitment && (aipac || dmfi))
                        ? "border-[#E7ECF2] bg-slate-50 cursor-pointer hover:bg-slate-100"
                        : "border-[#E7ECF2] bg-slate-50 cursor-default"
                    )}
                  >
                    {hasRejectCommitment ? (
                      <div className="flex items-center gap-1.5">
                        <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden="true" role="img">
                          <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" strokeWidth="0.5" stroke="#10B981" />
                        </svg>
                        <span className="text-xs text-slate-700 font-bold">
                          {rejectLink && String(rejectLink).startsWith('http') ? (
                            <a href={String(rejectLink)} target="_blank" rel="noopener noreferrer" className="hover:text-[#4B8CFB] underline">
                              {rejectCommitment}
                            </a>
                          ) : (
                            rejectCommitment
                          )}
                        </span>
                      </div>
                    ) : aipac || dmfi ? (
                      <div className="flex items-center gap-1.5">
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" role="img">
                          <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                        </svg>
                        <span className="text-xs text-slate-700">
                          {aipac && dmfi ? "Supported by AIPAC and DMFI" : aipac ? "Supported by AIPAC" : "Supported by DMFI"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" role="img">
                          <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                        </svg>
                        <span className="text-xs text-slate-700">Not supported by AIPAC or DMFI</span>
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
              {votesActionsExpanded && (
                <div className="space-y-4">
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
                      const grade = String(row[gradeField] || "N/A");

                      return (
                        <div key={category} className="rounded-lg border border-[#E7ECF2] bg-slate-50 p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="text-xs font-semibold text-slate-700">{category}</div>
                            <GradeChip grade={grade} />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {categoryItems.map(({ col, meta, ok, waiver, label, stance, val }) => {
                              // Check if member was absent on this vote
                              const absentCol = `${col}_absent`;
                              const wasAbsent = Boolean((row as Record<string, unknown>)[absentCol]);

                              return (
                                <div key={col} className="rounded-lg border border-[#E7ECF2] bg-white p-3 cursor-pointer hover:border-[#4B8CFB] transition" onClick={() => window.open(`/bill/${encodeURIComponent(col)}`, '_blank')}>
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
              )}
            </div>

            {/* Israel Lobby Support */}
            {(() => {
              const aipac = isAipacEndorsed(pacData);
              const dmfi = isDmfiEndorsed(pacData);

              if (!aipac && !dmfi) return null;

              return (
                <div className="mb-6" ref={lobbySupportRef}>
                  <div
                    className="text-sm font-semibold mb-3 text-slate-700 flex items-center gap-2 cursor-pointer hover:text-slate-900 transition-colors"
                    onClick={() => setLobbySupportExpanded(!lobbySupportExpanded)}
                  >
                    Israel Lobby Support
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
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
