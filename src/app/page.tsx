/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";
import { useEffect, useMemo, useState } from "react";
import { loadData } from "@/lib/loadCsv";
import { useFilters } from "@/lib/store";
import type { Row, Meta } from "@/lib/types";
import clsx from "clsx";

function partyLabel(p?: string) {
  const s = (p || "").trim().toLowerCase();
  if (!s) return "";
  // normalize any form of Democratic/Democrat -> "Democrat"
  if (s.startsWith("democ")) return "Democrat";
  // leave Republican/Independent/etc. as-is but capitalize first letter of each word
  return p
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function inferChamber(meta: Meta, col: string): "HOUSE" | "SENATE" | "" {
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

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [metaByCol, setMeta] = useState<Map<string, Meta>>(new Map());
  const [categories, setCategories] = useState<string[]>([]);

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
    if (f.state) out = out.filter(r => r.state === f.state);
    if (f.search) {
      const q = f.search.toLowerCase();
      out = out.filter(r => (r.full_name||"").toLowerCase().includes(q));
    }
    if (f.categories.size) {
      const wanted = new Set(Array.from(f.categories));
      const hasColInCats = (r: Row) =>
        cols.some(c => {
          const m = metaByCol.get(c);
          if (!m) return false;
          const cats = (m.categories || "").split(";").map((s:string)=>s.trim()).filter(Boolean);
          if (!cats.length) return false;
          return cats.some((cc:string)=>wanted.has(cc) && Number(r[c]) > 0);
        });
      out = out.filter(hasColInCats);
    }
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
    if (sortCol === "Grade") {
      const goodFirst = sortDir === "GOOD_FIRST"; // best grades first
      return [...filtered].sort((a, b) => {
        const ra = gradeRank(String(a.Grade || ""));
        const rb = gradeRank(String(b.Grade || ""));
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

  const billCols = useMemo(() => {
    // If no chamber filter, show all bill/action columns
    if (!f.chamber) return cols;
    // Otherwise only keep columns that belong to the selected chamber
    return cols.filter((c) => {
      const meta = metaByCol.get(c);
      const ch = inferChamber(meta, c);
      return ch === f.chamber;
    });
  }, [cols, metaByCol, f.chamber]);

  const gridTemplate = useMemo(() => {
    // Fixed widths per column so the header background spans the full scroll width
    const billsPart = billCols.map(() => "140px").join(" ");
    // member col + grade col + dynamic bill cols + totals
    return `280px 80px ${billsPart} 160px 120px 100px`;
  }, [billCols]);

  return (
    <div className="space-y-4">
      <Filters categories={categories} />
      <div className="card overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          {/* Header */}
          <div
            className="grid min-w-max sticky top-0 z-30 bg-[#F7F8FA]/95 dark:bg-slate-900/85 backdrop-blur border-b border-[#E7ECF2] dark:border-white/10"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div
              className="th pl-4 sticky left-0 z-40 bg-white dark:bg-slate-900 border-r border-[#E7ECF2] dark:border-white/10 cursor-pointer relative"
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
            <div
              className="th text-right pr-3 cursor-pointer relative"
              title="Click to sort by Grade (toggle best→worst / worst→best)"
              onClick={() => {
                if (sortCol === "Grade") {
                  setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                } else {
                  setSortCol("Grade");
                  setSortDir("GOOD_FIRST");
                }
              }}
            >
              Grade
              {sortCol === "Grade" && (
                <span className="absolute right-2 top-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                </span>
              )}
            </div>
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
                if (sortCol === "Total") {
                  setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                } else {
                  setSortCol("Total");
                  setSortDir("GOOD_FIRST");
                }
              }}
            >
              Total
              {sortCol === "Total" && (
                <span className="absolute right-2 top-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                </span>
              )}
            </div>

            <div
              className="th text-right pr-3 cursor-pointer relative"
              title="Click to sort by Max (toggle high→low / low→high)"
              onClick={() => {
                if (sortCol === "Max_Possible") {
                  setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                } else {
                  setSortCol("Max_Possible");
                  setSortDir("GOOD_FIRST");
                }
              }}
            >
              Max
              {sortCol === "Max_Possible" && (
                <span className="absolute right-2 top-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  {sortDir === "GOOD_FIRST" ? "▲" : "▼"}
                </span>
              )}
            </div>

            <div
              className="th text-right pr-3 cursor-pointer relative"
              title="Click to sort by Percent (toggle high→low / low→high)"
              onClick={() => {
                if (sortCol === "Percent") {
                  setSortDir((d) => (d === "GOOD_FIRST" ? "BAD_FIRST" : "GOOD_FIRST"));
                } else {
                  setSortCol("Percent");
                  setSortDir("GOOD_FIRST");
                }
              }}
            >
              Percent
              {sortCol === "Percent" && (
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
              className="grid min-w-max hover:bg-slate-50 dark:hover:bg-white/5 transition"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {/* member + photo */}
              <div className="td pl-4 flex items-center gap-3 sticky left-0 z-20 bg-white dark:bg-slate-900">
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
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {r.chamber === "HOUSE" ? "House" : r.chamber === "SENATE" ? "Senate" : (r.chamber || "")} • {partyLabel(r.party)} • {r.state}
                  </div>
                </div>
              </div>
              <div className="td text-right pr-3">
                <GradeChip grade={String(r.Grade || "N/A")} />
              </div>

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
                let title: string;
                if (notApplicable) {
                  title = "Not applicable (different chamber)";
                } else if (val > 0) {
                  title = "Aligned with our stance (earned points)";
                } else {
                  // For same-chamber entries with no points, treat as not aligned
                  title = "Not aligned with our stance (no points)";
                }

                return (
                  <div key={c} className="td pr-0 flex items-center justify-center" title={title}>
                    {notApplicable ? (
                      <span className="text-xs text-slate-400">N/A</span>
                    ) : (
                      <VoteIcon ok={val > 0} />
                    )}
                  </div>
                );
              })}

              <div className="td tabular text-right pr-3 font-medium">
                {Number(r.Total || 0).toFixed(0)}
              </div>
              <div className="td tabular text-right pr-3">
                {Number(r.Max_Possible || 0).toFixed(0)}
              </div>
              <div className="td tabular text-right pr-3">
                <Progress value={Number(r.Percent || 0)} />
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
      <input placeholder="State (e.g., WA)" className="input" onChange={e=>f.set({state:e.target.value.toUpperCase()})}/>
      <div className="flex flex-wrap gap-2">
        {categories.slice(0,12).map(c=>(
          <button key={c}
            className={clsx("chip", f.categories.has(c) && "ring-2 ring-[#4B8CFB]")}
            onClick={()=>f.toggleCategory(c)}>{c}</button>
        ))}
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
  meta: Meta;
  onSort?: () => void;
  active?: boolean;
  dir?: "GOOD_FIRST" | "BAD_FIRST";
}) {
  return (
    <div
      className={clsx(
        "th group relative select-none",
        onSort ? "cursor-pointer" : "cursor-default"
      )}
      onClick={onSort}
      title={onSort ? "Click to sort by this column (toggle ✓ first / ✕ first)" : undefined}
    >
      <span className="flex flex-col">
        <span>{meta ? (meta.bill_number || col) : col}</span>
        {meta && meta.position_to_score && (
          <span className="text-xs text-slate-500 dark:text-slate-400">{meta.position_to_score}</span>
        )}
      </span>
      {active && (
        <span className="absolute right-2 top-1.5 text-[10px] text-slate-500 dark:text-slate-400">
          {dir === "GOOD_FIRST" ? "▲" : "▼"}
        </span>
      )}
      {meta && (
        <div className="invisible group-hover:visible absolute left-0 bottom-full mb-2 w-[28rem] rounded-xl border border-[#E7ECF2] dark:border-white/10 bg-white dark:bg-zinc-900 p-3 shadow-xl">
          <div className="text-sm font-medium">{meta.short_title || meta.bill_number || col}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{meta.position_to_score}</div>
          {meta.notes && <div className="text-xs mt-2">{meta.notes}</div>}
          {meta.sponsor && <div className="text-xs mt-2"><span className="font-medium">Sponsor:</span> {meta.sponsor}</div>}
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
        const optValue = opt === "Both" ? "Both" : opt.toUpperCase(); // "Both" | "HOUSE" | "SENATE"
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
    <div className="h-2 w-full rounded-full bg-[#E7ECF2] dark:bg-white/10 overflow-hidden">
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