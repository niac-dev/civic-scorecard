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

function inferChamber(meta: Meta | undefined, col: string): "HOUSE" | "SENATE" | "" {
  const bn = (meta?.bill_number || col || "").toString().trim();
  const explicit = (meta?.chamber || "").toString().toUpperCase();
  if (explicit === "HOUSE" || explicit === "SENATE") return explicit as "HOUSE" | "SENATE";
  if (bn.startsWith("H")) return "HOUSE";
  if (bn.startsWith("S")) return "SENATE";
  return "";
}

function GradeChip({ grade }: { grade: string }) {
  const color = grade.startsWith("A") ? "#10B981"
    : grade.startsWith("B") ? "#84CC16"
    : grade.startsWith("C") ? "#F59E0B"
    : grade.startsWith("D") ? "#F97316"
    : "#F97066";
  return (
    <span
      className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: `${color}22`, color }}
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
  const [opposers, setOpposers] = useState<Row[]>([]);
  const [selectedMember, setSelectedMember] = useState<Row | null>(null);
  const [allColumns, setAllColumns] = useState<string[]>([]);
  const [metaByCol, setMetaByCol] = useState<Map<string, Meta>>(new Map());

  useEffect(() => {
    (async () => {
      const { rows, columns, metaByCol } = await loadData();
      setAllColumns(columns);
      setMetaByCol(metaByCol);
      const billMeta = metaByCol.get(column);

      if (!billMeta) {
        console.error("Bill metadata not found:", column);
        return;
      }

      setMeta(billMeta);

      // Split members into supporters (positive score) and opposers (0 or negative)
      const support: Row[] = [];
      const oppose: Row[] = [];

      rows.forEach((row) => {
        const val = Number((row as Record<string, unknown>)[column] ?? 0);
        if (val > 0) {
          support.push(row);
        } else if (val === 0) {
          oppose.push(row);
        }
      });

      setSupporters(support.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))));
      setOpposers(oppose.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))));
    })();
  }, [column]);

  if (!meta) {
    return <div className="p-8">Loading...</div>;
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
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                  {meta.bill_number || column}
                </h1>
                <div className="text-lg text-slate-700 dark:text-slate-200 mb-2">
                  {meta.short_title}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                  <span className="font-medium">NIAC Action Position:</span> {meta.position_to_score}
                </div>
                {meta.sponsor && (
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    <span className="font-medium">Sponsor:</span> {meta.sponsor}
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
          {meta.notes && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">
                Description
              </h2>
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {meta.notes}
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

          {/* Supporters/Cosponsors */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200">
              Supporters / Cosponsors ({supporters.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {supporters.map((member) => (
                <div
                  key={member.bioguide_id}
                  className="flex items-center gap-2 p-2 rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition"
                  onClick={() => setSelectedMember(member)}
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
              ))}
              {supporters.length === 0 && (
                <div className="col-span-full text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                  No supporters found
                </div>
              )}
            </div>
          </div>

          {/* Opposers/Non-supporters */}
          <div>
            <h2 className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200">
              Did Not Support ({opposers.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {opposers.map((member) => (
                <div
                  key={member.bioguide_id}
                  className="flex items-center gap-2 p-2 rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition"
                  onClick={() => setSelectedMember(member)}
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
              ))}
              {opposers.length === 0 && (
                <div className="col-span-full text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                  No non-supporters found
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Member Popup Modal */}
      {selectedMember && (
        <MemberModal
          row={selectedMember}
          billCols={allColumns}
          metaByCol={metaByCol}
          onClose={() => setSelectedMember(null)}
        />
      )}
      </div>
    </>
  );
}

// Simplified Member Modal Component
function MemberModal({
  row,
  billCols,
  metaByCol,
  onClose,
}: {
  row: Row;
  billCols: string[];
  metaByCol: Map<string, Meta>;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/50 z-[100]"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="fixed inset-4 md:inset-10 z-[110] flex items-start justify-center overflow-auto">
        <div className="w-full max-w-5xl my-4 rounded-2xl border border-[#E7ECF2] dark:border-white/10 bg-white dark:bg-[#0B1220] shadow-xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]">
          {/* Header - Sticky */}
          <div className="flex items-center gap-3 p-6 border-b border-[#E7ECF2] dark:border-white/10 sticky top-0 bg-white dark:bg-[#0B1220] z-20">
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

            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-600 dark:text-slate-300 text-right">
                <div>Overall</div>
                <div className="tabular font-medium text-slate-700 dark:text-slate-200">
                  {Number(row.Total || 0).toFixed(0)} / {Number(row.Max_Possible || 0).toFixed(0)}
                </div>
              </div>
              <GradeChip grade={String(row.Grade || "N/A")} />
            </div>

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

          {/* Contact Information - Scrollable */}
          <div className="overflow-y-auto flex-1 p-6">
            {(row.office_phone || row.office_address || row.district_offices) && (
              <div className="mb-6">
                <div className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200">Contact Information</div>
                <div className="rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4 space-y-3">
                  {row.office_phone && (
                    <div className="text-xs">
                      <div className="font-medium text-slate-600 dark:text-slate-400 mb-1">Washington Office Phone</div>
                      <div className="text-slate-700 dark:text-slate-200">{row.office_phone}</div>
                    </div>
                  )}
                  {row.office_address && (
                    <div className="text-xs">
                      <div className="font-medium text-slate-600 dark:text-slate-400 mb-1">Washington Office Address</div>
                      <div className="text-slate-700 dark:text-slate-200">{row.office_address}</div>
                    </div>
                  )}
                  {row.district_offices && (
                    <div className="text-xs">
                      <div className="font-medium text-slate-600 dark:text-slate-400 mb-1">District Offices</div>
                      <div className="text-slate-700 dark:text-slate-200 space-y-2">
                        {row.district_offices.split(";").map((office, idx) => (
                          <div key={idx} className="pl-0">
                            {office.trim()}
                          </div>
                        ))}
                      </div>
                    </div>
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
