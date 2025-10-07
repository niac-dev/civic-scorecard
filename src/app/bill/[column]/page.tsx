"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { loadData } from "@/lib/loadCsv";
import type { Row, Meta } from "@/lib/types";

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

export default function BillPage() {
  const params = useParams();
  const router = useRouter();
  const column = decodeURIComponent(params.column as string);

  const [meta, setMeta] = useState<Meta | null>(null);
  const [supporters, setSupporters] = useState<Row[]>([]);
  const [opposers, setOpposers] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const { rows, metaByCol } = await loadData();
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
        const val = Number((row as any)[column] ?? 0);
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
                  <span className="font-medium">Position:</span> {meta.position_to_score}
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
                  className="flex items-center gap-2 p-2 rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5"
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
                  className="flex items-center gap-2 p-2 rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5"
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
      </div>
    </>
  );
}
