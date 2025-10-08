/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";
import { useEffect, useMemo, useState } from "react";
import { loadData } from "@/lib/loadCsv";
import { useFilters } from "@/lib/store";
import type { Row, Meta } from "@/lib/types";

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

  const [sortCol, setSortCol] = useState<string>("");
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
  }, [allBillCols, metaByCol, f.categories]);

  // Determine which grade columns to show based on selected category
  const gradeColumns = useMemo(() => {
    // If exactly one category is selected, show only that category's grade
    if (f.categories.size === 1) {
      const category = Array.from(f.categories)[0];
      // Replace special chars with underscores to match CSV column naming
      const fieldSuffix = category.replace(/\s+&\s+/g, "_").replace(/[\/-]/g, "_").replace(/\s+/g, "_");
      return [
        {
          header: category,
          field: `Grade_${fieldSuffix}` as keyof Row
        }
      ];
    }
    // Otherwise show only total grade
    return [
      { header: "Total", field: "Grade" as keyof Row }
    ];
  }, [f.categories]);

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
    // member col + grade cols + dynamic bill cols + totals
    return `280px ${gradesPart} ${billsPart} 160px 120px 100px`;
  }, [billCols, gradeColumns]);

  return (
    <div className="space-y-4">
      <Filters categories={categories} />
      {selected && (
        <LawmakerCard
          row={selected}
          billCols={allBillCols}
          metaByCol={metaByCol}
          onClose={() => setSelected(null)}
        />
      )}
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
              className="th pl-4 sticky left-0 z-40 bg-white dark:bg-slate-900 border-r border-[#E7ECF2] dark:border-white/10 cursor-pointer"
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
              {sortCol === "__member" && (
                <span className="absolute right-2 top-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                </span>
              )}
            </div>
            {gradeColumns.map((gradeCol, idx) => (
              <div
                key={gradeCol.field}
                className={clsx(
                  "th text-right pr-3 cursor-pointer relative",
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
                {sortCol === String(gradeCol.field) && (
                  <span className="absolute right-2 top-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                    {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                  </span>
                )}
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
            {/* Sortable score headers */}
            <div
              className="th text-right pr-3 cursor-pointer relative"
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
              Total
              {sortCol === (scoreSuffix ? `Total_${scoreSuffix}` : "Total") && (
                <span className="absolute right-2 top-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                </span>
              )}
            </div>

            <div
              className="th text-right pr-3 cursor-pointer relative"
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
              Max
              {sortCol === (scoreSuffix ? `Max_Possible_${scoreSuffix}` : "Max_Possible") && (
                <span className="absolute right-2 top-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                </span>
              )}
            </div>

            <div
              className="th text-right pr-3 cursor-pointer relative"
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
              {sortCol === (scoreSuffix ? `Percent_${scoreSuffix}` : "Percent") && (
                <span className="absolute right-2 top-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                </span>
              )}
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
                    className="h-8 w-8 rounded-full object-cover bg-slate-200 dark:bg-white/10"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-slate-300 dark:bg-white/10" />
                )}
                <div>
                  <div className="font-normal text-[15px] leading-5 text-slate-800 dark:text-slate-200">
                    {r.full_name}
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
                    "td text-right pr-3",
                    idx === gradeColumns.length - 1 && "border-r border-[#E7ECF2] dark:border-white/10"
                  )}
                >
                  <GradeChip grade={String(r[gradeCol.field] || "N/A")} />
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

              <div className="td tabular text-right pr-3 font-medium">
                {Number(r[scoreSuffix ? `Total_${scoreSuffix}` : "Total"] || 0).toFixed(0)}
              </div>
              <div className="td tabular text-right pr-3">
                {Number(r[scoreSuffix ? `Max_Possible_${scoreSuffix}` : "Max_Possible"] || 0).toFixed(0)}
              </div>
              <div className="td tabular text-right pr-3">
                <Progress value={Number(r[scoreSuffix ? `Percent_${scoreSuffix}` : "Percent"] || 0)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Filters({ categories }: { categories: string[] }) {
  const f = useFilters();
  return (
    <div className="mb-1 flex flex-wrap items-center gap-2">
      <Segmented
        options={["Both","House","Senate"]}
        value={f.chamber || "Both"}
        onChange={(v)=>f.set({ chamber: v==="Both" ? "" : (v as any) })}
      />
      <select className="select" onChange={e=>f.set({party:e.target.value as any})}>
        <option value="">All parties</option>
        <option>Democratic</option><option>Republican</option><option>Independent</option>
      </select>
      <select
        className="select"
        value={f.state || ""}
        onChange={(e) => f.set({ state: e.target.value })}
      >
        <option value="">All states</option>
        {STATES.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name} ({s.code})
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        <button
          key="__all__"
          className={clsx(
            "chip",
            f.categories.size === 0 && "ring-2 ring-[#4B8CFB]"
          )}
          onClick={() => f.set({ categories: new Set() })}
          title="Show all categories"
        >
          All
        </button>
        {categories.map((c) => {
          const active = f.categories.has(c);
          return (
            <button
              key={c}
              className={clsx("chip", active && "ring-2 ring-[#4B8CFB]")}
              onClick={() => {
                // Only allow one category at a time
                if (active) {
                  f.set({ categories: new Set() }); // Deselect
                } else {
                  f.set({ categories: new Set([c]) }); // Select only this one
                }
              }}
              title={active ? "Show all categories" : `Filter by ${c}`}
            >
              {c}
            </button>
          );
        })}
      </div>
      <div className="ml-auto">
        <input placeholder="Search members…" className="input" onChange={e=>f.set({search:e.target.value})}/>
      </div>
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
    <div className="th group relative select-none flex flex-col max-w-[14rem]">
      {/* Bill title - clickable to view details */}
      <span
        className="line-clamp-3 cursor-pointer hover:text-[#4B8CFB] transition-colors"
        title={meta ? (meta.short_title || meta.bill_number) : col}
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
          {active && (
            <span className="text-[10px]">
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
  const current = value || "Both";
  return (
    <div className="inline-flex rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-white dark:bg-white/5 p-1">
      {options.map((opt) => {
        const optValue = opt === "Both" ? "Both" : opt.toUpperCase();
        const isActive = current === optValue;
        return (
          <button
            key={opt}
            onClick={() => onChange(optValue)}
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
  return (
    <div className="h-2 w-full rounded-full bg-[#E7ECF2] overflow-hidden">
      <div className="h-2 rounded-full" style={{ width: `${(value*100).toFixed(0)}%`, background: "#0FDDAA" }} />
    </div>
  );
}

function GradeChip({ grade }:{ grade:string }) {
  const color = grade.startsWith("A") ? "#10B981"
    : grade.startsWith("B") ? "#84CC16"
    : grade.startsWith("C") ? "#F59E0B"
    : grade.startsWith("D") ? "#F97316"
    : "#F97066";
  return <span className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium"
    style={{ background: `${color}22`, color }}>{grade}</span>;
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
  onClose,
}: {
  row: Row;
  billCols: string[];
  metaByCol: Map<string, Meta>;
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
        <div className="w-full max-w-5xl my-4 rounded-2xl border border-[#E7ECF2] dark:border-white/10 bg-white dark:bg-[#0B1220] shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 p-6 border-b border-[#E7ECF2] dark:border-white/10 sticky top-0 z-10 bg-white/70 dark:bg-[#0B1220]/80 backdrop-blur-xl">
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
                <span>{stateCodeOf(row.state)}</span>
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

          {/* Content */}
          <div className="p-6">
            {/* Category Grades */}
            <div className="mb-6">
              <div className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200">Category Grades</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => setSelectedCategory(selectedCategory === "Civil Rights & Immigration" ? null : "Civil Rights & Immigration")}
                  className={clsx(
                    "rounded-lg border p-3 text-left transition cursor-pointer",
                    selectedCategory === "Civil Rights & Immigration"
                      ? "border-[#4B8CFB] bg-[#4B8CFB]/10 dark:bg-[#4B8CFB]/20"
                      : "border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10"
                  )}
                >
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Civil Rights & Immigration</div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs tabular text-slate-700 dark:text-slate-300">
                      {Number(row.Total_Civil_Rights_Immigration || 0).toFixed(0)} / {Number(row.Max_Possible_Civil_Rights_Immigration || 0).toFixed(0)}
                    </div>
                    <GradeChip grade={String(row.Grade_Civil_Rights_Immigration || "N/A")} />
                  </div>
                </button>

                <button
                  onClick={() => setSelectedCategory(selectedCategory === "Iran" ? null : "Iran")}
                  className={clsx(
                    "rounded-lg border p-3 text-left transition cursor-pointer",
                    selectedCategory === "Iran"
                      ? "border-[#4B8CFB] bg-[#4B8CFB]/10 dark:bg-[#4B8CFB]/20"
                      : "border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10"
                  )}
                >
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Iran</div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs tabular text-slate-700 dark:text-slate-300">
                      {Number(row.Total_Iran || 0).toFixed(0)} / {Number(row.Max_Possible_Iran || 0).toFixed(0)}
                    </div>
                    <GradeChip grade={String(row.Grade_Iran || "N/A")} />
                  </div>
                </button>

                <button
                  onClick={() => setSelectedCategory(selectedCategory === "Israel-Gaza" ? null : "Israel-Gaza")}
                  className={clsx(
                    "rounded-lg border p-3 text-left transition cursor-pointer",
                    selectedCategory === "Israel-Gaza"
                      ? "border-[#4B8CFB] bg-[#4B8CFB]/10 dark:bg-[#4B8CFB]/20"
                      : "border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10"
                  )}
                >
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Israel/Gaza</div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs tabular text-slate-700 dark:text-slate-300">
                      {Number(row.Total_Israel_Gaza || 0).toFixed(0)} / {Number(row.Max_Possible_Israel_Gaza || 0).toFixed(0)}
                    </div>
                    <GradeChip grade={String(row.Grade_Israel_Gaza || "N/A")} />
                  </div>
                </button>
              </div>
            </div>

            {/* Votes & Actions */}
            <div className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">Votes & Actions</div>
            <div className="divide-y divide-[#E7ECF2] dark:divide-white/10 max-h-[50vh] overflow-auto">
              {items.map((it) => (
                <div key={it.col} className="py-2 flex items-start gap-3">
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

