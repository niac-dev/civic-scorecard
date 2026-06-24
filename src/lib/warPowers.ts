// src/lib/warPowers.ts
// Consolidated Iran War Powers vote logic.
//
// The set of resolutions that count toward the consolidated tally is driven by
// the `war_powers_consolidated` column in scores_columns_meta.csv: any bill
// column whose meta has a truthy value there is included. Each column is filtered
// by chamber so House lawmakers only see House votes and Senate lawmakers only
// see Senate votes; a resolution with no explicit chamber (e.g. H.Con.Res.86,
// which was voted in BOTH chambers) is shown to everyone, using the
// chamber-appropriate date parsed out of vote_tallies.

import type { Row, Meta } from "./types";

export type WarPowersVoteState = "yes" | "no" | "none";

export type WarPowersVote = {
  col: string;
  shortDate: string; // compact label, e.g. "6/3"
  fullDate: string; // tooltip label, e.g. "June 3, 2026"
  sortKey: number; // timestamp for chronological ordering
};

export type WarPowersSummary = {
  votedYes: boolean; // voted yes on at least one consolidated resolution
  hasData: boolean; // cast a yes OR no on at least one (i.e. was in office to vote)
};

function truthy(v: unknown): boolean {
  if (v === true) return true;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "x";
}

// Pull the chamber-appropriate vote date out of a vote_tallies string such as
// "Passed House (215-208), June 03, 2026 | Passed Senate (50-48), June 23, 2026"
// or a single-segment "Failed Senate (47-52), April 15, 2026".
function parseChamberDate(
  tallies: string,
  chamber: "HOUSE" | "SENATE"
): { shortDate: string; fullDate: string; sortKey: number } | null {
  const segs = (tallies || "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segs.length === 0) return null;

  const wantHouse = chamber === "HOUSE";
  // Prefer the segment that names the member's chamber; otherwise fall back to a
  // segment that names neither chamber (e.g. "Failed by tie (212-212), ...").
  let seg = segs.find((s) => (wantHouse ? /\bHouse\b/i.test(s) : /\bSenate\b/i.test(s)));
  if (!seg) seg = segs.find((s) => !/\b(House|Senate)\b/i.test(s));
  if (!seg) return null;

  const m = seg.match(/([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const [, mon, day, year] = m;
  const d = new Date(`${mon} ${day}, ${year}`);
  if (isNaN(d.getTime())) return null;

  return {
    shortDate: `${d.getMonth() + 1}/${d.getDate()}`,
    fullDate: `${mon} ${Number(day)}, ${year}`,
    sortKey: d.getTime(),
  };
}

// All consolidated war-powers vote columns that apply to a chamber, sorted
// chronologically by the chamber-specific vote date.
export function consolidatedWarPowersVotes(
  metaByCol: Map<string, Meta>,
  chamber: "HOUSE" | "SENATE"
): WarPowersVote[] {
  const out: WarPowersVote[] = [];
  metaByCol.forEach((m, col) => {
    if (!truthy((m as Record<string, unknown>).war_powers_consolidated)) return;
    const mc = String(m.chamber || "").trim().toUpperCase();
    if (mc && mc !== chamber) return; // chamber-specific resolution
    const d = parseChamberDate(String(m.vote_tallies || m.vote_date || ""), chamber);
    out.push({
      col,
      shortDate: d?.shortDate ?? "",
      fullDate: d?.fullDate ?? "",
      sortKey: d?.sortKey ?? 0,
    });
  });
  return out.sort((a, b) => a.sortKey - b.sortKey);
}

// How a member voted on a single war-powers column.
// A positive score means a yea vote; 0 with no flags means a nay; an absent /
// present / not-in-office flag (or empty value) means they did not cast a vote.
export function warPowersVoteState(member: Row, col: string): WarPowersVoteState {
  const rec = member as Record<string, unknown>;
  if (Number(rec[`${col}_not_in_office`] ?? 0) === 1) return "none";
  const v = rec[col];
  if (v === null || v === undefined || v === "") return "none";
  if (Number(rec[`${col}_absent`] ?? 0) === 1) return "none";
  if (Number(rec[`${col}_present`] ?? 0) === 1) return "none";
  return Number(v) > 0 ? "yes" : "no";
}

// Roll a member's votes across the consolidated set into a single summary.
export function warPowersSummary(member: Row, votes: WarPowersVote[]): WarPowersSummary {
  let votedYes = false;
  let hasData = false;
  for (const v of votes) {
    const st = warPowersVoteState(member, v.col);
    if (st === "yes") {
      votedYes = true;
      hasData = true;
    } else if (st === "no") {
      hasData = true;
    }
  }
  return { votedYes, hasData };
}
