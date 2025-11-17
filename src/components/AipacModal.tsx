"use client";
import { useState, useMemo, useEffect } from "react";
import clsx from "clsx";
import type { Row } from "@/lib/types";
import { MemberCard } from "@/components/MemberCard";
import { partyLabel } from "@/lib/utils";
import { loadPacData, isAipacEndorsed, isDmfiEndorsed, type PacData } from "@/lib/pacData";

interface AipacModalProps {
  rows: Row[];
  onClose: () => void;
  onMemberClick: (member: Row) => void;
}

export function AipacModal({ rows, onClose, onMemberClick }: AipacModalProps) {
  const [firstExpanded, setFirstExpanded] = useState<boolean>(false);
  const [secondExpanded, setSecondExpanded] = useState<boolean>(false);
  const [partyFilter, setPartyFilter] = useState<string>("");
  const [chamberFilter, setChamberFilter] = useState<string>("");
  const [pacDataMap, setPacDataMap] = useState<Map<string, PacData>>(new Map());

  useEffect(() => {
    loadPacData().then(setPacDataMap);
  }, []);

  // Split rows into supported and not supported
  const { supported, notSupported } = useMemo(() => {
    const supportedList: Row[] = [];
    const notSupportedList: Row[] = [];

    rows.forEach((row) => {
      const pacData = pacDataMap.get(String(row.bioguide_id));
      const hasSupport = isAipacEndorsed(pacData) || isDmfiEndorsed(pacData);
      if (hasSupport) {
        supportedList.push(row);
      } else {
        notSupportedList.push(row);
      }
    });

    return {
      supported: supportedList.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))),
      notSupported: notSupportedList.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)))
    };
  }, [rows, pacDataMap]);

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1A2235] rounded-2xl shadow-xl w-[95vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-[#E7ECF2] dark:border-slate-800">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              AIPAC & DMFI Support
            </h1>
            <div className="text-lg text-slate-700 dark:text-slate-200">
              Members of Congress who receive support from AIPAC or DMFI
            </div>
          </div>
          <button
            className="chip-outline text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
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
                              <MemberCard key={member.bioguide_id} member={member} onClick={() => onMemberClick(member)} showAipacBadges={true} />
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
                              <MemberCard key={member.bioguide_id} member={member} onClick={() => onMemberClick(member)} showAipacBadges={true} />
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
                              <MemberCard key={member.bioguide_id} member={member} onClick={() => onMemberClick(member)} showAipacBadges={true} />
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
                              <MemberCard key={member.bioguide_id} member={member} onClick={() => onMemberClick(member)} showAipacBadges={true} />
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
  );
}
