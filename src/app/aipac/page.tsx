"use client";
import { useEffect, useState, useMemo } from "react";
import { loadData } from "@/lib/loadCsv";
import type { Row } from "@/lib/types";
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

function gradeColor(grade: string): string {
  const g = (grade || "").trim().toUpperCase();
  if (g === "A" || g === "A+") return "#10B981"; // green
  if (g === "A-" || g === "B+" || g === "B") return "#3B82F6"; // blue
  if (g === "B-" || g === "C+") return "#F59E0B"; // amber
  if (g === "C" || g === "C-") return "#EF4444"; // red
  if (g === "D" || g === "F") return "#991B1B"; // dark red
  return "#94A3B8"; // gray
}

export default function AipacPage() {
  const [supported, setSupported] = useState<Row[]>([]);
  const [notSupported, setNotSupported] = useState<Row[]>([]);
  const [firstExpanded, setFirstExpanded] = useState<boolean>(false);
  const [secondExpanded, setSecondExpanded] = useState<boolean>(false);
  const [partyFilter, setPartyFilter] = useState<string>("");
  const [chamberFilter, setChamberFilter] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { rows } = await loadData();

      const supportedList: Row[] = [];
      const notSupportedList: Row[] = [];

      rows.forEach((row) => {
        const hasSupport = isTruthy(row.aipac_supported) || isTruthy(row.dmfi_supported);
        if (hasSupport) {
          supportedList.push(row);
        } else {
          notSupportedList.push(row);
        }
      });

      setSupported(supportedList.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))));
      setNotSupported(notSupportedList.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))));
    })();
  }, []);

  // Filter based on party and chamber
  const filteredSupported = useMemo(() => {
    let filtered = supported;
    if (partyFilter) {
      filtered = filtered.filter(m => partyLabel(m.party) === partyFilter);
    }
    if (chamberFilter) {
      filtered = filtered.filter(m => m.chamber === chamberFilter);
    }
    return filtered;
  }, [supported, partyFilter, chamberFilter]);

  const filteredNotSupported = useMemo(() => {
    let filtered = notSupported;
    if (partyFilter) {
      filtered = filtered.filter(m => partyLabel(m.party) === partyFilter);
    }
    if (chamberFilter) {
      filtered = filtered.filter(m => m.chamber === chamberFilter);
    }
    return filtered;
  }, [notSupported, partyFilter, chamberFilter]);

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
                  AIPAC & DMFI Support
                </h1>
                <div className="text-lg text-slate-700 dark:text-slate-200 mb-2">
                  Members of Congress who receive support from AIPAC or DMFI
                </div>
              </div>
              <button
                className="chip-outline text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
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

            {/* Filters */}
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Filter:</span>
              <select
                className="select !text-xs !h-8 !px-2"
                value={partyFilter}
                onChange={(e) => setPartyFilter(e.target.value)}
              >
                <option value="">All Parties</option>
                <option value="Democrat">Democrat</option>
                <option value="Republican">Republican</option>
                <option value="Independent">Independent</option>
              </select>
              <select
                className="select !text-xs !h-8 !px-2"
                value={chamberFilter}
                onChange={(e) => setChamberFilter(e.target.value)}
              >
                <option value="">Both Chambers</option>
                <option value="HOUSE">House</option>
                <option value="SENATE">Senate</option>
              </select>
              {(partyFilter || chamberFilter) && (
                <button
                  onClick={() => {
                    setPartyFilter("");
                    setChamberFilter("");
                  }}
                  className="chip-outline text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 !text-xs !px-2 !h-8"
                >
                  Clear
                </button>
              )}
            </div>

            {/* First Section - Supported */}
            <div className="mb-6">
              <h2
                className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50 transition-colors"
                onClick={() => setFirstExpanded(!firstExpanded)}
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden="true" role="img">
                  <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#F97066" />
                </svg>
                Supported by AIPAC or aligned PACs ({filteredSupported.length})
                <svg
                  viewBox="0 0 20 20"
                  className={clsx("h-4 w-4 ml-auto transition-transform", firstExpanded && "rotate-180")}
                  aria-hidden="true"
                  role="img"
                >
                  <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </h2>
              {firstExpanded && (
                <>
                  {(() => {
                    const housemembers = filteredSupported.filter(m => m.chamber === "HOUSE");
                    const senatemembers = filteredSupported.filter(m => m.chamber === "SENATE");

                    return (
                      <div className="space-y-4">
                        {housemembers.length > 0 && (
                          <div>
                            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 px-2">
                              House ({housemembers.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {housemembers.map((member) => (
                                <MemberCard key={member.bioguide_id} member={member} />
                              ))}
                            </div>
                          </div>
                        )}
                        {senatemembers.length > 0 && (
                          <div>
                            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 px-2">
                              Senate ({senatemembers.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {senatemembers.map((member) => (
                                <MemberCard key={member.bioguide_id} member={member} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>

            {/* Second Section - Not Supported */}
            <div>
              <h2
                className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50 transition-colors"
                onClick={() => setSecondExpanded(!secondExpanded)}
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden="true" role="img">
                  <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#10B981" />
                </svg>
                Does not receive support from AIPAC or aligned PACs ({filteredNotSupported.length})
                <svg
                  viewBox="0 0 20 20"
                  className={clsx("h-4 w-4 ml-auto transition-transform", secondExpanded && "rotate-180")}
                  aria-hidden="true"
                  role="img"
                >
                  <path d="M5.5 7.5 L10 12 L14.5 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </h2>
              {secondExpanded && (
                <>
                  {(() => {
                    const housemembers = filteredNotSupported.filter(m => m.chamber === "HOUSE");
                    const senatemembers = filteredNotSupported.filter(m => m.chamber === "SENATE");

                    return (
                      <div className="space-y-4">
                        {housemembers.length > 0 && (
                          <div>
                            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 px-2">
                              House ({housemembers.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {housemembers.map((member) => (
                                <MemberCard key={member.bioguide_id} member={member} />
                              ))}
                            </div>
                          </div>
                        )}
                        {senatemembers.length > 0 && (
                          <div>
                            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 px-2">
                              Senate ({senatemembers.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {senatemembers.map((member) => (
                                <MemberCard key={member.bioguide_id} member={member} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function MemberCard({ member }: { member: Row }) {
  return (
    <a
      href={`/member/${member.bioguide_id}`}
      className="flex items-center gap-2 p-2 rounded-lg border border-[#E7ECF2] dark:border-white/10 bg-slate-50 dark:bg-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition"
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
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate flex items-center gap-2">
          <span>{member.full_name}</span>
          {member["Grade: Overall"] && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
              style={{ backgroundColor: gradeColor(String(member["Grade: Overall"])) }}
            >
              {member["Grade: Overall"]}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <span
            className="px-1 py-0.5 rounded text-[10px] font-medium"
            style={partyBadgeStyle(member.party)}
          >
            {partyLabel(member.party)}
          </span>
          {" "}{stateCodeOf(member.state)}
          {/* Show AIPAC/DMFI badges */}
          {isTruthy(member.aipac_supported) && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-red-900 dark:bg-red-900 text-white dark:text-white">
              AIPAC
            </span>
          )}
          {isTruthy(member.dmfi_supported) && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-blue-900 dark:bg-blue-900 text-white dark:text-white">
              DMFI
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
