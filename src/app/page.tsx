/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";
import { useEffect, useMemo, useState } from "react";
import { loadData } from "@/lib/loadCsv";
import { useFilters } from "@/lib/store";
import type { Row, Meta } from "@/lib/types";
import USMap from "@/components/USMap";

import clsx from "clsx";

// --- States helper (dropdown + normalization) ---
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
  { code: "AS", name: "American Samoa" }, { code: "GU", name: "Guam" },
  { code: "MP", name: "Northern Mariana Islands" }, { code: "PR", name: "Puerto Rico" },
  { code: "VI", name: "U.S. Virgin Islands" },
];

const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  STATES.flatMap(({ code, name }) => [
    [name.toLowerCase(), code],
    [code.toLowerCase(), code],
  ])
);

// Normalize whatever is in the CSV to a 2-letter code when possible
function stateCodeOf(s: string | undefined): string {
  const raw = (s ?? "").trim();
  if (!raw) return "";
  const hit = NAME_TO_CODE[raw.toLowerCase()];
  return hit ?? raw.toUpperCase(); // fall back to original
}

function partyLabel(p?: string) {
  const raw = (p ?? "").trim();
  if (!raw) return "";
  const s = raw.toLowerCase();
  // normalize any form of Democratic/Democrat -> "Democrat"
  if (s.startsWith("democ")) return "Democrat";
  // Capitalize each word for other parties (e.g., "republican" -> "Republican")
  return raw
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function inferChamber(meta: Meta | undefined, col: string): "HOUSE" | "SENATE" | "" {
  const bn = (meta?.bill_number || col || "").toString().trim();
  const explicit = (meta?.chamber || "").toString().toUpperCase();
  if (explicit === "HOUSE" || explicit === "SENATE") return explicit as any;
  if (bn.startsWith("H")) return "HOUSE";
  if (bn.startsWith("S")) return "SENATE";
  return "";
}

function lastName(full?: string) {
  const s = (full || "").trim();
  if (!s) return "";
  // If "Last, First" use the part before comma
  const comma = s.indexOf(",");
  if (comma > -1) {
    return s.slice(0, comma).trim().toLowerCase();
  }
  // Else take last token, ignoring suffixes
  const parts = s.split(/\s+/);
  const maybe = parts[parts.length - 1] || "";
  // strip common suffix punctuation
  return maybe.replace(/[.,]/g, "").toLowerCase();
}

function gradeRank(g?: string): number {
  const s = String(g || "").toUpperCase().trim();
  const order = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];
  const idx = order.indexOf(s);
  return idx === -1 ? order.length : idx; // unknown grades go to the end
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

function chamberColor(ch?: string): string {
  switch (ch) {
    case "HOUSE":
      return "#b2c74a"; // blue-ish for House
    case "SENATE":
      return "#857eab"; // violet for Senate
    default:
      return "#94A3B8"; // slate fallback
  }
}


function partyBadgeStyle(p?: string) {
  const label = partyLabel(p).toLowerCase();
  const base =
    label.startsWith("rep") ? "#EF4444" : // red
    label.startsWith("dem") ? "#3B82F6" : // blue
    label.startsWith("ind") ? "#10B981" : // green
    "#94A3B8";                            // slate fallback
  return {
    color: base,
    backgroundColor: `${base}1A`, // ~10% alpha
    borderColor: `${base}66`,     // ~40% alpha
  };
}

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [metaByCol, setMeta] = useState<Map<string, Meta>>(new Map());
  const [categories, setCategories] = useState<string[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => { (async () => {
    const { rows, columns, metaByCol, categories } = await loadData();
    setRows(rows); setCols(columns); setMeta(metaByCol); setCategories(categories);
  })(); }, []);

  const f = useFilters();

  const [sortCol, setSortCol] = useState<string>("__member");
  const [sortDir, setSortDir] = useState<"GOOD_FIRST" | "BAD_FIRST">("GOOD_FIRST");

  const filtered = useMemo(() => {
    let out = rows;
    if (f.chamber) out = out.filter(r => r.chamber === f.chamber);
    if (f.party) out = out.filter(r => r.party === f.party);
    if (f.state) out = out.filter(r => stateCodeOf(r.state) === f.state);
    if (f.search) {
      const q = f.search.toLowerCase();
      out = out.filter(r => (r.full_name||"").toLowerCase().includes(q));
    }
    if (f.myLawmakers.length > 0) {
      // Fuzzy match by last name - handles middle names/initials
      out = out.filter(r => {
        const dbName = (r.full_name as string) || '';
        return f.myLawmakers.some(apiName => {
          // Extract last name from both (before the comma)
          const dbLast = dbName.split(',')[0]?.trim().toLowerCase();
          const apiLast = apiName.split(',')[0]?.trim().toLowerCase();
          return dbLast === apiLast;
        });
      });
    }
    // if (f.categories.size) {
    //   const wanted = new Set(Array.from(f.categories));
    //   const hasColInCats = (r: Row) =>
    //     cols.some(c => {
    //       const m = metaByCol.get(c);
    //       if (!m) return false;
    //       const cats = (m.categories || "").split(";").map((s:string)=>s.trim()).filter(Boolean);
    //       if (!cats.length) return false;
    //       return cats.some((cc:string)=>wanted.has(cc) && Number(r[c]) > 0);
    //     });
    //   out = out.filter(hasColInCats);
    // }
    return out;
  }, [rows, cols, f, metaByCol]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    // Sort by member last name when header "Member" is clicked
    if (sortCol === "__member") {
      const asc = sortDir === "GOOD_FIRST"; // reuse GOOD_FIRST as A→Z
      return [...filtered].sort((a, b) => {
        const la = lastName(a.full_name);
        const lb = lastName(b.full_name);
        if (la !== lb) return asc ? la.localeCompare(lb) : lb.localeCompare(la);
        return String(a.full_name || "").localeCompare(String(b.full_name || ""));
      });
    }
    // Check if sorting by any grade column
    if (sortCol.startsWith("Grade")) {
      const goodFirst = sortDir === "GOOD_FIRST"; // best grades first
      const gradeField = sortCol as keyof Row;

      return [...filtered].sort((a, b) => {
        const ra = gradeRank(String(a[gradeField] || ""));
        const rb = gradeRank(String(b[gradeField] || ""));
        if (ra !== rb) return goodFirst ? ra - rb : rb - ra;
        // tie-break by Percent (higher first when goodFirst)
        const pa = Number(a.Percent || 0);
        const pb = Number(b.Percent || 0);
        if (pa !== pb) return goodFirst ? pb - pa : pa - pb;
        // final tie-break by name
        return String(a.full_name || "").localeCompare(String(b.full_name || ""));
      });
    }
    const meta = metaByCol.get(sortCol);
    const colCh = inferChamber(meta, sortCol);
    const goodFirst = sortDir === "GOOD_FIRST";

    const rankFor = (r: Row) => {
      const val = Number((r as Record<string, unknown>)[sortCol] ?? 0);
      const notApplicable = colCh && colCh !== r.chamber;
      if (notApplicable) return 2; // always last
      const good = val > 0;
      if (goodFirst) return good ? 0 : 1; // ✓ first
      return good ? 1 : 0;                // ✕ first
    };

    return [...filtered].sort((a, b) => {
      const ra = rankFor(a), rb = rankFor(b);
      if (ra !== rb) return ra - rb;
      // tie-break by numeric value in the column (desc for GOOD_FIRST, asc for BAD_FIRST)
      const va = Number((a as Record<string, unknown>)[sortCol] ?? 0);
      const vb = Number((b as Record<string, unknown>)[sortCol] ?? 0);
      if (va !== vb) return goodFirst ? vb - va : va - vb;
      // final tie-break by name
      return String(a.full_name || "").localeCompare(String(b.full_name || ""));
    });
  }, [filtered, sortCol, sortDir, metaByCol]);

  // All columns for the member card (chamber-filtered only, not category-filtered)
  const allBillCols = useMemo(() => {
    let out = cols;

    // Chamber filter: keep only bills for the selected chamber
    if (f.chamber) {
      out = out.filter((c) => {
        const meta = metaByCol.get(c);
        const ch = inferChamber(meta, c);
        return ch === f.chamber;
      });
    }

    return out;
  }, [cols, metaByCol, f.chamber]);

  // Filtered columns for the main table view (chamber + category filtered)
  const billCols = useMemo(() => {
    // In summary mode, show no bill columns
    if (f.viewMode === "summary") {
      return [];
    }

    let out = allBillCols;

    // Category filter: keep only bills whose meta.categories intersects selected chips
    if (f.categories.size) {
      const wanted = new Set(Array.from(f.categories));
      out = out.filter((c) => {
        const m = metaByCol.get(c);
        if (!m) return false;
        const cats = String(m.categories || "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean);
        return cats.some((cc) => wanted.has(cc));
      });
    }

    return out;
  }, [allBillCols, metaByCol, f.categories, f.viewMode]);

  // Determine which grade columns to show based on selected category
  const gradeColumns = useMemo(() => {
    // In summary mode, show all category grades
    if (f.viewMode === "summary") {
      const categoryGrades = categories.map(cat => {
        const fieldSuffix = cat.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
        return {
          header: cat,
          field: `Grade_${fieldSuffix}` as keyof Row
        };
      });
      return [
        { header: "Overall Grade", field: "Grade" as keyof Row },
        ...categoryGrades
      ];
    }
    // If exactly one category is selected, show only that category's grade
    if (f.categories.size === 1) {
      const category = Array.from(f.categories)[0];
      // Replace special chars with underscores to match CSV column naming
      const fieldSuffix = category.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
      return [
        {
          header: `${category} Grade`,
          field: `Grade_${fieldSuffix}` as keyof Row
        }
      ];
    }
    // Otherwise show only total grade
    return [
      { header: "Overall Grade", field: "Grade" as keyof Row }
    ];
  }, [f.categories, f.viewMode, categories]);

  // Determine which total/max/percent fields to show based on selected category
  const scoreSuffix = useMemo(() => {
    if (f.categories.size === 1) {
      const category = Array.from(f.categories)[0];
      return category.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
    }
    return ""; // Empty suffix means overall (Total, Max_Possible, Percent)
  }, [f.categories]);

  const gridTemplate = useMemo(() => {
    // Fixed widths per column so the header background spans the full scroll width
    const billsPart = billCols.map(() => "140px").join(" ");
    const gradesPart = gradeColumns.map(() => "120px").join(" ");
    // In summary mode: member col + grade cols + endorsements col + total/max/percent
    if (f.viewMode === "summary") {
      return `280px ${gradesPart} 140px 160px 120px 100px`;
    }
    // member col + grade cols + dynamic bill cols + endorsements col + totals
    return `280px ${gradesPart} ${billsPart} 140px 160px 120px 100px`;
  }, [billCols, gradeColumns, f.viewMode]);

  // Calculate average grades per state for map coloring
  const stateColors = useMemo(() => {
    const colors: Record<string, string> = {};

    // Group members by state
    const byState: Record<string, Row[]> = {};
    rows.forEach((r) => {
      const state = stateCodeOf(r.state);
      if (!state) return;
      if (!byState[state]) byState[state] = [];
      byState[state].push(r);
    });

    // Calculate average grade for each state
    Object.entries(byState).forEach(([state, members]) => {
      const grades = members
        .map(m => gradeRank(String(m.Grade || "")))
        .filter(g => g !== 13); // exclude unknown grades

      if (grades.length === 0) {
        colors[state] = "#E5E7EB"; // gray for no data
        return;
      }

      const avgRank = grades.reduce((a, b) => a + b, 0) / grades.length;

      // Map average grade rank to color (dark navy = A, light grey = F)
      if (avgRank <= 2) { // A+ to A-
        colors[state] = "#050a30"; // dark navy blue
      } else if (avgRank <= 5) { // B+ to B-
        colors[state] = "#30558d"; // medium blue
      } else if (avgRank <= 8) { // C+ to C-
        colors[state] = "#93c5fd"; // light blue
      } else if (avgRank <= 11) { // D+ to D-
        colors[state] = "#d1d5db"; // medium grey
      } else { // F
        colors[state] = "#f3f4f6"; // very light grey
      }
    });

    return colors;
  }, [rows]);

  return (
    <div className="space-y-4">
      <Filters categories={categories} filteredCount={sorted.length} />
      {selected && (
        <LawmakerCard
          row={selected}
          billCols={allBillCols}
          metaByCol={metaByCol}
          categories={categories}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Map View */}
      {f.viewMode === "map" && (
        <div className="card p-6">
          <USMap
            stateColors={stateColors}
            onStateClick={(stateCode) => {
              f.set({ state: stateCode, viewMode: "summary" });
            }}
          />
        </div>
      )}

      {/* Table View */}
      {f.viewMode !== "map" && (
        <div className="card overflow-visible">
          <div className="overflow-auto max-h-[70vh]">
            {/* Header */}
            <div
              className="grid min-w-max sticky top-0 z-30 bg-white/70 dark:bg-slate-900/85 backdrop-blur-xl border-b border-[#E7ECF2] dark:border-white/10 shadow-sm"
              style={{
                gridTemplateColumns: gridTemplate,
              }}
            >
            <div
              className="th pl-4 sticky left-0 z-40 bg-white dark:bg-slate-900 border-r border-[#E7ECF2] dark:border-white/10 cursor-pointer group"
              onClick={() => {
                if (sortCol === "__member") {
                  setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                } else {
                  setSortCol("__member");
                  setSortDir("GOOD_FIRST");
                }
              }}
              title="Click to sort by member (toggle A→Z / Z→A)"
            >
              Member
              <span className={clsx(
                "absolute right-2 top-1.5 text-[10px]",
                sortCol === "__member" ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100"
              )}>
                {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
              </span>
            </div>
            {gradeColumns.map((gradeCol, idx) => (
              <div
                key={gradeCol.field}
                className={clsx(
                  "th text-center cursor-pointer relative group",
                  idx === gradeColumns.length - 1 && "border-r border-[#E7ECF2] dark:border-white/10"
                )}
                title={`Click to sort by ${gradeCol.header} (toggle best→worst / worst→best)`}
                onClick={() => {
                  if (sortCol === String(gradeCol.field)) {
                    setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                  } else {
                    setSortCol(String(gradeCol.field));
                    setSortDir("GOOD_FIRST");
                  }
                }}
              >
                {gradeCol.header}
                <span className={clsx(
                  "absolute right-2 top-1.5 text-[10px]",
                  sortCol === String(gradeCol.field) ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100"
                )}>
                  {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                </span>
              </div>
            ))}
            {billCols.map((c) => (
              <Header
                key={c}
                col={c}
                meta={metaByCol.get(c)}
                active={sortCol === c}
                dir={sortDir}
                onSort={() => {
                  if (sortCol === c) {
                    setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                  } else {
                    setSortCol(c);
                    setSortDir("GOOD_FIRST");
                  }
                }}
              />
            ))}
            <div className="th text-center border-r border-[#E7ECF2] dark:border-white/10">
              Endorsements from AIPAC or aligned PACs
            </div>
            {/* Sortable score headers */}
            <div
              className="th text-right pr-3 cursor-pointer relative group"
              title="Click to sort by Total (toggle high→low / low→high)"
              onClick={() => {
                const col = scoreSuffix ? `Total_${scoreSuffix}` : "Total";
                if (sortCol === col) {
                  setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                } else {
                  setSortCol(col);
                  setSortDir("GOOD_FIRST");
                }
              }}
            >
              Total Points
              <span className={clsx(
                "absolute right-2 top-1.5 text-[10px]",
                sortCol === (scoreSuffix ? `Total_${scoreSuffix}` : "Total") ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100"
              )}>
                {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
              </span>
            </div>

            <div
              className="th text-right pr-3 cursor-pointer relative group"
              title="Click to sort by Max (toggle high→low / low→high)"
              onClick={() => {
                const col = scoreSuffix ? `Max_Possible_${scoreSuffix}` : "Max_Possible";
                if (sortCol === col) {
                  setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                } else {
                  setSortCol(col);
                  setSortDir("GOOD_FIRST");
                }
              }}
            >
              Max Points
              <span className={clsx(
                "absolute right-2 top-1.5 text-[10px]",
                sortCol === (scoreSuffix ? `Max_Possible_${scoreSuffix}` : "Max_Possible") ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100"
              )}>
                {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
              </span>
            </div>

            <div
              className="th text-right pr-3 cursor-pointer relative group"
              title="Click to sort by Percent (toggle high→low / low→high)"
              onClick={() => {
                const col = scoreSuffix ? `Percent_${scoreSuffix}` : "Percent";
                if (sortCol === col) {
                  setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                } else {
                  setSortCol(col);
                  setSortDir("GOOD_FIRST");
                }
              }}
            >
              Percent
              <span className={clsx(
                "absolute right-2 top-1.5 text-[10px]",
                sortCol === (scoreSuffix ? `Percent_${scoreSuffix}` : "Percent") ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100"
              )}>
                {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
              </span>
            </div>
          </div>

          {/* Rows */}
          {sorted.map((r, i) => (
            <div
              key={i}
              className={clsx(
                "grid min-w-max transition",
                "hover:bg-slate-50 dark:hover:bg-white/5"
              )}
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {/* member + photo */}
              <div
                className="td pl-4 flex items-center gap-3 sticky left-0 z-20 bg-white dark:bg-slate-900 cursor-pointer"
                onClick={() => setSelected(r)}
                title="Click to view details"
              >
                {r.photo_url ? (
                  <img
                    src={String(r.photo_url)}
                    alt=""
                    className="h-[68px] w-[68px] rounded-full object-cover bg-slate-200 dark:bg-white/10"
                  />
                ) : (
                  <div className="h-[68px] w-[68px] rounded-full bg-slate-300 dark:bg-white/10" />
                )}
                <div className="flex flex-col justify-center">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium mb-0.5">
                    {(() => {
                      if (r.chamber === "SENATE") return "Senator";
                      if (r.chamber === "HOUSE") {
                        const delegateStates = ["AS", "DC", "GU", "MP", "PR", "VI"];
                        const state = stateCodeOf(r.state);
                        return delegateStates.includes(state) ? "Delegate" : "Representative";
                      }
                      return "";
                    })()}
                  </div>
                  <div className="font-bold text-[16px] leading-5 text-slate-800 dark:text-slate-200 mb-1">
                    {(() => {
                      const fullName = String(r.full_name || "");
                      const commaIndex = fullName.indexOf(",");
                      if (commaIndex > -1) {
                        const first = fullName.slice(commaIndex + 1).trim();
                        const last = fullName.slice(0, commaIndex).trim();
                        return `${first} ${last}`;
                      }
                      return fullName;
                    })()}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    {/* Chamber first, solid background (purple for Senate, green for House) */}
                    <span
                      className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold"
                      style={{
                        color: '#64748b',
                        backgroundColor: `${chamberColor(r.chamber)}20`,
                      }}
                    >
                      {r.chamber === "HOUSE"
                        ? "House"
                        : r.chamber === "SENATE"
                        ? "Senate"
                        : (r.chamber || "")}
                    </span>

                    {/* Party badge next, colored outline/bg by party */}
                    <span
                      className="px-1.5 py-0.5 rounded-md text-[11px] font-medium border"
                      style={partyBadgeStyle(r.party)}
                    >
                      {partyLabel(r.party)}
                    </span>

                    {/* State last */}
                    <span>{stateCodeOf(r.state)}</span>
                  </div>
                </div>
              </div>

              {gradeColumns.map((gradeCol, idx) => (
                <div
                  key={gradeCol.field}
                  className={clsx(
                    "td flex items-center justify-center",
                    idx === gradeColumns.length - 1 && "border-r border-[#E7ECF2] dark:border-white/10"
                  )}
                >
                  <GradeChip grade={String(r[gradeCol.field] || "N/A")} isOverall={idx === 0} />
                </div>
              ))}

              {/* bill columns -> binary check / x / N/A for other chamber */}
              {billCols.map((c) => {
                const valRaw = (r as Record<string, unknown>)[c];
                const val = Number(valRaw ?? 0);
                const meta = metaByCol.get(c);

                // Try to determine the chamber for this column (bill or manual action)
                const inferredChamber = inferChamber(meta, c);

                // If we can determine a chamber and it doesn't match member’s chamber -> N/A
                const notApplicable = inferredChamber && inferredChamber !== r.chamber;

                // Tooltip text
                // --- NEW: dash if this is the lesser item in a preferred pair and member hit the preferred one ---
                const showDashForPreferredPair = (() => {
                  const isPreferred = meta ? isTrue((meta as any).preferred) : false;
                  if (!meta?.pair_key || isPreferred || val > 0 || notApplicable) return false;
                  // find any other column in the same pair that is marked preferred (preferred===true) and the member scored on it
                  for (const other of billCols) {
                    if (other === c) continue;
                    const m2 = metaByCol.get(other);
                    if (m2?.pair_key === meta.pair_key && isTrue((m2 as any).preferred)) {
                      const v2 = Number((r as any)[other] ?? 0);
                      if (v2 > 0) return true; // got the preferred one → show dash here
                    }
                  }
                  return false;
                })();

                let title: string;
                if (notApplicable) {
                  title = "Not applicable (different chamber)";
                } else if (showDashForPreferredPair) {
                  title = "Not penalized: preferred item supported";
                } else if (val > 0) {
                  title = "Aligned with our stance (earned points)";
                } else {
                  title = "Not aligned with our stance (no points)";
                }

                return (
                  <div key={c} className="td pr-0 flex items-center justify-center" title={title}>
                    {notApplicable ? (
                      <span className="text-xs text-slate-400">N/A</span>
                    ) : showDashForPreferredPair ? (
                      <span className="text-lg leading-none text-slate-400">—</span>
                    ) : (
                      <VoteIcon ok={val > 0} />
                    )}
                  </div>
                );
              })}

              {/* Endorsements column */}
              <div className="td border-r border-[#E7ECF2] dark:border-white/10 px-2 flex items-center">
                {(() => {
                  const aipac = isTruthy(r.aipac_supported);
                  const dmfi = isTruthy(r.dmfi_supported);

                  if (aipac && dmfi) {
                    return (
                      <div className="flex items-center gap-1">
                        <svg viewBox="0 0 20 20" className="h-3 w-3 flex-shrink-0" aria-hidden="true" role="img">
                          <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                        </svg>
                        <span className="text-xs text-slate-800">Endorsed by AIPAC and DMFI</span>
                      </div>
                    );
                  }

                  if (aipac || dmfi) {
                    return (
                      <div className="space-y-0.5">
                        {aipac && (
                          <div className="flex items-center gap-1">
                            <svg viewBox="0 0 20 20" className="h-3 w-3 flex-shrink-0" aria-hidden="true" role="img">
                              <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                            </svg>
                            <span className="text-xs text-slate-800">Endorsed by AIPAC</span>
                          </div>
                        )}
                        {dmfi && (
                          <div className="flex items-center gap-1">
                            <svg viewBox="0 0 20 20" className="h-3 w-3 flex-shrink-0" aria-hidden="true" role="img">
                              <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                            </svg>
                            <span className="text-xs text-slate-800">Endorsed by DMFI</span>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return null;
                })()}
              </div>

              {/* Total/Max/Percent */}
              <div className="td tabular text-right pr-3 font-medium flex items-center justify-end">
                {Number(r[scoreSuffix ? `Total_${scoreSuffix}` : "Total"] || 0).toFixed(0)}
              </div>
              <div className="td tabular text-right pr-3 flex items-center justify-end">
                {Number(r[scoreSuffix ? `Max_Possible_${scoreSuffix}` : "Max_Possible"] || 0).toFixed(0)}
              </div>
              <div className="td tabular text-right pr-3 flex items-center justify-end">
                <Progress value={Number(r[scoreSuffix ? `Percent_${scoreSuffix}` : "Percent"] || 0)} />
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

function Filters({ filteredCount }: { categories: string[]; filteredCount: number }) {
  const f = useFilters();
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Territories without senators
  const territoriesWithoutSenate = ["VI", "PR", "DC", "AS", "GU", "MP"];

  return (
    <div className="mb-1 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-white dark:bg-white/5 p-1">
          <button
            onClick={() => f.set({ viewMode: "map", categories: new Set() })}
            className={clsx(
              "px-3 h-9 rounded-md text-sm",
              f.viewMode === "map"
                ? "bg-[#4B8CFB] text-white"
                : "hover:bg-slate-50 dark:hover:bg-white/10"
            )}
          >
            Map
          </button>
          <button
            onClick={() => f.set({ viewMode: "summary", categories: new Set() })}
            className={clsx(
              "px-3 h-9 rounded-md text-sm",
              f.viewMode === "summary"
                ? "bg-[#4B8CFB] text-white"
                : "hover:bg-slate-50 dark:hover:bg-white/10"
            )}
          >
            Summary
          </button>
          <select
            className={clsx(
              "px-3 h-9 rounded-md text-sm border-0 cursor-pointer",
              f.viewMode === "all" || f.viewMode === "category"
                ? "bg-[#4B8CFB] text-white"
                : "bg-transparent hover:bg-slate-50 dark:hover:bg-white/10"
            )}
            value={
              f.viewMode === "all" && f.categories.size === 0
                ? "All"
                : f.categories.size > 0
                ? Array.from(f.categories)[0]
                : ""
            }
            onChange={(e) => {
              const value = e.target.value;
              if (value === "" || value === "All") {
                f.set({ viewMode: "all", categories: new Set() });
              } else {
                f.set({ viewMode: "category", categories: new Set([value]) });
              }
            }}
          >
            <option value="">Issues</option>
            <option value="All">All</option>
            <option value="Civil Rights">Civil Rights</option>
            <option value="Iran">Iran</option>
            <option value="Israel-Gaza">Israel-Gaza</option>
            <option value="Travel & Immigration">Travel & Immigration</option>
          </select>
        </div>
        <div className="ml-auto">
          <UnifiedSearch filteredCount={filteredCount} />
        </div>
        <div className="basis-full">
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <svg
              className={clsx("w-4 h-4 transition-transform", filtersExpanded && "rotate-90")}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Filters
            {(f.chamber || f.party || f.state) && (
              <span className="text-xs text-slate-500">
                ({[
                  f.chamber && f.chamber,
                  f.party && f.party,
                  f.state && f.state
                ].filter(Boolean).join(", ")})
              </span>
            )}
          </button>
          {filtersExpanded && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Segmented
                options={["Both","House","Senate"]}
                value={f.chamber ? (f.chamber.charAt(0) + f.chamber.slice(1).toLowerCase()) : "Both"}
                onChange={(v)=>f.set({ chamber: v==="Both" ? "" : v.toUpperCase() as any })}
              />
              <select className="select" onChange={e=>f.set({party:e.target.value as any})}>
                <option value="">All parties</option>
                <option>Democratic</option><option>Republican</option><option>Independent</option>
              </select>
              <select
                className="select"
                value={f.state || ""}
                onChange={(e) => {
                  const selectedState = e.target.value;
                  // If selecting a territory without senate, automatically switch to House
                  if (selectedState && territoriesWithoutSenate.includes(selectedState)) {
                    f.set({ state: selectedState, chamber: "HOUSE" });
                  } else {
                    f.set({ state: selectedState });
                  }
                }}
              >
                <option value="">All states</option>
                {STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UnifiedSearch({ filteredCount }: { filteredCount: number }) {
  const f = useFilters();
  const [isOpen, setIsOpen] = useState(false);
  const [searchType, setSearchType] = useState<"zip" | "name" | "legislation">("zip");
  const [searchValue, setSearchValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleZipSearch = async () => {
    if (!searchValue.trim()) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/find-lawmakers?address=${encodeURIComponent(searchValue)}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to find lawmakers');
        return;
      }

      if (data.lawmakers && data.lawmakers.length > 0) {
        const names = data.lawmakers.map((l: any) => l.name);
        f.set({ myLawmakers: names });
        setSearchValue("");
        setIsOpen(false);
      } else {
        setError('No lawmakers found for this address');
      }
    } catch (err) {
      setError('Failed to find lawmakers');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (searchType === "zip") {
      handleZipSearch();
    } else if (searchType === "name") {
      f.set({ search: searchValue });
      setIsOpen(false);
    }
    // "legislation" search will be implemented later
  };

  const handleClear = () => {
    f.set({ myLawmakers: [], search: "" });
    setSearchValue("");
    setError("");
  };

  const getPlaceholder = () => {
    if (searchType === "zip") return "Enter zip code…";
    if (searchType === "name") return "Enter lawmaker name…";
    return "Enter bill name…";
  };

  const isActive = f.myLawmakers.length > 0 || f.search.length > 0;

  return (
    <div className="relative">
      {isActive ? (
        <button
          className="chip bg-[#4B8CFB] text-white hover:bg-[#3B7CEB]"
          onClick={handleClear}
          title="Clear search"
        >
          {f.myLawmakers.length > 0 ? `Showing ${filteredCount} ✕` : `Searching "${f.search}" ✕`}
        </button>
      ) : (
        <button
          className="chip-outline flex items-center gap-1"
          onClick={() => setIsOpen(!isOpen)}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Search...
        </button>
      )}

      {isOpen && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white dark:bg-slate-800 border border-[#E7ECF2] dark:border-white/10 rounded-lg shadow-lg p-4 min-w-[300px]">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1 text-slate-700 dark:text-slate-300">
                Search by:
              </label>
              <div className="flex gap-2">
                <button
                  className={clsx(
                    "px-3 py-1.5 text-xs rounded-md",
                    searchType === "zip"
                      ? "bg-[#4B8CFB] text-white"
                      : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"
                  )}
                  onClick={() => setSearchType("zip")}
                >
                  Location
                </button>
                <button
                  className={clsx(
                    "px-3 py-1.5 text-xs rounded-md",
                    searchType === "name"
                      ? "bg-[#4B8CFB] text-white"
                      : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"
                  )}
                  onClick={() => setSearchType("name")}
                >
                  Lawmaker
                </button>
                <button
                  className={clsx(
                    "px-3 py-1.5 text-xs rounded-md",
                    searchType === "legislation"
                      ? "bg-[#4B8CFB] text-white"
                      : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"
                  )}
                  onClick={() => setSearchType("legislation")}
                >
                  Bill
                </button>
              </div>
            </div>

            <div>
              <input
                type="text"
                placeholder={getPlaceholder()}
                className="input !w-full"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                disabled={loading}
                autoFocus
              />
            </div>

            {error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-2 py-1">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                className="flex-1 px-3 py-1.5 text-sm bg-[#4B8CFB] text-white rounded-md hover:bg-[#3B7CEB] disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleSearch}
                disabled={loading || !searchValue.trim()}
              >
                {loading ? "Searching..." : "Search"}
              </button>
              <button
                className="px-3 py-1.5 text-sm border border-[#E7ECF2] dark:border-white/10 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700"
                onClick={() => {
                  setIsOpen(false);
                  setSearchValue("");
                  setError("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({
  col,
  meta,
  onSort,
  active,
  dir,
}: {
  col: string;
  meta?: Meta;
  onSort?: () => void;
  active?: boolean;
  dir?: "GOOD_FIRST" | "BAD_FIRST";
}) {
  return (
    <div className="th group group/header relative select-none flex flex-col max-w-[14rem]">
      {/* Bill title - clickable to view details */}
      <span
        className="line-clamp-3 cursor-pointer hover:text-[#4B8CFB] transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          if (meta) {
            window.open(`/bill/${encodeURIComponent(col)}`, '_blank');
          }
        }}
      >
        {meta ? (meta.short_title || meta.bill_number) : col}
      </span>

      {/* Position - sortable */}
      {meta && meta.position_to_score && (
        <span
          className={clsx(
            "text-xs text-slate-500 dark:text-slate-300 font-light mt-0.5 flex items-center gap-1",
            onSort && "cursor-pointer hover:text-slate-700 dark:hover:text-slate-100"
          )}
          onClick={onSort}
          title={onSort ? "Click to sort by this column (toggle ✓ first / ✕ first)" : undefined}
        >
          {meta.position_to_score}
          {onSort && (
            <span className={clsx(
              "text-[10px]",
              active ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover/header:opacity-100"
            )}>
              {dir === "GOOD_FIRST" ? "▲" : "▼"}
            </span>
          )}
        </span>
      )}

      {/* Tooltip */}
      {meta && (
        <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute left-0 top-full mt-2 z-[100] w-[28rem] rounded-xl border border-[#E7ECF2] dark:border-white/10 bg-white dark:bg-[#1a2332] p-3 shadow-xl transition-opacity duration-200">
          <div className={clsx(
            meta.short_title ? "text-base font-bold" : "text-sm font-semibold",
            "text-slate-900 dark:text-slate-100"
          )}>
            {meta.bill_number || meta.short_title || col}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-300 mt-1">{meta.short_title}</div>
          <div className="text-xs text-slate-500 dark:text-slate-300 mt-1"><span className="font-medium">NIAC Action Position:</span> {meta.position_to_score}</div>
          {meta.notes && <div className="text-xs text-slate-700 dark:text-slate-200 mt-2">{meta.notes}</div>}
          {meta.sponsor && <div className="text-xs text-slate-700 dark:text-slate-200 mt-2"><span className="font-medium">Sponsor:</span> {meta.sponsor}</div>}
          <div className="mt-2 flex flex-wrap gap-1">
            {(meta.categories || "").split(";").map((c:string)=>c.trim()).filter(Boolean).map((c:string)=>(
              <span key={c} className="chip-xs">{c}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value?: string;
  onChange: (v: string) => void;
}) {
  const current = value || options[0];
  return (
    <div className="inline-flex rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-white dark:bg-white/5 p-1">
      {options.map((opt) => {
        const isActive = current === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={clsx(
              "px-3 h-9 rounded-md text-sm",
              isActive
                ? "bg-[#4B8CFB] text-white"
                : "hover:bg-slate-50 dark:hover:bg-white/10"
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function Progress({ value }:{ value:number }) {
  const percent = (value * 100).toFixed(0);
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 rounded-full bg-[#E7ECF2] overflow-hidden">
        <div className="h-2 rounded-full" style={{ width: `${percent}%`, background: "#0FDDAA" }} />
      </div>
      <span className="text-xs tabular text-slate-800 min-w-[32px]">{percent}%</span>
    </div>
  );
}

function GradeChip({ grade, isOverall }:{ grade:string; isOverall?: boolean }) {
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
  return <span className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium min-w-[2.75rem]"
    style={{ background: `${color}${opacity}`, color: textColor, border }}>{grade}</span>;
}

function VoteIcon({ ok }: { ok: boolean }) {
  if (ok) {
    // checkmark
    return (
      <svg
        viewBox="0 0 20 20"
        className="h-5 w-5"
        aria-hidden="true"
        role="img"
      >
        <path
          d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z"
          fill="#10B981"
        />
      </svg>
    );
  }
  // X mark
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-5 w-5"
      aria-hidden="true"
      role="img"
    >
      <path
        d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z"
        fill="#F97066"
      />
    </svg>
  );
}

function LawmakerCard({
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

  // Build list of items: each bill or manual action gets an entry
  const allItems = useMemo(() => {
    return billCols
      .map((c) => {
        const meta = metaByCol.get(c);
        const inferredChamber = inferChamber(meta, c);
        const notApplicable = inferredChamber && inferredChamber !== row.chamber;
        const val = Number((row as any)[c] ?? 0);
        const categories = (meta?.categories || "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean);

        // Check for preferred pair waiver
        const isPreferred = meta ? isTrue((meta as any).preferred) : false;
        let waiver = false;
        if (!notApplicable && meta?.pair_key && !isPreferred && !(val > 0)) {
          for (const other of billCols) {
            if (other === c) continue;
            const m2 = metaByCol.get(other);
            if (m2?.pair_key === meta.pair_key && isTrue((m2 as any).preferred)) {
              const v2 = Number((row as any)[other] ?? 0);
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
              <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium mb-0.5">
                {(() => {
                  if (row.chamber === "SENATE") return "Senator";
                  if (row.chamber === "HOUSE") {
                    const delegateStates = ["AS", "DC", "GU", "MP", "PR", "VI"];
                    const state = stateCodeOf(row.state);
                    return delegateStates.includes(state) ? "Delegate" : "Representative";
                  }
                  return "";
                })()}
              </div>
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
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
              <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
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

          {/* Category Grades - Sticky */}
          <div className="p-6 pb-3 border-b border-[#E7ECF2] dark:border-white/10 sticky top-[180px] bg-white dark:bg-[#0B1220] z-10">
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
                    {isTruthy(row.aipac_supported) && (
                      <div className="flex items-center gap-1.5" title="American Israel Public Affairs Committee">
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" role="img">
                          <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                        </svg>
                        <span className="text-xs text-slate-700 dark:text-slate-300">AIPAC</span>
                      </div>
                    )}
                    {isTruthy(row.dmfi_supported) && (
                      <div className="flex items-center gap-1.5">
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" role="img">
                          <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                        </svg>
                        <span className="text-xs text-slate-700 dark:text-slate-300">Democratic Majority For Israel</span>
                      </div>
                    )}
                    {!isTruthy(row.aipac_supported) && !isTruthy(row.dmfi_supported) && (
                      <div className="text-xs text-slate-500 dark:text-slate-400">None</div>
                    )}
                  </div>
                </div>
              </div>
          </div>

          {/* Scrollable Content */}
          <div className="overflow-y-auto flex-1 p-6">
            {/* District Offices */}
            {row.district_offices && (
              <div className="mb-6">
                <div className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200">District Offices</div>
                <div className="rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4">
                  <div className="text-xs text-slate-700 dark:text-slate-200 space-y-2">
                    {row.district_offices.split(";").map((office, idx) => (
                      <div key={idx}>
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
              {items.map((it) => (
                <div
                  key={it.col}
                  className="py-2 flex items-start gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 -mx-2 px-2 rounded transition"
                  onClick={() => window.open(`/bill/${encodeURIComponent(it.col)}`, '_blank')}
                >
                  <div className="mt-0.5">
                    {it.waiver ? (
                      <span className="text-lg leading-none text-slate-400 dark:text-slate-500">—</span>
                    ) : (
                      <VoteIcon ok={it.ok} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium leading-5 text-slate-700 dark:text-slate-200">
                      {it.meta?.short_title || it.meta?.bill_number || it.col}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 font-light">
                      <span className="font-medium">NIAC Action Position:</span> {it.meta?.position_to_score || ""}
                    </div>
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
              {!items.length && (
                <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No relevant bills/actions for current filters.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

