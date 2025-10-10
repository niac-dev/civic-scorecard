"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { loadData } from "@/lib/loadCsv";
import type { Row, Meta } from "@/lib/types";
import clsx from "clsx";

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

function GradeChip({ grade }: { grade: string }) {
  const color = grade.startsWith("A") ? "#10B981"
    : grade.startsWith("B") ? "#84CC16"
    : grade.startsWith("C") ? "#F59E0B"
    : grade.startsWith("D") ? "#F97316"
    : "#F97066";
  return <span className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium min-w-[2.75rem]"
    style={{ background: `${color}22`, color }}>{grade}</span>;
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

  useEffect(() => {
    (async () => {
      const { rows, columns, metaByCol: meta, categories: cats } = await loadData();

      // Find the member by bioguide_id
      const member = rows.find((r) => r.bioguide_id === id);
      if (!member) {
        console.error("Member not found:", id);
        return;
      }

      setRow(member);
      setMetaByCol(meta);
      setCategories(cats);

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
        label: meta?.short_title || meta?.bill_number || col,
        stance: meta?.position_to_score || "",
        categories: (meta?.categories || "").split(";").map(c => c.trim()).filter(Boolean)
      };
    })
    .filter((it) => !it.na);

  const items = selectedCategory
    ? allItems.filter(it => it.categories.some(c => c === selectedCategory))
    : allItems;

  return (
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#0B1220] p-4">
      <div className="max-w-5xl mx-auto">
        <div className="card">
          {/* Header */}
          <div className="flex items-start gap-4 p-6 border-b border-[#E7ECF2] dark:border-white/10">
            {row.photo_url ? (
              <img
                src={String(row.photo_url)}
                alt=""
                className="h-32 w-32 rounded-full object-cover bg-slate-200 dark:bg-white/10"
              />
            ) : (
              <div className="h-32 w-32 rounded-full bg-slate-300 dark:bg-white/10" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{row.full_name}</div>
              <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 mt-1">
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
            </div>

            {/* Contact Information */}
            {(row.office_phone || row.office_address) && (
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
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

            <div className="flex items-center gap-2">
              <button
                className="chip-outline text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                onClick={() => window.print()}
              >
                Print
              </button>
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
          </div>

          {/* Category Grades - Sticky */}
          <div className="sticky top-0 z-10 bg-white dark:bg-[#0B1220] border-b border-[#E7ECF2] dark:border-white/10 p-6">
            <div className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200">Category Grades</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Overall Grade card */}
              <div className="rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3">
                <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Overall Grade</div>
                <div className="flex items-center justify-between">
                  <div className="text-xs tabular text-slate-700 dark:text-slate-300">
                    {Number(row.Total || 0).toFixed(0)} / {Number(row.Max_Possible || 0).toFixed(0)}
                  </div>
                  <GradeChip grade={String(row.Grade || "N/A")} />
                </div>
              </div>

              {/* Dynamic category cards */}
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

              {/* Endorsements card */}
              <div className="rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3">
                <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Endorsements from AIPAC or aligned PACs</div>
                <div className="space-y-1">
                  {(row.aipac_supported === 1 || row.aipac_supported === '1' || isTrue(row.aipac_supported)) && (
                    <div className="flex items-center gap-1.5" title="American Israel Public Affairs Committee">
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" role="img">
                        <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                      </svg>
                      <span className="text-xs text-slate-700 dark:text-slate-300">AIPAC</span>
                    </div>
                  )}
                  {(row.dmfi_supported === 1 || row.dmfi_supported === '1' || isTrue(row.dmfi_supported)) && (
                    <div className="flex items-center gap-1.5">
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" role="img">
                        <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                      </svg>
                      <span className="text-xs text-slate-700 dark:text-slate-300">Democratic Majority For Israel</span>
                    </div>
                  )}
                  {!(row.aipac_supported === 1 || row.aipac_supported === '1' || isTrue(row.aipac_supported)) &&
                   !(row.dmfi_supported === 1 || row.dmfi_supported === '1' || isTrue(row.dmfi_supported)) && (
                    <div className="text-xs text-slate-500 dark:text-slate-500">None</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* District Offices */}
            {row.district_offices && (
              <div className="mb-6">
                <div className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200">District Offices</div>
                <div className="rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4">
                  <div className="text-xs text-slate-700 dark:text-slate-200 space-y-2">
                    {row.district_offices.split(";").map((office, idx) => (
                      <div key={idx} className="pl-0">
                        {office.trim()}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Votes & Actions */}
            <div className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">Votes & Actions</div>
            <div className="divide-y divide-[#E7ECF2] dark:divide-white/10">
              {items.map(({ col, meta, na, ok, waiver, label, stance }) => (
                <div key={col} className="py-2 flex items-start gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 -mx-2 px-2 rounded transition" onClick={() => window.open(`/bill/${encodeURIComponent(col)}`, '_blank')}>
                  <div className="mt-0.5">
                    {waiver ? (
                      <span className="text-lg leading-none text-slate-400 dark:text-slate-500">—</span>
                    ) : (
                      <VoteIcon ok={ok} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium leading-5 text-slate-700 dark:text-slate-200 hover:text-[#4B8CFB]">
                      {label}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      {na ? "Not applicable (different chamber)" : stance || ""}
                    </div>
                    {meta?.notes && (
                      <div className="text-xs mt-1 text-slate-700 dark:text-slate-200">{meta.notes}</div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(meta?.categories || "")
                        .split(";")
                        .map((c) => c.trim())
                        .filter(Boolean)
                        .map((c) => (
                          <span key={c} className="chip-xs">{c}</span>
                        ))}
                    </div>
                  </div>
                </div>
              ))}
              {!items.length && (
                <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No relevant bills/actions for current filters.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
